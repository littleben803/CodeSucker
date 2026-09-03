import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

import { buildValidatedTargetPlan } from './publish-via-host.mjs';
import { appendTargetRecord, readTargetRecord } from './release-records.mjs';

function scalar(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1).replaceAll("''", "'");
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return JSON.parse(trimmed);
  return trimmed;
}

function parseMetadata(text, fileName) {
  const result = { version: undefined, releaseDate: undefined, files: [] };
  let current;
  let inFiles = false;
  for (const line of text.split(/\r?\n/)) {
    const topLevel = line.match(/^(version|releaseDate):\s*(.+)$/);
    if (topLevel) {
      result[topLevel[1]] = scalar(topLevel[2]);
      inFiles = false;
      current = undefined;
      continue;
    }
    if (/^files:\s*$/.test(line)) {
      inFiles = true;
      continue;
    }
    if (!inFiles) continue;
    const first = line.match(/^\s{2}-\s+url:\s*(.+)$/);
    if (first) {
      current = { url: scalar(first[1]) };
      result.files.push(current);
      continue;
    }
    const property = line.match(/^\s{4}(sha512|size):\s*(.+)$/);
    if (current && property) {
      current[property[1]] = property[1] === 'size' ? Number(scalar(property[2])) : scalar(property[2]);
    } else if (/^\S/.test(line)) {
      inFiles = false;
      current = undefined;
    }
  }
  if (!result.version || result.files.length === 0) throw new Error(`Cannot parse electron-builder metadata: ${fileName}`);
  for (const file of result.files) {
    if (!file.url || !file.sha512 || !Number.isSafeInteger(file.size) || file.size <= 0) {
      throw new Error(`Incomplete file entry in electron-builder metadata: ${fileName}`);
    }
  }
  return result;
}

function quoteYaml(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function renderMetadata(version, files, releaseDate) {
  const primary = files.find((file) => file.url.endsWith('.zip')) ?? files[0];
  const lines = [`version: ${version}`, 'files:'];
  for (const file of files) {
    lines.push(`  - url: ${file.url}`, `    sha512: ${file.sha512}`, `    size: ${file.size}`);
  }
  lines.push(`path: ${primary.url}`, `sha512: ${primary.sha512}`);
  if (releaseDate) lines.push(`releaseDate: ${quoteYaml(releaseDate)}`);
  return `${lines.join('\n')}\n`;
}

async function hashFile(algorithm, filePath, encoding) {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest(encoding);
}

function contentAttachment(name, role, content) {
  return {
    kind: 'metadata',
    role,
    name,
    content,
    size: Buffer.byteLength(content),
    sha256: createHash('sha256').update(content).digest('hex'),
  };
}

export async function buildGitHubMetadata(version, channel, targetPlans) {
  const macPlans = targetPlans.filter((item) => item.target.platform === 'mac');
  const metadata = [];
  if (macPlans.length > 0) {
    const parsed = await Promise.all(macPlans.map(async (item) => {
      const pointer = item.plan.metadata.find((entry) => entry.publishName === 'latest-mac.yml');
      if (!pointer) throw new Error(`Missing latest-mac.yml for ${item.target.id}`);
      return parseMetadata(await readFile(pointer.localPath, 'utf8'), pointer.localPath);
    }));
    if (parsed.some((entry) => entry.version !== version)) throw new Error('macOS metadata versions do not match the release');
    const files = parsed.flatMap((entry) => entry.files).sort((left, right) => left.url.localeCompare(right.url));
    if (new Set(files.map((file) => file.url)).size !== files.length) throw new Error('Duplicate file in aggregated macOS metadata');
    const releaseDate = parsed.map((entry) => entry.releaseDate).filter(Boolean).sort().at(-1);
    const content = renderMetadata(version, files, releaseDate);
    metadata.push(contentAttachment('latest-mac.yml', 'mac-update', content));
    if (channel === 'beta') metadata.push(contentAttachment('beta-mac.yml', 'mac-update-channel', content));
  }

  const windowsPlan = targetPlans.find((item) => item.target.platform === 'win');
  if (windowsPlan) {
    const installer = windowsPlan.plan.artifacts.find((entry) => entry.role === 'installer');
    if (!installer) throw new Error(`Missing Windows installer for ${windowsPlan.target.id}`);
    const sha512 = await hashFile('sha512', installer.localPath, 'base64');
    const content = renderMetadata(version, [{ url: installer.publishName, sha512, size: installer.size }]);
    metadata.push(contentAttachment('latest-win.yml', 'windows-version', content));
  }
  return metadata;
}

function runGh(args, { allowFailure = false } = {}) {
  const result = spawnSync(process.env.IDEABOX_GH_BIN || 'gh', args, { encoding: 'utf8' });
  if (result.error) throw new Error(`Cannot run GitHub CLI: ${result.error.message}`);
  if (result.status !== 0 && !allowFailure) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(`GitHub CLI failed${detail ? `: ${detail}` : ''}`);
  }
  return { status: result.status, stdout: (result.stdout ?? '').trim(), stderr: (result.stderr ?? '').trim() };
}

