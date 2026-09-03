#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  readdir,
  readFile,
  realpath,
  rm,
  rename,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { buildPlan, executeCommand } from '../release.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY = resolve(SCRIPT_DIR, '..', 'release.config.json');
const DEFAULT_INCOMING = '/srv/ideabox-release/incoming';
const DEFAULT_ARCHIVE = '/srv/ideabox-release/archive';
const COMMANDS = new Set([
  'plan',
  'upload-artifacts',
  'verify-artifacts',
  'publish-metadata',
  'verify-release',
  'finalize',
]);

function usage() {
  return `Usage:
  node publish-release.mjs plan --release-dir <directory> [--registry <file>]
  node publish-release.mjs <phase> --release-dir <directory> [--registry <file>]
    --execute --confirm <phase>:<release-token>

Phases: upload-artifacts, verify-artifacts, publish-metadata, verify-release,
finalize. Only plan is read-only; every state-changing phase requires its exact
confirmation token. Run this command through release-server so one target is
protected by an advisory lock.`;
}

export function parseServerArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) {
    throw new Error(`Unknown or missing command.\n${usage()}`);
  }
  const options = {
    command,
    execute: false,
    incomingBase: process.env.IDEABOX_RELEASE_INCOMING || DEFAULT_INCOMING,
    archiveBase: process.env.IDEABOX_RELEASE_ARCHIVE || DEFAULT_ARCHIVE,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === '--execute') {
      options.execute = true;
    } else if (['--release-dir', '--registry', '--confirm'].includes(argument)) {
      const value = rest[index + 1];
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      options[argument === '--release-dir' ? 'releaseDirectory' : argument.slice(2)] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${argument}\n${usage()}`);
    }
  }
  if (!options.releaseDirectory) throw new Error(`--release-dir is required\n${usage()}`);
  if (command === 'plan' && options.execute) throw new Error('plan never accepts --execute');
  return options;
}

async function readJson(filePath, label) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${label} ${filePath}: ${error.message}`);
  }
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

function assertInside(basePath, childPath, label) {
  const childRelative = relative(basePath, childPath);
  if (!childRelative || childRelative === '..' || childRelative.startsWith(`..${sep}`) || childRelative.includes(`${sep}..${sep}`)) {
    throw new Error(`${label} must be a version directory below ${basePath}`);
  }
}

async function regularFile(filePath, label) {
  const stat = await lstat(filePath).catch((error) => {
    throw new Error(`Cannot inspect ${label} ${filePath}: ${error.message}`);
  });
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`${label} must be a regular, non-symlink file`);
  return stat;
}

async function findPreparedRecord(releaseDirectory) {
  const entries = await readdir(releaseDirectory);
  const names = entries.filter((name) => name.endsWith('.prepared.json'));
  if (names.length !== 1) throw new Error('Release directory must contain exactly one *.prepared.json record');
  const recordPath = join(releaseDirectory, names[0]);
  await regularFile(recordPath, 'prepared record');
  return { recordPath, record: await readJson(recordPath, 'prepared record') };
}

function expectedPath(record) {
  return [record.appSlug, record.channel, record.target?.platform, record.target?.arch, record.version].join('/');
}

function validateRecordIdentity(record, releaseDirectory, incomingBase) {
  if (record.releaseRecordVersion !== 1 || record.recordType !== 'prepared-release') {
    throw new Error('Unsupported prepared release record');
  }
  const directoryRelative = relative(incomingBase, releaseDirectory).split(sep).join('/');
  if (directoryRelative !== expectedPath(record)) {
    throw new Error(`Incoming directory identity does not match prepared record: expected ${expectedPath(record)}`);
  }
  const token = `${record.appSlug}@${record.version}:${record.channel}:${record.target.platform}:${record.target.arch}`;
  if (record.confirmationToken !== token) throw new Error('Prepared record confirmation token is inconsistent');
  if (!['passed', 'warning'].includes(record.checklist?.status)) throw new Error('Prepared checklist status is not publishable');
  return token;
}

async function validateRecordedFiles(releaseDirectory, record) {
  const entries = [...(record.artifacts ?? []), ...(record.metadata ?? [])];
  if (entries.length === 0) throw new Error('Prepared record has no files');
  const names = entries.map((item) => item.publishName);
  if (new Set(names).size !== names.length) throw new Error('Prepared record contains duplicate publishName values');
  for (const item of entries) {
    if (basename(item.publishName ?? '') !== item.publishName) throw new Error('Prepared record contains an unsafe publishName');
    const filePath = join(releaseDirectory, item.publishName);
    const stat = await regularFile(filePath, `release file ${item.publishName}`);
    if (stat.size !== item.size) throw new Error(`Size mismatch for ${item.publishName}`);
    if (await sha256(filePath) !== item.sha256) throw new Error(`SHA-256 mismatch for ${item.publishName}`);
  }
  return entries;
}

