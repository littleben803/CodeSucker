#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import { buildChecklist, defaultRecordPath } from './prepare-release.mjs';
import { selectTargetRecord } from './release-records.mjs';
import { createTerminalUi } from './terminal-ui.mjs';

const DEFAULT_SERVER = 'ideabox-release@47.98.192.155';
const DEFAULT_REMOTE_BASE = '/srv/ideabox-release/incoming';
const SERVER_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]*@[A-Za-z0-9.-]+$/;
const REMOTE_PATH_PATTERN = /^\/(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;

function usage() {
  return `Usage:
  node publish-via-host.mjs --manifest <file> [--registry <file>] [--record <file>]
    [--server user@host] [--remote-base /absolute/path]
    [--execute --confirm handoff:<release-token>]

The command is a dry-run unless --execute is present. It transfers only files
already covered by a validated release record and never sends credentials.`;
}

export function parseHandoffArgs(argv) {
  const options = {
    execute: false,
    server: process.env.IDEABOX_RELEASE_SERVER || DEFAULT_SERVER,
    remoteBase: process.env.IDEABOX_RELEASE_REMOTE_BASE || DEFAULT_REMOTE_BASE,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--execute') {
      options.execute = true;
    } else if (['--manifest', '--registry', '--record', '--server', '--remote-base', '--confirm'].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      const key = argument === '--remote-base' ? 'remoteBase' : argument.slice(2);
      options[key] = value;
      index += 1;
    } else {
      throw new Error(`Unsupported argument: ${argument}\n${usage()}`);
    }
  }
  if (!options.manifest) {
    throw new Error(`--manifest is required\n${usage()}`);
  }
  if (!SERVER_PATTERN.test(options.server)) {
    throw new Error('server must use the form user@host with no shell characters');
  }
  if (!REMOTE_PATH_PATTERN.test(options.remoteBase) || options.remoteBase.includes('/../')) {
    throw new Error('remote-base must be a safe absolute path');
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

export function validatePreparedRecord(record, checklist) {
  const { plan } = checklist;
  if (
    record.releaseRecordVersion !== 1
    || record.recordType !== 'prepared-release'
    || record.appSlug !== plan.appSlug
    || record.version !== plan.version
    || record.channel !== plan.channel
    || record.target?.platform !== plan.platform
    || record.target?.arch !== plan.arch
  ) {
    throw new Error('Release record identity does not match the manifest plan');
  }

  const recordedFiles = new Map(
    [...(record.artifacts ?? []), ...(record.metadata ?? [])]
      .map((item) => [item.publishName, item]),
  );
  for (const item of [...plan.artifacts, ...plan.metadata]) {
    const recorded = recordedFiles.get(item.publishName);
    if (!recorded || recorded.size !== item.size || recorded.sha256 !== item.sha256 || recorded.key !== item.key) {
      throw new Error(`Release record does not match local file: ${item.publishName}`);
    }
  }
}

export async function buildValidatedTargetPlan(options) {
  const checklist = await buildChecklist(options.manifest, options.registry);
  const recordPath = resolve(options.record ?? defaultRecordPath(checklist.plan));
  const collection = await readJson(recordPath, 'release record');
  const record = selectTargetRecord(collection, {
    appSlug: checklist.plan.appSlug,
    version: checklist.plan.version,
    channel: checklist.plan.channel,
    platform: checklist.plan.platform,
    arch: checklist.plan.arch,
  }, 'prepared-release');
  if (!record) throw new Error('Prepared release collection does not contain the manifest target');
  validatePreparedRecord(record, checklist);
  return { checklist, record, recordPath };
}

export async function buildHandoffPlan(options) {
  const { checklist, record, recordPath } = await buildValidatedTargetPlan(options);

  const { plan } = checklist;
  const remoteDirectory = [
    options.remoteBase,
    plan.appSlug,
    plan.channel,
    plan.platform,
    plan.arch,
    plan.version,
  ].join('/');
  const files = [
    ...plan.artifacts.map((item) => ({ kind: 'artifact', localPath: item.localPath, remoteName: item.publishName, sha256: item.sha256 })),
    ...plan.metadata.map((item) => ({ kind: 'metadata', localPath: item.localPath, remoteName: item.publishName, sha256: item.sha256 })),
    {
      kind: 'record',
      localPath: null,
      sourcePath: recordPath,
      remoteName: `${plan.platform}-${plan.arch}.prepared.json`,
      sha256: null,
      content: `${JSON.stringify(record, null, 2)}\n`,
    },
  ];
  const remoteNames = files.map((item) => item.remoteName);
  if (new Set(remoteNames).size !== remoteNames.length) {
    throw new Error('Handoff file names must be unique');
  }

  return {
    release: plan.release,
    target: plan.target,
    server: options.server,
    remoteDirectory,
    confirmationToken: `handoff:${plan.confirmationToken}`,
    checklistStatus: checklist.status,
    files,
  };
}

function formatHandoffPlan(plan) {
  const lines = [
    `Release handoff: ${plan.release}`,
    `Target: ${plan.target}`,
    `Server: ${plan.server}`,
    `Remote directory: ${plan.remoteDirectory}`,
    `Checklist: ${plan.checklistStatus.toUpperCase()}`,
    '',
  ];
  for (const file of plan.files) {
    lines.push(`[${file.kind}] ${file.localPath ?? `${file.sourcePath} (${plan.target})`}`);
    lines.push(`  -> ${file.remoteName}${file.sha256 ? ` sha256=${file.sha256}` : ''}`);
  }
  lines.push('', `Handoff confirmation token: ${plan.confirmationToken}`);
  return lines.join('\n');
}

function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function run(binary, args, { live = false } = {}) {
  const result = spawnSync(binary, args, live ? { stdio: 'inherit' } : { encoding: 'utf8' });
  if (result.error) {
    throw new Error(`Cannot run ${binary}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(`${binary} failed with exit ${result.status}${detail ? `: ${detail}` : ''}`);
  }
}

export async function executeHandoff(options) {
  const plan = await buildHandoffPlan(options);
  if (!options.execute) {
    return { plan, output: `${formatHandoffPlan(plan)}\n\nDRY RUN: no server writes were performed. Add --execute only after review.` };
  }
  if (options.confirm !== plan.confirmationToken) {
    throw new Error(`Server handoff requires --confirm ${plan.confirmationToken}`);
  }

  const log = options.log ?? (() => {});
  const ssh = process.env.IDEABOX_SSH_BIN || 'ssh';
  const rsync = process.env.IDEABOX_RSYNC_BIN || 'rsync';
  const remoteParent = dirname(plan.remoteDirectory);
  const temporaryDirectory = `${plan.remoteDirectory}.uploading-${Date.now()}`;
  const localRecordDirectory = await mkdtemp(join(tmpdir(), 'codedoc-handoff-record-'));
  const recordFile = plan.files.find((file) => file.kind === 'record');
  const localRecordPath = join(localRecordDirectory, recordFile.remoteName);
  await writeFile(localRecordPath, recordFile.content, { mode: 0o600 });
  const prepare = [
    'set -eu',
    `test ! -e ${shellQuote(plan.remoteDirectory)}`,
    `mkdir -p ${shellQuote(remoteParent)}`,
    `mkdir ${shellQuote(temporaryDirectory)}`,
  ].join('; ');
  try {
    log(`[${plan.target}] handoff prepare START: ${temporaryDirectory}`);
    run(ssh, [plan.server, prepare]);
    log(`[${plan.target}] handoff prepare SUCCESS`);
    for (const [index, file] of plan.files.entries()) {
      log(`[${plan.target}] transfer ${index + 1}/${plan.files.length} START: ${file.remoteName}`);
      run(rsync, [
        '--archive',
        '--checksum',
        '--progress',
        '--',
        file.kind === 'record' ? localRecordPath : file.localPath,
        `${plan.server}:${temporaryDirectory}/${file.remoteName}`,
      ], { live: true });
      log(`[${plan.target}] transfer ${index + 1}/${plan.files.length} SUCCESS: ${file.remoteName}`);
    }
    const finalize = [
      'set -eu',
      `mv ${shellQuote(temporaryDirectory)} ${shellQuote(plan.remoteDirectory)}`,
      `: > ${shellQuote(`${plan.remoteDirectory}/.ready`)}`,
    ].join('; ');
    log(`[${plan.target}] handoff finalize START`);
    run(ssh, [plan.server, finalize]);
    log(`[${plan.target}] handoff finalize SUCCESS`);
  } finally {
    await rm(localRecordDirectory, { recursive: true, force: true });
  }

  return { plan, output: `Server handoff completed for ${plan.release} (${plan.target})` };
}

async function main() {
  const ui = createTerminalUi();
  try {
    const options = parseHandoffArgs(process.argv.slice(2));
    const log = ui.timestamp;
    const result = await executeHandoff({ ...options, log });
    ui.success(result.output);
  } catch (error) {
    ui.error(error);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