export function inspectGitHubRelease(provider, tag, expectedCommit, options = {}) {
  const skipAccessChecks = options.skipAccessChecks === true;
  const repository = `${provider.owner}/${provider.repo}`;
  let permission;
  let commit = expectedCommit;
  if (!skipAccessChecks) {
    runGh(['auth', 'status', '--hostname', 'github.com']);
    const repoInfo = JSON.parse(runGh(['repo', 'view', repository, '--json', 'nameWithOwner,viewerPermission,isPrivate']).stdout);
    if (repoInfo.nameWithOwner.toLowerCase() !== repository.toLowerCase()) throw new Error('GitHub repository identity mismatch');
    if (!['ADMIN', 'MAINTAIN', 'WRITE'].includes(repoInfo.viewerPermission)) {
      throw new Error(`GitHub repository write permission is required; current permission is ${repoInfo.viewerPermission}`);
    }
    permission = repoInfo.viewerPermission;
    const remoteCommit = runGh(['api', `repos/${repository}/commits/${tag}`, '--jq', '.sha'], { allowFailure: true });
    if (remoteCommit.status !== 0) {
      if (/(?:HTTP\s+(?:404|422)|not found|no commit found)/i.test(remoteCommit.stderr)) {
        throw new Error(`Remote Git tag is missing: ${tag}`);
      }
      throw new Error(`Cannot inspect remote Git tag ${tag}: ${remoteCommit.stderr || 'GitHub CLI failed'}`);
    }
    if (remoteCommit.stdout !== expectedCommit) {
      throw new Error(`Remote Git tag ${tag} points to ${remoteCommit.stdout}, expected ${expectedCommit}`);
    }
    commit = remoteCommit.stdout;
  }
  // GitHub's REST "release by tag" endpoint does not return draft releases.
  // `gh release view` resolves drafts for an authenticated maintainer, which is
  // required when an interrupted publish is resumed after its assets uploaded.
  const release = runGh([
    'release', 'view', tag,
    '--repo', repository,
    '--json', 'isDraft,isPrerelease,url,assets',
  ], { allowFailure: true });
  let releaseState = 'absent';
  let releaseInfo = null;
  if (release.status === 0) {
    const value = JSON.parse(release.stdout);
    releaseState = value.isDraft ? 'draft' : 'published';
    releaseInfo = {
      prerelease: value.isPrerelease === true,
      url: value.url,
      assets: (value.assets ?? []).map((asset) => ({
        name: asset.name,
        size: asset.size,
        digest: asset.digest,
        state: asset.state,
        publicUrl: asset.url,
      })),
    };
  } else if (!/(?:HTTP\s+404|not found|release not found)/i.test(`${release.stdout}\n${release.stderr}`)) {
    throw new Error(`Cannot inspect GitHub Release ${tag}: ${release.stderr || 'GitHub CLI failed'}`);
  }
  return {
    repository, permission, tag, commit, releaseState, releaseInfo,
  };
}

