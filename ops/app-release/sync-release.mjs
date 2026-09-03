#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildHandoffPlan, executeHandoff } from './publish-via-host.mjs';
import { buildGitHubReleasePlan, executeGitHubRelease, formatGitHubReleasePlan } from './github-release.mjs';
import { DEFAULT_RELEASE_CONFIG, loadReleaseConfig } from './release-config.mjs';
import { appendTargetRecord, readTargetRecord } from './release-records.mjs';

const RELEASE_ROOT = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(RELEASE_ROOT, '..', '..');
const PACKAGE_PATH = join(REPO_ROOT, 'package.json');
const PHASES = ['upload-artifacts', 'verify-artifacts', 'publish-metadata', 'verify-release', 'finalize'];
const STATE_RANK = new Map([
  ['absent', 0],
  ['handed-off', 1],
  ['artifacts-uploaded', 2],
  ['artifacts-verified', 3],
  ['metadata-published', 4],
  ['release-verified', 5],
  ['finalized', 6],
]);

function usage() {
  return `Usage:
  npm run release:sync -- [--provider oss|github|all] [--channel beta|stable] [--targets all|<list>]
  npm run release:sync -- --provider oss --channel stable --targets all --execute
    --confirm sync:<app>@<version>:<channel>:oss

The command is a dry-run unless --execute is present. It consumes existing
release archives and never builds, changes versions, commits, tags, or pushes Git.`;
}

function valueAfter(argv, index, argument) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
  return value;
}

export function parseSyncArgs(argv) {
  const options = {
    provider: undefined, channel: undefined, targets: 'all', execute: false, confirm: undefined, help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') options.execute = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (['--provider', '--channel', '--targets', '--confirm'].includes(argument)) {
      const value = valueAfter(argv, index, argument);
      options[argument.slice(2)] = value;
      index += 1;
    } else throw new Error(`Unsupported argument: ${argument}\n${usage()}`);
  }
  if (options.channel && !['beta', 'stable'].includes(options.channel)) {
    throw new Error('--channel must be beta or stable');
  }
  if (options.provider && !['oss', 'github', 'all'].includes(options.provider)) {
    throw new Error('--provider must be oss, github, or all');
  }
  if (!options.execute && options.confirm) throw new Error('--confirm is only valid with --execute');
  return options;
}

export function selectProviders(config, value) {
  const names = value === 'all' || value === undefined ? config.publishProviders : [value];
  if (!Array.isArray(names) || names.length === 0) throw new Error('At least one publish provider is required');
  for (const name of names) {
    const provider = config.providers[name];
    if (!provider?.enabled) throw new Error(`Publish provider is unavailable: ${name}`);
    if (provider.implemented === false) throw new Error(`Publish provider is not implemented: ${name}`);
  }
  return [...names];
}

export function defaultChannelForVersion(version) {
  return /-beta(?:[.-]|$)/i.test(version) ? 'beta' : 'stable';
}

export function validateChannelVersion(channel, version) {
  const stable = /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/;
  const beta = /^\d+\.\d+\.\d+-beta(?:\.[0-9A-Za-z-]+)+(?:\+[0-9A-Za-z.-]+)?$/i;
  if (channel === 'stable' && !stable.test(version)) throw new Error(`Stable channel requires a stable SemVer: ${version}`);
  if (channel === 'beta' && !beta.test(version)) throw new Error(`Beta channel requires a beta SemVer: ${version}`);
}

