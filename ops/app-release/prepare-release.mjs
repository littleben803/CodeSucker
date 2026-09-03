#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import { access, copyFile, mkdir, open, readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPlan } from './release.mjs';
import { DEFAULT_RELEASE_CONFIG } from './release-config.mjs';
import { appendTargetRecord } from './release-records.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY = DEFAULT_RELEASE_CONFIG;
const DEFAULT_RECORDS_DIR = join(SCRIPT_DIR, 'releases');
const DEFAULT_WORK_DIR = join(SCRIPT_DIR, '.release-work');
const COMMANDS = new Set(['stage', 'checklist', 'record']);
const COMMIT_PATTERN = /^[a-f0-9]{7,40}$/i;
const TAG_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._/-]*$/;
const REPOSITORY_PATTERN = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;
const BUNDLE_ID_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SECRET_FIELD_PATTERN = /(?:access.?key|secret|password|token|private.?key|credential)/i;

function usage() {
  return `Usage:
  node prepare-release.mjs stage --manifest <file> [--registry <file>] [--output-dir <directory>]
  node prepare-release.mjs checklist --manifest <file> [--registry <file>] [--json]
  node prepare-release.mjs record --manifest <file> [--registry <file>] [--output <file>]

The checklist is read-only. The record command writes a Git-safe release record
without local paths or credentials and refuses to overwrite an existing record.`;
}

export function parsePrepareArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) {
    throw new Error(`Unknown or missing command.\n${usage()}`);
  }

  const options = { command, json: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--json') {
      options.json = true;
    } else if (['--manifest', '--registry', '--output', '--output-dir'].includes(argument)) {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      const key = argument === '--output-dir' ? 'outputDirectory' : argument.slice(2);
      options[key] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${argument}`);
    }
  }

  if (!options.manifest) {
    throw new Error('--manifest is required');
  }
  if (command === 'checklist' && options.output) {
    throw new Error('checklist does not accept --output');
  }
  if (command !== 'stage' && options.outputDirectory) {
    throw new Error('--output-dir is only valid for stage');
  }
  if (command === 'stage' && options.output) {
    throw new Error('stage uses --output-dir, not --output');
  }
  return options;
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label} ${filePath}: ${error.message}`);
  }
}

function assertNoSecretFields(value, path = 'manifest') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoSecretFields(entry, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD_PATTERN.test(key)) {
      throw new Error(`${path}.${key} is forbidden because release manifests and records cannot contain credentials`);
    }
    assertNoSecretFields(child, `${path}.${key}`);
  }
}

