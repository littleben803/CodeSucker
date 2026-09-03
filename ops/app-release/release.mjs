#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEFAULT_RELEASE_CONFIG, loadReleaseRegistry } from './release-config.mjs';
import { createTerminalUi } from './terminal-ui.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY = DEFAULT_RELEASE_CONFIG;
const COMMANDS = new Set(['plan', 'upload-artifacts', 'publish-metadata']);
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_VERSION = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/;
const NOT_FOUND_MARKERS = /(?:NoSuchKey|StatusCode\s*[=:]\s*404|status code\s*[=:]?\s*404|\b404\s+Not Found\b)/i;
const ARTIFACT_ROLES = new Set(['installer', 'updater', 'blockmap', 'signature', 'auxiliary']);

function usage() {
  return `Usage:
  node release.mjs plan --manifest <file> [--registry <file>] [--json]
  node release.mjs upload-artifacts --manifest <file> [--registry <file>] [--execute]
  node release.mjs publish-metadata --manifest <file> [--registry <file>] [--execute] [--confirm <token>]

Cloud writes are disabled unless --execute is present. The confirmation token is
printed by plan and must be supplied when publishing metadata.`;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) {
    throw new Error(`Unknown or missing command.\n${usage()}`);
  }

  const options = { command, execute: false, json: false };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--execute') {
      options.execute = true;
    } else if (argument === '--json') {
      options.json = true;
    } else if (['--manifest', '--registry', '--confirm'].includes(argument)) {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      options[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${argument}`);
    }
  }

  if (!options.manifest) {
    throw new Error('--manifest is required');
  }
  if (command === 'plan' && options.execute) {
    throw new Error('plan never accepts --execute');
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

function assertSafeSegment(value, label) {
  if (typeof value !== 'string' || !SAFE_SEGMENT.test(value)) {
    throw new Error(`${label} must use lowercase letters, digits, and hyphens only`);
  }
}

function assertPlainFileName(value, label) {
  if (typeof value !== 'string' || value.length === 0 || basename(value) !== value || value === '.' || value === '..') {
    throw new Error(`${label} must be a plain file name without a directory`);
  }
}

function targetFor(registry, manifest) {
  if (manifest.releaseContractVersion !== registry.releaseContractVersion) {
    throw new Error('Manifest and registry releaseContractVersion values do not match');
  }
  assertSafeSegment(manifest.appSlug, 'appSlug');
  assertSafeSegment(manifest.channel, 'channel');
  assertSafeSegment(manifest?.target?.platform, 'target.platform');
  assertSafeSegment(manifest?.target?.arch, 'target.arch');
  if (typeof manifest.version !== 'string' || !SAFE_VERSION.test(manifest.version)) {
    throw new Error('version must be a SemVer value such as 1.2.3 or 1.2.3-beta.1');
  }

  const app = registry.apps?.[manifest.appSlug];
  if (!app) {
    throw new Error(`Unknown appSlug: ${manifest.appSlug}`);
  }
  if (!app.channels?.includes(manifest.channel)) {
    throw new Error(`Channel ${manifest.channel} is not registered for ${manifest.appSlug}`);
  }
  const target = app.targets?.find(
    (candidate) => candidate.platform === manifest.target.platform && candidate.arch === manifest.target.arch,
  );
  if (!target) {
    throw new Error(`Target ${manifest.target.platform}/${manifest.target.arch} is not registered for ${manifest.appSlug}`);
  }
  const distributionMode = target.distributionMode ?? 'app-update';
  if (!['app-update', 'internal-download'].includes(distributionMode)) {
    throw new Error(`Target contains unsupported distributionMode: ${distributionMode}`);
  }
  return { ...target, distributionMode };
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

async function inspectLocalFile(entry, kind, context) {
  if (!entry || typeof entry.path !== 'string' || entry.path.length === 0) {
    throw new Error(`${kind} entry is missing path`);
  }
  const localPath = isAbsolute(entry.path) ? entry.path : resolve(context.manifestDir, entry.path);
  const stat = await lstat(localPath).catch((error) => {
    throw new Error(`Cannot inspect ${kind} file ${localPath}: ${error.message}`);
  });
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${kind} path must be a regular, non-symlink file: ${localPath}`);
  }

  const publishName = entry.publishName ?? basename(localPath);
  assertPlainFileName(publishName, `${kind}.publishName`);
  const lowerName = publishName.toLowerCase();
  const role = entry.role ?? kind;
  if (kind === 'artifact') {
    if (!ARTIFACT_ROLES.has(role)) {
      throw new Error(`Unsupported artifact role ${role}: ${publishName}`);
    }
    if (!publishName.includes(context.manifest.version)) {
      throw new Error(`Versioned artifact name must contain ${context.manifest.version}: ${publishName}`);
    }
    if (lowerName.startsWith('latest') || lowerName.includes('-latest.')) {
      throw new Error(`Artifact names must be immutable and cannot use latest: ${publishName}`);
    }
  } else if (!context.target.metadataNames.includes(publishName)) {
    throw new Error(`Metadata name ${publishName} is not allowed for this target`);
  }

  const key = [
    context.manifest.appSlug,
    context.manifest.channel,
    context.manifest.target.platform,
    context.manifest.target.arch,
    publishName,
  ].join('/');
  return {
    kind,
    role,
    referencedByMetadata: entry.referencedByMetadata === true,
    localPath,
    publishName,
    key,
    ossUri: `oss://${context.registry.infrastructure.bucket}/${key}`,
    publicUrl: `${context.registry.infrastructure.publicBaseUrl}/${key}`,
    size: stat.size,
    sha256: await sha256(localPath),
  };
}