export async function buildGitHubReleasePlan({ config, version, channel, targets, pathsForTarget, configPath, inspect }) {
  const provider = config.providers.github;
  const targetPlans = [];
  for (const target of targets) {
    const paths = pathsForTarget(target);
    const validated = await buildValidatedTargetPlan({
      manifest: paths.manifestPath,
      registry: configPath,
      record: paths.recordPath,
    });
    targetPlans.push({ target, paths, plan: validated.checklist.plan, record: validated.record });
  }
  const commits = [...new Set(targetPlans.map((item) => item.record.source.commit))];
  if (commits.length !== 1) throw new Error(`GitHub Release requires all targets from one source commit; found ${commits.join(', ')}`);
  const tag = `${provider.tagPrefix}${version}`;
  const preflight = (inspect ?? inspectGitHubRelease)(provider, tag, commits[0]);
  if (preflight.releaseState === 'draft' && preflight.releaseInfo?.prerelease !== (channel === 'beta')) {
    throw new Error(`Existing GitHub draft release type does not match channel: ${tag}`);
  }

  const artifacts = targetPlans.flatMap((item) => item.plan.artifacts.map((entry) => ({
    kind: 'artifact',
    role: entry.role,
    targetId: item.target.id,
    name: entry.publishName,
    localPath: entry.localPath,
    size: entry.size,
    sha256: entry.sha256,
  })));
  const names = artifacts.map((entry) => entry.name);
  if (new Set(names).size !== names.length) throw new Error('GitHub Release artifact names must be unique');
  const metadata = await buildGitHubMetadata(version, channel, targetPlans);
  const downloadUrl = (name) => `${provider.publicBaseUrl}/${tag}/${encodeURIComponent(name)}`;
  const attachments = [...artifacts, ...metadata].map((entry) => ({ ...entry, publicUrl: downloadUrl(entry.name) }));
  const existingAssets = new Map((preflight.releaseInfo?.assets ?? []).map((asset) => [asset.name, asset]));
  const plannedNames = new Set(attachments.map((entry) => entry.name));
  const unexpected = [...existingAssets.keys()].filter((name) => !plannedNames.has(name));
  if (unexpected.length > 0) throw new Error(`GitHub draft contains unexpected assets: ${unexpected.join(', ')}`);
  for (const attachment of attachments) {
    const existing = existingAssets.get(attachment.name);
    if (!existing) {
      attachment.uploadStatus = 'pending';
      continue;
    }
    if (existing.state !== 'uploaded' || existing.size !== attachment.size || existing.digest !== `sha256:${attachment.sha256}`) {
      throw new Error(`GitHub draft asset conflicts with local file: ${attachment.name}`);
    }
    attachment.uploadStatus = 'verified-existing';
  }
  return {
    config,
    version,
    channel,
    providerName: 'github',
    provider,
    tag,
    prerelease: channel === 'beta',
    sourceCommit: commits[0],
    preflight,
    targetPlans,
    attachments,
    installerUrls: artifacts.filter((entry) => entry.role === 'installer').map((entry) => ({
      targetId: entry.targetId,
      url: downloadUrl(entry.name),
    })),
    confirmationToken: `sync:${config.app.slug}@${version}:${channel}:github`,
    publishedPath: targetPlans[0]?.paths.publishedPath,
  };
}

export function formatGitHubReleasePlan(plan) {
  const lines = [
    'CodeDoc release sync plan',
    `Release: ${plan.config.app.slug}@${plan.version}`,
    `Channel: ${plan.channel}`,
    'Provider: github',
    `Repository: ${plan.preflight.repository}`,
    `Tag: ${plan.tag} -> ${plan.sourceCommit}`,
    `Release state: ${plan.preflight.releaseState}`,
    `Release type: ${plan.prerelease ? 'prerelease' : 'stable'}`,
    '',
  ];
  for (const [index, attachment] of plan.attachments.entries()) {
    lines.push(`[${index + 1}/${plan.attachments.length}] ${attachment.kind}: ${attachment.name} (${attachment.uploadStatus})`);
    lines.push(`  ${attachment.size} bytes sha256=${attachment.sha256}`);
    lines.push(`  -> ${attachment.publicUrl}`);
  }
  lines.push('', 'Installer URL preview:');
  for (const installer of plan.installerUrls) lines.push(`  [${installer.targetId}] ${installer.url}`);
  lines.push(`Published record: ${plan.publishedPath}`, '', `Execute confirmation: ${plan.confirmationToken}`);
  return lines.join('\n');
}