export function selectTargets(config, value = 'all') {
  const targets = config.app.targets;
  if (!value || value.trim().toLowerCase() === 'all') return [...targets];
  const ids = [...new Set(value.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const selected = ids.map((id) => {
    const target = targets.find((candidate) => candidate.id === id);
    if (!target) throw new Error(`Unknown release target: ${id}`);
    return target;
  });
  if (selected.length === 0) throw new Error('At least one release target is required');
  return selected;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function run(binary, args, options = {}) {
  const result = spawnSync(binary, args, { encoding: 'utf8', ...options });
  if (result.error) throw new Error(`Cannot run ${binary}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(`${binary} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return (result.stdout ?? '').trim();
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function targetPaths(config, version, channel, target, releaseRoot = RELEASE_ROOT) {
  const relativeRelease = join(config.app.slug, channel, target.platform, target.arch, version);
  const archiveDirectory = join(releaseRoot, '.release-work', relativeRelease);
  return {
    archiveDirectory,
    manifestPath: join(archiveDirectory, 'release-manifest.json'),
    recordPath: join(releaseRoot, 'releases', config.app.slug, channel, version, 'prepared.json'),
    publishedPath: join(releaseRoot, 'releases', config.app.slug, channel, version, 'published.json'),
    relativeRelease: relativeRelease.split(sep).join('/'),
  };
}

function assertOssProvider(config, providerNames) {
  if (providerNames.length !== 1 || providerNames[0] !== 'oss') {
    throw new Error(`Release sync adapter is not implemented for: ${providerNames.join(',')}`);
  }
  const provider = config.providers.oss;
  if (!provider?.enabled) throw new Error('OSS provider is disabled');
  return provider;
}

async function readVersion(packagePath = PACKAGE_PATH) {
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
  if (typeof packageJson.version !== 'string') throw new Error('Root package version is missing');
  return packageJson.version;
}

async function assertPublishedReceipt(path, item) {
  const receipt = await readTargetRecord(path, {
    appSlug: item.config.app.slug,
    version: item.version,
    channel: item.channel,
    platform: item.target.platform,
    arch: item.target.arch,
    provider: 'oss',
  }, 'published-release');
  if (!receipt) return false;
  if (
    receipt.recordType !== 'published-release'
    || receipt.appSlug !== item.config.app.slug
    || receipt.version !== item.version
    || receipt.channel !== item.channel
    || receipt.target?.platform !== item.target.platform
    || receipt.target?.arch !== item.target.arch
  ) throw new Error(`Published receipt identity mismatch: ${path}`);
  const actualFiles = new Map(
    [...(receipt.artifacts ?? []), ...(receipt.metadata ?? [])]
      .map((file) => [file.publishName, file]),
  );
  const expectedFiles = item.handoff.files.filter((file) => file.kind !== 'record');
  if (actualFiles.size !== expectedFiles.length) throw new Error(`Published receipt file count mismatch: ${path}`);
  for (const expected of expectedFiles) {
    const actual = actualFiles.get(expected.remoteName);
    const key = [
      item.config.app.slug,
      item.channel,
      item.target.platform,
      item.target.arch,
      expected.remoteName,
    ].join('/');
    const publicUrl = `${item.config.providers.oss.publicBaseUrl}/${key}`;
    if (!actual || actual.sha256 !== expected.sha256 || actual.key !== key || actual.publicUrl !== publicUrl) {
      throw new Error(`Published receipt does not match ${expected.remoteName}: ${path}`);
    }
  }
  return true;
}

export async function buildSyncPlan(options, configPath = DEFAULT_RELEASE_CONFIG, runtime = {}) {
  const releaseRoot = runtime.releaseRoot ?? RELEASE_ROOT;
  const packagePath = runtime.packagePath ?? PACKAGE_PATH;
  const [config, version] = await Promise.all([loadReleaseConfig(configPath), readVersion(packagePath)]);
  const providerNames = selectProviders(config, options.provider);
  const channel = options.channel ?? defaultChannelForVersion(version);
  validateChannelVersion(channel, version);
  if (!config.app.channels.includes(channel)) throw new Error(`Channel is not configured: ${channel}`);
  const targets = selectTargets(config, options.targets);
  if (providerNames.length !== 1) {
    throw new Error(`Multi-provider sync orchestration is not implemented yet: ${providerNames.join(',')}`);
  }
  if (providerNames[0] === 'github') {
    return buildGitHubReleasePlan({
      config,
      version,
      channel,
      targets,
      pathsForTarget: (target) => targetPaths(config, version, channel, target, releaseRoot),
      configPath,
      inspect: runtime.inspectGitHub,
    });
  }
  const provider = assertOssProvider(config, providerNames);
  const items = [];
  for (const target of targets) {
    const paths = targetPaths(config, version, channel, target, releaseRoot);
    await Promise.all([access(paths.manifestPath, fsConstants.R_OK), access(paths.recordPath, fsConstants.R_OK)]);
    const handoff = await buildHandoffPlan({
      manifest: paths.manifestPath,
      registry: configPath,
      record: paths.recordPath,
      server: provider.server,
      remoteBase: provider.remoteIncomingBase,
      execute: false,
    });
    items.push({ config, version, channel, target, paths, handoff });
  }
  return {
    config,
    version,
    channel,
    providerName: 'oss',
    provider,
    confirmationToken: `sync:${config.app.slug}@${version}:${channel}:oss`,
    items,
  };
}

export function formatSyncPlan(plan) {
  if (plan.providerName === 'github') return formatGitHubReleasePlan(plan);
  const lines = [
    'CodeDoc release sync plan',
    `Release: ${plan.config.app.slug}@${plan.version}`,
    `Channel: ${plan.channel}`,
    `Provider: ${plan.providerName}`,
    `Server: ${plan.provider.server}`,
    '',
  ];
  for (const item of plan.items) {
    lines.push(`[${item.target.id}] ${item.handoff.target}`);
    for (const file of item.handoff.files) lines.push(`  ${file.kind}: ${file.remoteName}`);
  }
  lines.push('', `Execute confirmation: ${plan.confirmationToken}`);
  return lines.join('\n');
}

function remotePaths(plan, item) {
  return {
    incoming: item.handoff.remoteDirectory,
    archive: `${plan.provider.remoteArchiveBase}/${item.paths.relativeRelease}`,
    receiptName: `${item.target.platform}-${item.target.arch}.published.json`,
  };
}

export function remoteStatusCommand(plan, item) {
  const paths = remotePaths(plan, item);
  const checks = [
    `if test -f ${shellQuote(`${paths.archive}/${paths.receiptName}`)}; then printf 'finalized\\n'`,
    `elif test ! -d ${shellQuote(paths.incoming)}; then printf 'absent\\n'`,
    `elif test -f ${shellQuote(`${paths.incoming}/.release-verified.json`)}; then printf 'release-verified\\n'`,
    `elif test -f ${shellQuote(`${paths.incoming}/.metadata-published.json`)}; then printf 'metadata-published\\n'`,
    `elif test -f ${shellQuote(`${paths.incoming}/.artifacts-verified.json`)}; then printf 'artifacts-verified\\n'`,
    `elif test -f ${shellQuote(`${paths.incoming}/.artifacts-uploaded.json`)}; then printf 'artifacts-uploaded\\n'`,
    "else printf 'handed-off\\n'",
    'fi',
  ];
  return checks.join('; ');
}

function readRemoteStatus(plan, item) {
  const ssh = process.env.IDEABOX_SSH_BIN || 'ssh';
  const status = run(ssh, [plan.provider.server, remoteStatusCommand(plan, item)]);
  if (!STATE_RANK.has(status)) throw new Error(`Unknown remote release status for ${item.target.id}: ${status}`);
  return status;
}

function readRemoteStatusWithLog(plan, item, log) {
  log(`[${item.target.id}] remote status START`);
  try {
    const status = readRemoteStatus(plan, item);
    log(`[${item.target.id}] remote status SUCCESS: ${status}`);
    return status;
  } catch (error) {
    log(`[${item.target.id}] remote status FAIL: ${errorMessage(error)}`);
    throw error;
  }
}

function executeRemotePhase(plan, item, phase) {
  const ssh = process.env.IDEABOX_SSH_BIN || 'ssh';
  const remoteArguments = [
    plan.provider.remoteCommand,
    phase,
    '--release-dir',
    item.handoff.remoteDirectory,
    '--execute',
    '--confirm',
    `${phase}:${item.handoff.confirmationToken.slice('handoff:'.length)}`,
  ];
  run(ssh, [plan.provider.server, remoteArguments.map(shellQuote).join(' ')], { stdio: 'inherit' });
}

async function downloadReceipt(plan, item, log = () => {}) {
  if (await assertPublishedReceipt(item.paths.publishedPath, item)) {
    log(`[${item.target.id}] receipt SKIP: local published receipt already verified`);
    return;
  }
  const rsync = process.env.IDEABOX_RSYNC_BIN || 'rsync';
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'codedoc-published-receipt-'));
  const temporaryReceipt = join(temporaryDirectory, 'published.json');
  const paths = remotePaths(plan, item);
  try {
    log(`[${item.target.id}] receipt START: downloading ${paths.receiptName}`);
    run(rsync, [
      '--archive',
      '--checksum',
      '--',
      `${plan.provider.server}:${paths.archive}/${paths.receiptName}`,
      temporaryReceipt,
    ]);
    const receipt = JSON.parse(await readFile(temporaryReceipt, 'utf8'));
    await appendTargetRecord(item.paths.publishedPath, { ...receipt, provider: 'oss' }, 'published release');
    await assertPublishedReceipt(item.paths.publishedPath, item);
    log(`[${item.target.id}] receipt SUCCESS: ${paths.receiptName} -> ${item.paths.publishedPath}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function formatPublishedSummary(plan) {
  const lines = ['', 'Published installer URLs:'];
  for (const item of plan.items) {
    const receipt = await readTargetRecord(item.paths.publishedPath, {
      appSlug: item.config.app.slug,
      version: item.version,
      channel: item.channel,
      platform: item.target.platform,
      arch: item.target.arch,
      provider: plan.providerName,
    }, 'published-release');
    if (!receipt) throw new Error(`Published receipt is missing target ${item.target.id}`);
    const installers = receipt.artifacts.filter((artifact) => artifact.role === 'installer');
    if (installers.length === 0) throw new Error(`Published receipt has no installer URL for ${item.target.id}`);
    for (const installer of installers) lines.push(`  [${item.target.id}] ${installer.publicUrl}`);
  }
  lines.push(`Published record: ${plan.items[0].paths.publishedPath}`);
  return lines.join('\n');
}

export async function executeSync(options, configPath = DEFAULT_RELEASE_CONFIG, runtime = {}) {
  const log = runtime.log ?? (() => {});
  const plan = await buildSyncPlan(options, configPath, runtime);
  const formatted = formatSyncPlan(plan);
  if (!options.execute) return `${formatted}\n\nDRY RUN: no server or cloud writes were performed.`;
  if (options.confirm !== plan.confirmationToken) {
    throw new Error(`Release sync requires --confirm ${plan.confirmationToken}`);
  }
  if (plan.providerName === 'github') {
    if (!plan.provider.writeEnabled) throw new Error('GitHub Release writes are disabled by configuration');
    return executeGitHubRelease(plan, {
      log,
      runCommand: runtime.runGitHubCommand,
      inspectGitHub: runtime.inspectGitHub,
    });
  }

  log(formatted);
  log(`[sync] START: ${plan.config.app.slug}@${plan.version} ${plan.channel} via ${plan.providerName}`);

  for (const item of plan.items) {
    if (await assertPublishedReceipt(item.paths.publishedPath, item)) {
      log(`[${item.target.id}] handoff SKIP: local published receipt already verified`);
      continue;
    }
    const status = readRemoteStatusWithLog(plan, item, log);
    if (status === 'absent') {
      log(`[${item.target.id}] handoff START`);
      try {
        await executeHandoff({
          manifest: item.paths.manifestPath,
          registry: configPath,
          record: item.paths.recordPath,
          server: plan.provider.server,
          remoteBase: plan.provider.remoteIncomingBase,
          execute: true,
          confirm: item.handoff.confirmationToken,
          log,
        });
        log(`[${item.target.id}] handoff SUCCESS`);
      } catch (error) {
        log(`[${item.target.id}] handoff FAIL: ${errorMessage(error)}`);
        throw error;
      }
    } else {
      log(`[${item.target.id}] handoff SKIP: remote state is ${status}`);
    }
  }

  for (const phase of PHASES) {
    log(`[sync] phase START: ${phase}`);
    const requiredRank = phase === 'finalize' ? STATE_RANK.get('finalized') : STATE_RANK.get({
      'upload-artifacts': 'artifacts-uploaded',
      'verify-artifacts': 'artifacts-verified',
      'publish-metadata': 'metadata-published',
      'verify-release': 'release-verified',
    }[phase]);
    for (const item of plan.items) {
      if (await assertPublishedReceipt(item.paths.publishedPath, item)) {
        log(`[${item.target.id}] ${phase} SKIP: local published receipt already verified`);
        continue;
      }
      const status = readRemoteStatusWithLog(plan, item, log);
      if (STATE_RANK.get(status) >= requiredRank) {
        log(`[${item.target.id}] ${phase} SKIP: remote state is ${status}`);
        continue;
      }
      log(`[${item.target.id}] ${phase} START`);
      try {
        executeRemotePhase(plan, item, phase);
        log(`[${item.target.id}] ${phase} SUCCESS`);
      } catch (error) {
        log(`[${item.target.id}] ${phase} FAIL: ${errorMessage(error)}`);
        throw error;
      }
    }
    log(`[sync] phase SUCCESS: ${phase}`);
  }

  log('[sync] phase START: download-receipts');
  for (const item of plan.items) {
    try {
      await downloadReceipt(plan, item, log);
    } catch (error) {
      log(`[${item.target.id}] receipt FAIL: ${errorMessage(error)}`);
      throw error;
    }
  }
  log('[sync] phase SUCCESS: download-receipts');
  log(await formatPublishedSummary(plan));
  log(`[sync] SUCCESS: ${plan.config.app.slug}@${plan.version} ${plan.channel}`);
  return 'Release sync completed.';
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseSyncArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const log = (message) => process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
  process.stdout.write(`${await executeSync(options, DEFAULT_RELEASE_CONFIG, { log })}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