function requireString(value, label, pattern) {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is missing or invalid`);
  }
  return value;
}

function gitRevision(repositoryPath, revision) {
  const result = spawnSync('git', ['-C', repositoryPath, 'rev-parse', '--verify', `${revision}^{commit}`], { encoding: 'utf8' });
  if (result.error) {
    throw new Error(`Cannot run git for source verification: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(`Cannot verify source revision ${revision}${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
}

function validateSource(manifest, manifestPath) {
  const source = manifest.source;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('manifest.source is required for a Git release record');
  }
  const repositoryPathValue = requireString(source.repositoryPath, 'source.repositoryPath');
  const repositoryPath = isAbsolute(repositoryPathValue)
    ? repositoryPathValue
    : resolve(dirname(manifestPath), repositoryPathValue);
  const recordSource = {
    repository: requireString(source.repository, 'source.repository', REPOSITORY_PATTERN),
    commit: requireString(source.commit, 'source.commit', COMMIT_PATTERN),
  };
  const commit = gitRevision(repositoryPath, recordSource.commit);
  if (source.tag !== undefined) {
    recordSource.tag = requireString(source.tag, 'source.tag', TAG_PATTERN);
    const tagCommit = gitRevision(repositoryPath, recordSource.tag);
    if (commit !== tagCommit) {
      throw new Error(`source.tag ${recordSource.tag} does not point to source.commit ${recordSource.commit}`);
    }
  }
  return { recordSource: { ...recordSource, commit }, repositoryPath };
}

function validateVerification(manifest, plan) {
  const verification = manifest.verification;
  if (!verification || typeof verification !== 'object' || Array.isArray(verification)) {
    throw new Error('manifest.verification is required for a formal release record');
  }
  if (verification.releaseBuild !== 'passed') {
    throw new Error('verification.releaseBuild must be passed');
  }
  const result = {
    releaseBuild: 'passed',
  };
  const warnings = [];

  if (plan.distributionMode === 'internal-download') {
    if (!['passed', 'not-required-internal'].includes(verification.signing)) {
      throw new Error('internal-download verification.signing must be passed or not-required-internal');
    }
    result.signing = verification.signing;
    result.distributionMode = 'internal-download';
    return { verification: result, warnings };
  }

  if (verification.signing !== 'passed') {
    throw new Error('verification.signing must be passed');
  }
  result.signing = 'passed';

  if (manifest.target?.platform === 'mac') {
    result.bundleId = requireString(verification.bundleId, 'verification.bundleId', BUNDLE_ID_PATTERN);
    if (verification.notarization !== 'accepted') {
      throw new Error('verification.notarization must be accepted for mac releases');
    }
    result.notarization = 'accepted';
    result.notarizationSubmissionId = requireString(
      verification.notarizationSubmissionId,
      'verification.notarizationSubmissionId',
      UUID_PATTERN,
    );
    if (!['passed', 'disabled-warning'].includes(verification.gatekeeper)) {
      throw new Error('verification.gatekeeper must be passed or disabled-warning for mac releases');
    }
    result.gatekeeper = verification.gatekeeper;
    if (verification.gatekeeper === 'disabled-warning') {
      warnings.push('Gatekeeper was disabled on the verification machine; repeat Gatekeeper acceptance before end-to-end release approval.');
    }
  }

  return { verification: result, warnings };
}

export async function buildChecklist(manifestPath, registryPath = DEFAULT_REGISTRY) {
  const absoluteManifest = resolve(manifestPath);
  const manifest = await readJson(absoluteManifest, 'manifest');
  assertNoSecretFields(manifest);
  const { recordSource: source } = validateSource(manifest, absoluteManifest);
  const plan = await buildPlan(absoluteManifest, registryPath);
  const { verification, warnings } = validateVerification(manifest, plan);

  const checks = [
    { id: 'registered-target', status: 'passed', detail: `${plan.appSlug}/${plan.channel}/${plan.platform}/${plan.arch}` },
    { id: 'versioned-artifacts', status: 'passed', detail: `${plan.artifacts.length} immutable artifacts` },
    {
      id: 'metadata-reference',
      status: 'passed',
      detail: plan.distributionMode === 'app-update'
        ? `${plan.metadata.length} validated metadata file(s)`
        : 'not applicable for internal-download target',
    },
    { id: 'artifact-hashes', status: 'passed', detail: 'SHA-256 calculated for every file' },
    {
      id: 'source-revision',
      status: 'passed',
      detail: `${source.repository}@${source.commit} (${source.tag ?? 'commit-only'}, Git verified)`,
    },
    { id: 'release-verification', status: 'passed', detail: `${plan.platform} release evidence accepted` },
  ];

  return {
    status: warnings.length === 0 ? 'passed' : 'warning',
    plan,
    source,
    verification,
    checks,
    warnings,
  };
}

export function defaultRecordPath(plan, recordsDirectory = DEFAULT_RECORDS_DIR) {
  return join(recordsDirectory, plan.appSlug, plan.channel, plan.version, 'prepared.json');
}

export function defaultStageDirectory(plan, workDirectory = DEFAULT_WORK_DIR) {
  return join(workDirectory, plan.appSlug, plan.channel, plan.platform, plan.arch, plan.version);
}

async function writeJsonExclusive(filePath, value, label) {
  let handle;
  try {
    handle = await open(filePath, 'wx', 0o644);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`Refusing to overwrite existing ${label}: ${filePath}`);
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

export async function stageRelease(manifestPath, registryPath = DEFAULT_REGISTRY, outputDirectory) {
  const checklist = await buildChecklist(manifestPath, registryPath);
  const manifest = await readJson(resolve(manifestPath), 'manifest');
  const directory = resolve(outputDirectory ?? defaultStageDirectory(checklist.plan));
  const filesDirectory = join(directory, 'files');
  const stagedManifestPath = join(directory, 'release-manifest.json');
  await mkdir(filesDirectory, { recursive: true });

  const stageEntries = async (entries, plannedItems) => Promise.all(entries.map(async (entry, index) => {
    const item = plannedItems[index];
    const destination = join(filesDirectory, item.publishName);
    try {
      await copyFile(item.localPath, destination, fsConstants.COPYFILE_EXCL | fsConstants.COPYFILE_FICLONE);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`Refusing to overwrite staged file: ${destination}`);
      }
      throw error;
    }
    return { ...entry, path: `files/${item.publishName}` };
  }));

  const stagedManifest = {
    ...manifest,
    artifacts: await stageEntries(manifest.artifacts, checklist.plan.artifacts),
    metadata: await stageEntries(manifest.metadata, checklist.plan.metadata),
  };
  await writeJsonExclusive(stagedManifestPath, stagedManifest, 'staged manifest');
  const stagedChecklist = await buildChecklist(stagedManifestPath, registryPath);
  return { directory, manifestPath: stagedManifestPath, checklist: stagedChecklist };
}

export function createReleaseRecord(checklist, recordedAt = new Date().toISOString()) {
  const { plan } = checklist;
  const publicFile = (item) => ({
    role: item.role,
    publishName: item.publishName,
    key: item.key,
    publicUrl: item.publicUrl,
    size: item.size,
    sha256: item.sha256,
    ...(item.referencedByMetadata ? { referencedByMetadata: true } : {}),
  });

  return {
    releaseRecordVersion: 1,
    recordType: 'prepared-release',
    recordedAt,
    releaseContractVersion: plan.releaseContractVersion,
    appSlug: plan.appSlug,
    version: plan.version,
    channel: plan.channel,
    target: { platform: plan.platform, arch: plan.arch },
    distributionMode: plan.distributionMode,
    source: checklist.source,
    verification: checklist.verification,
    confirmationToken: plan.confirmationToken,
    artifacts: plan.artifacts.map(publicFile),
    metadata: plan.metadata.map(publicFile),
    checklist: {
      status: checklist.status,
      checks: checklist.checks,
      warnings: checklist.warnings,
    },
  };
}

export async function writeReleaseRecord(checklist, outputPath) {
  const absoluteOutput = resolve(outputPath ?? defaultRecordPath(checklist.plan));
  return appendTargetRecord(absoluteOutput, createReleaseRecord(checklist), 'prepared release');
}

function formatChecklist(checklist) {
  const lines = [
    `Release checklist: ${checklist.plan.release}`,
    `Target: ${checklist.plan.target}`,
    `Status: ${checklist.status.toUpperCase()}`,
    '',
  ];
  for (const check of checklist.checks) {
    lines.push(`[PASS] ${check.id}: ${check.detail}`);
  }
  for (const warning of checklist.warnings) {
    lines.push(`[WARN] ${warning}`);
  }
  return lines.join('\n');
}

async function main() {
  try {
    await access(DEFAULT_REGISTRY, fsConstants.R_OK);
    const options = parsePrepareArgs(process.argv.slice(2));
    if (options.command === 'stage') {
      const staged = await stageRelease(options.manifest, options.registry ?? DEFAULT_REGISTRY, options.outputDirectory);
      process.stdout.write(`Release staged: ${staged.directory}\nStaged manifest: ${staged.manifestPath}\n`);
      return;
    }
    const checklist = await buildChecklist(options.manifest, options.registry ?? DEFAULT_REGISTRY);
    if (options.command === 'checklist') {
      process.stdout.write(`${options.json ? JSON.stringify(checklist, null, 2) : formatChecklist(checklist)}\n`);
      return;
    }
    const output = await writeReleaseRecord(checklist, options.output);
    process.stdout.write(`Release record created: ${output}\n`);
  } catch (error) {
    process.stderr.write(`ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