function runGhLive(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.IDEABOX_GH_BIN || 'gh', args, { stdio: 'inherit' });
    child.once('error', (error) => reject(new Error(`Cannot run GitHub CLI: ${error.message}`)));
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`GitHub CLI failed with ${signal ? `signal ${signal}` : `exit ${code}`}`));
    });
  });
}

function percent(completed, total) {
  return total === 0 ? '100.0' : ((completed / total) * 100).toFixed(1);
}

function publishedFile(attachment, tag) {
  return {
    role: attachment.role,
    publishName: attachment.name,
    key: `${tag}/${attachment.name}`,
    publicUrl: attachment.publicUrl,
    size: attachment.size,
    sha256: attachment.sha256,
  };
}

function metadataForTarget(plan, targetId) {
  const target = plan.targetPlans.find((entry) => entry.target.id === targetId)?.target;
  return plan.attachments.filter((attachment) => (
    attachment.kind === 'metadata'
    && ((target?.platform === 'mac' && ['latest-mac.yml', 'beta-mac.yml'].includes(attachment.name))
      || (target?.platform === 'win' && attachment.name === 'latest-win.yml'))
  ));
}

function createGitHubReceipt(plan, targetPlan, releaseUrl, publishedAt = new Date().toISOString()) {
  const artifacts = plan.attachments.filter((attachment) => (
    attachment.kind === 'artifact' && attachment.targetId === targetPlan.target.id
  ));
  return {
    releaseRecordVersion: 1,
    recordType: 'published-release',
    provider: 'github',
    recordedAt: publishedAt,
    releaseContractVersion: targetPlan.record.releaseContractVersion,
    appSlug: plan.config.app.slug,
    version: plan.version,
    channel: plan.channel,
    target: { platform: targetPlan.target.platform, arch: targetPlan.target.arch },
    distributionMode: targetPlan.record.distributionMode,
    source: targetPlan.record.source,
    release: {
      repository: plan.preflight.repository,
      tag: plan.tag,
      url: releaseUrl,
      prerelease: plan.prerelease,
    },
    artifacts: artifacts.map((attachment) => publishedFile(attachment, plan.tag)),
    metadata: metadataForTarget(plan, targetPlan.target.id).map((attachment) => publishedFile(attachment, plan.tag)),
  };
}

function assertVerifiedAssets(plan, inspected) {
  if (inspected.releaseState === 'absent') throw new Error(`GitHub Release disappeared during verification: ${plan.tag}`);
  const remote = new Map((inspected.releaseInfo?.assets ?? []).map((asset) => [asset.name, asset]));
  for (const attachment of plan.attachments) {
    const asset = remote.get(attachment.name);
    if (!asset || asset.state !== 'uploaded' || asset.size !== attachment.size || asset.digest !== `sha256:${attachment.sha256}`) {
      throw new Error(`GitHub asset verification failed: ${attachment.name}`);
    }
  }
  if (remote.size !== plan.attachments.length) throw new Error('GitHub Release contains unexpected assets after upload');
}