function validatePlanAgainstRecord(plan, record) {
  const recorded = new Map(
    [...record.artifacts, ...record.metadata].map((item) => [item.publishName, item]),
  );
  for (const item of [...plan.artifacts, ...plan.metadata]) {
    const expected = recorded.get(item.publishName);
    if (
      !expected
      || expected.role !== item.role
      || expected.size !== item.size
      || expected.sha256 !== item.sha256
      || expected.key !== item.key
      || expected.publicUrl !== item.publicUrl
    ) {
      throw new Error(`Prepared record does not match server plan: ${item.publishName}`);
    }
  }
}

async function writeJsonExclusive(filePath, value, label) {
  let handle;
  try {
    handle = await open(filePath, 'wx', 0o640);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Refusing to overwrite existing ${label}: ${filePath}`);
    throw error;
  } finally {
    await handle?.close();
  }
}

async function buildServerContext(options) {
  const incomingBase = await realpath(resolve(options.incomingBase));
  const releaseDirectory = await realpath(resolve(options.releaseDirectory));
  assertInside(incomingBase, releaseDirectory, 'release-dir');
  const directoryStat = await lstat(releaseDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('release-dir must be a real directory');
  await regularFile(join(releaseDirectory, '.ready'), 'ready marker');
  const { recordPath, record } = await findPreparedRecord(releaseDirectory);
  const token = validateRecordIdentity(record, releaseDirectory, incomingBase);
  await validateRecordedFiles(releaseDirectory, record);

  const manifest = {
    releaseContractVersion: record.releaseContractVersion,
    appSlug: record.appSlug,
    version: record.version,
    channel: record.channel,
    target: record.target,
    artifacts: record.artifacts.map((item) => ({
      path: join(releaseDirectory, item.publishName),
      role: item.role,
      ...(item.referencedByMetadata ? { referencedByMetadata: true } : {}),
    })),
    metadata: record.metadata.map((item) => ({
      path: join(releaseDirectory, item.publishName),
      publishName: item.publishName,
    })),
  };
  const temporaryManifestDirectory = await mkdtemp(join(tmpdir(), 'ideabox-server-plan-'));
  const manifestPath = join(temporaryManifestDirectory, 'release-manifest.json');
  const registryPath = resolve(options.registry ?? DEFAULT_REGISTRY);
  await writeJsonExclusive(manifestPath, manifest, 'temporary server manifest');
  try {
    const plan = await buildPlan(manifestPath, registryPath);
    validatePlanAgainstRecord(plan, record);
    return {
      incomingBase,
      releaseDirectory,
      recordPath,
      record,
      token,
      manifestPath,
      registryPath,
      plan,
      temporaryManifestDirectory,
    };
  } catch (error) {
    await rm(temporaryManifestDirectory, { recursive: true, force: true });
    throw error;
  }
}

function markerPath(context, phase) {
  return join(context.releaseDirectory, `.${phase}.json`);
}

async function requireMarker(context, phase) {
  await regularFile(markerPath(context, phase), `${phase} marker`);
}

async function recordPhase(context, phase, details = {}) {
  await writeJsonExclusive(markerPath(context, phase), {
    releaseRecordVersion: 1,
    recordType: 'server-phase',
    phase,
    completedAt: new Date().toISOString(),
    confirmationToken: context.token,
    ...details,
  }, `${phase} marker`);
}

export async function verifyUrl(item, requireRange = false, log = () => {}) {
  log(`[cdn] full verification START: ${item.publishName} (${item.size} bytes)`);
  const response = await fetch(item.publicUrl, { redirect: 'error', cache: 'no-store' });
  if (!response.ok || !response.body) throw new Error(`CDN GET failed for ${item.publicUrl}: HTTP ${response.status}`);
  const hash = createHash('sha256');
  let size = 0;
  let nextPercent = 10;
  for await (const chunk of response.body) {
    size += chunk.length;
    hash.update(chunk);
    const percent = item.size > 0 ? Math.floor((size / item.size) * 100) : 100;
    if (percent >= nextPercent) {
      log(`[cdn] full verification PROGRESS: ${item.publishName} ${Math.min(percent, 100)}%`);
      nextPercent = Math.floor(percent / 10) * 10 + 10;
    }
  }
  if (size !== item.size || hash.digest('hex') !== item.sha256) throw new Error(`CDN content mismatch for ${item.publicUrl}`);
  log(`[cdn] full verification SUCCESS: ${item.publishName}`);
  if (requireRange) {
    log(`[cdn] range verification START: ${item.publishName}`);
    const range = await fetch(item.publicUrl, { headers: { Range: 'bytes=0-0' }, redirect: 'error', cache: 'no-store' });
    if (range.status !== 206 || !range.headers.get('content-range')?.startsWith('bytes 0-0/')) {
      throw new Error(`CDN Range verification failed for ${item.publicUrl}: HTTP ${range.status}`);
    }
    await range.body?.cancel();
    log(`[cdn] range verification SUCCESS: ${item.publishName}`);
  }
}

function formatPlan(context) {
  const lines = [
    `Server release: ${context.plan.release}`,
    `Target: ${context.plan.target}`,
    `Incoming: ${context.releaseDirectory}`,
    `Checklist: ${context.record.checklist.status.toUpperCase()}`,
    '',
  ];
  for (const item of [...context.plan.artifacts, ...context.plan.metadata]) {
    lines.push(`[${item.kind}:${item.role}] ${item.publishName}`);
    lines.push(`  ${item.size} bytes sha256=${item.sha256}`);
    lines.push(`  -> ${item.publicUrl}`);
  }
  lines.push('');
  for (const phase of COMMANDS) {
    if (phase !== 'plan') lines.push(`${phase}: --confirm '${phase}:${context.token}'`);
  }
  return lines.join('\n');
}

function assertExecution(options, context) {
  const expected = `${options.command}:${context.token}`;
  if (!options.execute || options.confirm !== expected) {
    throw new Error(`${options.command} requires --execute --confirm ${expected}`);
  }
}

export async function executeServerCommand(options, runtime = {}) {
  const log = runtime.log ?? (() => {});
  const context = await buildServerContext(options);
  try {
    if (options.command === 'plan') return `${formatPlan(context)}\n\nDRY RUN: no server or cloud state was changed.`;
    assertExecution(options, context);
    log(`[server] ${options.command} START: ${context.plan.release} ${context.plan.target}`);

    if (options.command === 'upload-artifacts') {
      await executeCommand(
        { command: 'upload-artifacts', manifest: context.manifestPath, registry: context.registryPath, execute: true },
        { log },
      );
      await recordPhase(context, 'artifacts-uploaded', { files: context.plan.artifacts.map(({ publishName, size, sha256, key }) => ({ publishName, size, sha256, key })) });
    } else if (options.command === 'verify-artifacts') {
      await requireMarker(context, 'artifacts-uploaded');
      for (const [index, item] of context.plan.artifacts.entries()) {
        log(`[server] verify-artifacts ${index + 1}/${context.plan.artifacts.length}: ${item.publishName}`);
        await verifyUrl(item, item.role === 'updater', log);
      }
      await recordPhase(context, 'artifacts-verified');
    } else if (options.command === 'publish-metadata') {
      await requireMarker(context, 'artifacts-verified');
      await executeCommand({
        command: 'publish-metadata',
        manifest: context.manifestPath,
        registry: context.registryPath,
        execute: true,
        confirm: context.token,
      }, { log });
      await recordPhase(context, 'metadata-published', { files: context.plan.metadata.map(({ publishName, size, sha256, key }) => ({ publishName, size, sha256, key })) });
    } else if (options.command === 'verify-release') {
      await requireMarker(context, 'metadata-published');
      const files = [...context.plan.artifacts, ...context.plan.metadata];
      for (const [index, item] of files.entries()) {
        log(`[server] verify-release ${index + 1}/${files.length}: ${item.publishName}`);
        await verifyUrl(item, item.role === 'updater', log);
      }
      await recordPhase(context, 'release-verified');
    } else if (options.command === 'finalize') {
      await requireMarker(context, 'release-verified');
      const archiveDirectory = resolve(options.archiveBase, expectedPath(context.record));
      log(`[server] finalize archive START: ${archiveDirectory}`);
      await mkdir(dirname(archiveDirectory), { recursive: true });
      await rename(context.releaseDirectory, archiveDirectory);
      const receipt = {
        releaseRecordVersion: 1,
        recordType: 'published-release',
        publishedAt: new Date().toISOString(),
        appSlug: context.record.appSlug,
        version: context.record.version,
        channel: context.record.channel,
        target: context.record.target,
        source: context.record.source,
        verification: context.record.verification,
        confirmationToken: context.token,
        artifacts: context.record.artifacts,
        metadata: context.record.metadata,
        serverChecks: ['incoming-hash', 'oss-read-back-hash', 'cdn-full-hash', 'cdn-range'],
      };
      await writeJsonExclusive(join(archiveDirectory, `${context.record.target.platform}-${context.record.target.arch}.published.json`), receipt, 'published receipt');
      log(`[server] finalize archive SUCCESS: ${archiveDirectory}`);
    }
    log(`[server] ${options.command} SUCCESS: ${context.plan.release} ${context.plan.target}`);
    return `${options.command} completed for ${context.plan.release} (${context.plan.target})`;
  } finally {
    await rm(context.temporaryManifestDirectory, { recursive: true, force: true });
  }
}

async function main() {
  try {
    const options = parseServerArgs(process.argv.slice(2));
    const log = (message) => process.stdout.write(`[${new Date().toISOString()}] ${message}\n`);
    log(`[server] command START: ${options.command} ${options.releaseDirectory}`);
    process.stdout.write(`${await executeServerCommand(options, { log })}\n`);
  } catch (error) {
    process.stderr.write(`[${new Date().toISOString()}] ERROR: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