function validateArtifactPolicy(target, artifacts) {
  for (const role of target.requiredArtifactRoles ?? []) {
    if (!ARTIFACT_ROLES.has(role)) {
      throw new Error(`Registry contains unsupported required artifact role: ${role}`);
    }
    if (!artifacts.some((artifact) => artifact.role === role)) {
      throw new Error(`Target requires an artifact with role ${role}`);
    }
  }

  const names = new Set(artifacts.map((artifact) => artifact.publishName));
  for (const blockmap of artifacts.filter((artifact) => artifact.role === 'blockmap')) {
    if (!blockmap.publishName.endsWith('.blockmap')) {
      throw new Error(`Blockmap artifact must end with .blockmap: ${blockmap.publishName}`);
    }
    const payloadName = blockmap.publishName.slice(0, -'.blockmap'.length);
    if (!names.has(payloadName)) {
      throw new Error(`Blockmap has no matching payload artifact: ${blockmap.publishName}`);
    }
  }

  if (target.requireUpdaterBlockmap === true) {
    for (const updater of artifacts.filter((artifact) => artifact.role === 'updater')) {
      const expected = `${updater.publishName}.blockmap`;
      if (!names.has(expected)) {
        throw new Error(`Updater payload requires matching blockmap artifact: ${expected}`);
      }
    }
  }
}

function validateMetadataReferences(manifest, artifacts, metadata) {
  const referencedArtifacts = artifacts.filter((artifact) => artifact.referencedByMetadata);
  if (referencedArtifacts.length === 0) {
    throw new Error('At least one artifact must set referencedByMetadata to true');
  }
  return Promise.all(metadata.map(async (pointer) => {
    const text = await readFile(pointer.localPath, 'utf8');
    const versionPattern = new RegExp(`(^|\\n)\\s*version\\s*:\\s*["']?${manifest.version.replaceAll('.', '\\.')}["']?\\s*(?:$|\\n)`, 'm');
    if (!versionPattern.test(text)) {
      throw new Error(`${pointer.publishName} does not declare version ${manifest.version}`);
    }
    for (const artifact of referencedArtifacts) {
      if (!text.includes(artifact.publishName)) {
        throw new Error(`${pointer.publishName} does not reference ${artifact.publishName}`);
      }
    }
  }));
}