export async function executeGitHubRelease(plan, runtime = {}) {
  const log = runtime.log ?? (() => {});
  const command = runtime.runCommand ?? runGhLive;
  const inspect = runtime.inspectGitHub ?? inspectGitHubRelease;
  const repository = plan.preflight.repository;
  if (plan.preflight.releaseState === 'absent') {
    const args = [
      'release', 'create', plan.tag,
      '--repo', repository,
      '--draft',
      '--verify-tag',
      '--title', `CodeDoc ${plan.version}`,
      '--notes', `CodeDoc ${plan.version} ${plan.channel} release.`,
    ];
    if (plan.prerelease) args.push('--prerelease', '--latest=false');
    log(`[github] draft START: ${plan.tag}`);
    await command(args);
    log(`[github] draft SUCCESS: ${plan.tag}`);
  } else {
    log(`[github] draft SKIP: release state is ${plan.preflight.releaseState}`);
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'codedoc-github-release-'));
  const totalBytes = plan.attachments.reduce((sum, attachment) => sum + attachment.size, 0);
  let completedBytes = plan.attachments
    .filter((attachment) => attachment.uploadStatus === 'verified-existing')
    .reduce((sum, attachment) => sum + attachment.size, 0);
  try {
    for (const [index, attachment] of plan.attachments.entries()) {
      if (attachment.uploadStatus === 'verified-existing') {
        log(`[github] upload ${index + 1}/${plan.attachments.length} SKIP: ${attachment.name} (verified existing)`);
        continue;
      }
      const uploadPath = attachment.localPath ?? join(temporaryDirectory, attachment.name);
      if (!attachment.localPath) await writeFile(uploadPath, attachment.content, { mode: 0o600 });
      log(`[github] upload ${index + 1}/${plan.attachments.length} START: ${attachment.name} (${attachment.size} bytes, overall ${percent(completedBytes, totalBytes)}%)`);
      const startedAt = Date.now();
      const heartbeat = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAt) / 1000);
        log(`[github] upload ${index + 1}/${plan.attachments.length} ACTIVE: ${attachment.name} (${seconds}s elapsed, ${attachment.size} bytes)`);
      }, 5000);
      try {
        await command(['release', 'upload', plan.tag, uploadPath, '--repo', repository]);
      } finally {
        clearInterval(heartbeat);
      }
      completedBytes += attachment.size;
      log(`[github] upload ${index + 1}/${plan.attachments.length} SUCCESS: ${attachment.name} (overall ${percent(completedBytes, totalBytes)}%)`);
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }

  log('[github] verify-assets START');
  const draft = inspect(plan.provider, plan.tag, plan.sourceCommit, { skipAccessChecks: true });
  assertVerifiedAssets(plan, draft);
  log(`[github] verify-assets SUCCESS: ${plan.attachments.length}/${plan.attachments.length}`);

  let published = draft;
  if (draft.releaseState === 'draft') {
    const args = ['release', 'edit', plan.tag, '--repo', repository, '--draft=false'];
    if (plan.prerelease) args.push('--prerelease', '--latest=false');
    else args.push('--latest');
    log(`[github] publish START: ${plan.tag}`);
    await command(args);
    published = inspect(plan.provider, plan.tag, plan.sourceCommit, { skipAccessChecks: true });
    if (published.releaseState !== 'published') throw new Error(`GitHub Release was not published: ${plan.tag}`);
    assertVerifiedAssets(plan, published);
    log(`[github] publish SUCCESS: ${published.releaseInfo.url}`);
  } else {
    log(`[github] publish SKIP: release is already published`);
  }

  log('[github] receipts START');
  for (const targetPlan of plan.targetPlans) {
    const identity = {
      appSlug: plan.config.app.slug,
      version: plan.version,
      channel: plan.channel,
      platform: targetPlan.target.platform,
      arch: targetPlan.target.arch,
      provider: 'github',
    };
    if (await readTargetRecord(targetPlan.paths.publishedPath, identity, 'published-release')) {
      log(`[${targetPlan.target.id}] receipt SKIP: GitHub receipt already exists`);
      continue;
    }
    await appendTargetRecord(
      targetPlan.paths.publishedPath,
      createGitHubReceipt(plan, targetPlan, published.releaseInfo.url),
      'published release',
    );
    log(`[${targetPlan.target.id}] receipt SUCCESS: ${targetPlan.paths.publishedPath}`);
  }
  log('[github] receipts SUCCESS');
  log('Published installer URLs:');
  for (const installer of plan.installerUrls) log(`  [${installer.targetId}] ${installer.url}`);
  log(`Published record: ${plan.publishedPath}`);
  log(`[sync] SUCCESS: ${plan.config.app.slug}@${plan.version} ${plan.channel} via github`);
  return 'Release sync completed.';
}