export async function buildPlan(manifestPath, registryPath = DEFAULT_REGISTRY) {
  const absoluteManifest = resolve(manifestPath);
  const absoluteRegistry = resolve(registryPath);
  const [manifest, registry] = await Promise.all([
    readJson(absoluteManifest, 'manifest'),
    loadReleaseRegistry(absoluteRegistry),
  ]);
  const target = targetFor(registry, manifest);
  if (!Array.isArray(manifest.artifacts) || manifest.artifacts.length === 0) {
    throw new Error('Manifest must contain at least one artifact');
  }
  if (!Array.isArray(manifest.metadata)) {
    throw new Error('Manifest metadata must be an array');
  }
  if (target.distributionMode === 'app-update' && manifest.metadata.length === 0) {
    throw new Error('App-update targets must contain at least one metadata file');
  }
  if (target.distributionMode === 'internal-download' && manifest.metadata.length > 0) {
    throw new Error('Internal-download targets must not publish update metadata');
  }

  const context = { manifest, registry, target, manifestDir: dirname(absoluteManifest) };
  const artifacts = await Promise.all(manifest.artifacts.map((entry) => inspectLocalFile(entry, 'artifact', context)));
  const metadata = await Promise.all(manifest.metadata.map((entry) => inspectLocalFile(entry, 'metadata', context)));
  const names = [...artifacts, ...metadata].map((item) => item.publishName);
  if (new Set(names).size !== names.length) {
    throw new Error('publishName values must be unique within one target release');
  }
  validateArtifactPolicy(target, artifacts);
  if (target.distributionMode === 'app-update') {
    await validateMetadataReferences(manifest, artifacts, metadata);
  } else if (artifacts.some((artifact) => artifact.referencedByMetadata)) {
    throw new Error('Internal-download artifacts cannot be referenced by update metadata');
  }

  return {
    releaseContractVersion: registry.releaseContractVersion,
    appSlug: manifest.appSlug,
    version: manifest.version,
    channel: manifest.channel,
    platform: manifest.target.platform,
    arch: manifest.target.arch,
    distributionMode: target.distributionMode,
    release: `${manifest.appSlug}@${manifest.version}`,
    target: `${manifest.channel}/${manifest.target.platform}/${manifest.target.arch}`,
    confirmationToken: `${manifest.appSlug}@${manifest.version}:${manifest.channel}:${manifest.target.platform}:${manifest.target.arch}`,
    artifacts,
    metadata,
  };
}

function formatPlan(plan, phase = 'all') {
  const selected = phase === 'artifacts' ? plan.artifacts : phase === 'metadata' ? plan.metadata : [...plan.artifacts, ...plan.metadata];
  const lines = [
    `Release: ${plan.release}`,
    `Target: ${plan.target}`,
    `Distribution: ${plan.distributionMode}`,
    `Phase: ${phase}`,
    '',
  ];
  for (const item of selected) {
    lines.push(`[${item.kind}:${item.role}] ${item.localPath}`);
    lines.push(`  -> ${item.ossUri}`);
    lines.push(`  size=${item.size} sha256=${item.sha256}`);
  }
  lines.push('', `Metadata confirmation token: ${plan.confirmationToken}`);
  return lines.join('\n');
}

function runOssutil(args, { allowFailure = false, live = false } = {}) {
  const binary = process.env.OSSUTIL_BIN || 'ossutil';
  const configFile = process.env.OSSUTIL_CONFIG_FILE;
  const profile = process.env.OSSUTIL_PROFILE;
  const globalArgs = [];
  if (configFile) {
    if (!isAbsolute(configFile)) {
      throw new Error('OSSUTIL_CONFIG_FILE must be an absolute path');
    }
    globalArgs.push('--config-file', configFile);
  }
  if (profile) {
    if (!/^[A-Za-z0-9._-]+$/.test(profile)) {
      throw new Error('OSSUTIL_PROFILE contains unsupported characters');
    }
    globalArgs.push('--profile', profile);
  }
  const result = spawnSync(
    binary,
    [...args, ...globalArgs],
    live ? { stdio: 'inherit' } : { encoding: 'utf8' },
  );
  if (result.error) {
    throw new Error(`Cannot run ossutil (${binary}): ${result.error.message}`);
  }
  if (!allowFailure && result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(`ossutil ${args[0]} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function assertArtifactDoesNotExist(item) {
  const result = runOssutil(['stat', item.ossUri], { allowFailure: true });
  if (result.status === 0) {
    throw new Error(`Refusing to overwrite immutable artifact: ${item.ossUri}`);
  }
  const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  if (!NOT_FOUND_MARKERS.test(detail)) {
    throw new Error(`Cannot prove that ${item.ossUri} is absent; upload stopped. ossutil output: ${detail.trim() || `exit ${result.status}`}`);
  }
}

async function uploadAndVerify(item, log = () => {}) {
  log(`[oss] upload START: ${item.publishName} (${item.size} bytes)`);
  runOssutil(['cp', item.localPath, item.ossUri], { live: true });
  log(`[oss] upload SUCCESS: ${item.publishName}`);
  log(`[oss] stat START: ${item.publishName}`);
  runOssutil(['stat', item.ossUri]);
  log(`[oss] stat SUCCESS: ${item.publishName}`);
  const verificationDirectory = await mkdtemp(join(tmpdir(), 'ideabox-oss-verify-'));
  const downloadedPath = join(verificationDirectory, item.publishName);
  try {
    log(`[oss] read-back START: ${item.publishName}`);
    runOssutil(['cp', item.ossUri, downloadedPath, '--force'], { live: true });
    const stat = await lstat(downloadedPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== item.size) {
      throw new Error(`OSS read-back size mismatch for ${item.ossUri}`);
    }
    const downloadedHash = await sha256(downloadedPath);
    if (downloadedHash !== item.sha256) {
      throw new Error(`OSS read-back SHA-256 mismatch for ${item.ossUri}`);
    }
    log(`[oss] read-back SUCCESS: ${item.publishName}`);
  } finally {
    await rm(verificationDirectory, { recursive: true, force: true });
  }
}

export async function executeCommand(options, runtime = {}) {
  const log = runtime.log ?? (() => {});
  const plan = await buildPlan(options.manifest, options.registry ?? DEFAULT_REGISTRY);
  if (options.command === 'plan') {
    return { plan, output: options.json ? JSON.stringify(plan, null, 2) : formatPlan(plan) };
  }

  const phase = options.command === 'upload-artifacts' ? 'artifacts' : 'metadata';
  if (!options.execute) {
    return { plan, output: `${formatPlan(plan, phase)}\n\nDRY RUN: no cloud writes were performed. Add --execute only after review.` };
  }

  if (phase === 'metadata' && options.confirm !== plan.confirmationToken) {
    throw new Error(`Metadata publication requires --confirm ${plan.confirmationToken}`);
  }

  if (phase === 'artifacts') {
    for (const [index, item] of plan.artifacts.entries()) {
      log(`[oss] preflight ${index + 1}/${plan.artifacts.length}: ${item.publishName}`);
      assertArtifactDoesNotExist(item);
    }
    for (const [index, item] of plan.artifacts.entries()) {
      log(`[oss] artifact ${index + 1}/${plan.artifacts.length} START: ${item.publishName}`);
      await uploadAndVerify(item, log);
      log(`[oss] artifact ${index + 1}/${plan.artifacts.length} SUCCESS: ${item.publishName}`);
    }
  } else {
    if (plan.metadata.length === 0) log('[oss] metadata SKIP: target has no metadata files');
    for (const [index, item] of plan.metadata.entries()) {
      log(`[oss] metadata ${index + 1}/${plan.metadata.length} START: ${item.publishName}`);
      await uploadAndVerify(item, log);
      log(`[oss] metadata ${index + 1}/${plan.metadata.length} SUCCESS: ${item.publishName}`);
    }
  }
  return { plan, output: `${phase} phase completed for ${plan.release} (${plan.target})` };
}

async function main() {
  const ui = createTerminalUi();
  try {
    await access(DEFAULT_REGISTRY, fsConstants.R_OK);
    const options = parseArgs(process.argv.slice(2));
    const log = ui.timestamp;
    const result = await executeCommand(options, { log });
    ui.success(result.output);
  } catch (error) {
    ui.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
