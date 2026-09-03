import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildChecklist, stageRelease, writeReleaseRecord } from './prepare-release.mjs';
import {
  buildSyncPlan,
  executeSync,
  parseSyncArgs,
  remoteStatusCommand,
  selectTargets,
} from './sync-release.mjs';

function gitOutput(args) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'codedoc-release-sync-'));
  const releaseRoot = join(root, 'ops', 'app-release');
  const configPath = join(releaseRoot, 'release.config.json');
  const packagePath = join(root, 'package.json');
  const sourceArtifact = join(root, 'CodeDoc-1.0.0-win-x64.exe');
  const sourceManifest = join(root, 'source-manifest.json');
  const archiveDirectory = join(releaseRoot, '.release-work', 'codedoc', 'stable', 'win', 'x64', '1.0.0');
  const recordPath = join(releaseRoot, 'releases', 'codedoc', 'stable', '1.0.0', 'prepared.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(packagePath, '{"version":"1.0.0"}\n');
  await writeFile(configPath, `${JSON.stringify({
    schemaVersion: 1,
    releaseContractVersion: 1,
    activeProvider: 'oss',
    publishProviders: ['oss'],
    providers: {
      oss: {
        enabled: true,
        type: 'generic',
        bucket: 'test-bucket',
        publicBaseUrl: 'https://download.example.com',
        updateBaseUrl: 'https://download.example.com/codedoc',
        transport: 'release-host',
        server: 'release@example.com',
        remoteIncomingBase: '/srv/ideabox-release/incoming',
        remoteArchiveBase: '/srv/ideabox-release/archive',
        remoteCommand: '/opt/ideabox-release/bin/release-server',
      },
      github: { enabled: false, type: 'github-release', implemented: false },
    },
    app: {
      slug: 'codedoc',
      displayName: 'CodeDoc',
      channels: ['beta', 'stable'],
      targets: [{
        id: 'win-x64',
        platform: 'win',
        arch: 'x64',
        distributionMode: 'internal-download',
        metadataNames: [],
        requiredArtifactRoles: ['installer'],
        requireUpdaterBlockmap: false,
      }],
    },
  }, null, 2)}\n`);
  await writeFile(sourceArtifact, 'MZ-test-installer');
  await writeFile(sourceManifest, `${JSON.stringify({
    releaseContractVersion: 1,
    appSlug: 'codedoc',
    version: '1.0.0',
    channel: 'stable',
    target: { platform: 'win', arch: 'x64' },
    source: {
      repository: 'CodeSucker',
      repositoryPath: process.cwd(),
      commit: gitOutput(['rev-parse', 'HEAD']),
    },
    verification: { releaseBuild: 'passed', signing: 'not-required-internal' },
    artifacts: [{ path: sourceArtifact, role: 'installer' }],
    metadata: [],
  }, null, 2)}\n`);
  const staged = await stageRelease(sourceManifest, configPath, archiveDirectory);
  const checklist = await buildChecklist(staged.manifestPath, configPath);
  await writeReleaseRecord(checklist, recordPath);
  return {
    root,
    releaseRoot,
    configPath,
    packagePath,
    recordPath,
    publishedPath: join(dirname(recordPath), 'published.json'),
  };
}

test('sync arguments are dry-run by default and reject unsafe combinations', () => {
  assert.deepEqual(parseSyncArgs([]), {
    channel: undefined,
    targets: 'all',
    execute: false,
    confirm: undefined,
    help: false,
  });
  assert.throws(() => parseSyncArgs(['--confirm', 'x']), /only valid with --execute/);
  assert.throws(() => parseSyncArgs(['--channel', 'nightly']), /beta or stable/);
});

test('target selection is deterministic and rejects unknown ids', () => {
  const config = { app: { targets: [{ id: 'a' }, { id: 'b' }] } };
  assert.deepEqual(selectTargets(config, 'b,a,b').map((target) => target.id), ['b', 'a']);
  assert.throws(() => selectTargets(config, 'missing'), /Unknown release target/);
});

test('dry-run validates local archives without invoking SSH or rsync', async () => {
  const files = await fixture();
  const previous = { ssh: process.env.IDEABOX_SSH_BIN, rsync: process.env.IDEABOX_RSYNC_BIN };
  process.env.IDEABOX_SSH_BIN = join(files.root, 'missing-ssh');
  process.env.IDEABOX_RSYNC_BIN = join(files.root, 'missing-rsync');
  try {
    const output = await executeSync(
      { channel: 'stable', targets: 'all', execute: false },
      files.configPath,
      { releaseRoot: files.releaseRoot, packagePath: files.packagePath },
    );
    assert.match(output, /DRY RUN: no server or cloud writes were performed/);
    assert.match(output, /sync:codedoc@1\.0\.0:stable:oss/);
  } finally {
    if (previous.ssh === undefined) delete process.env.IDEABOX_SSH_BIN;
    else process.env.IDEABOX_SSH_BIN = previous.ssh;
    if (previous.rsync === undefined) delete process.env.IDEABOX_RSYNC_BIN;
    else process.env.IDEABOX_RSYNC_BIN = previous.rsync;
    await rm(files.root, { recursive: true, force: true });
  }
});

test('execute requires one exact release confirmation before network access', async () => {
  const files = await fixture();
  const previous = process.env.IDEABOX_SSH_BIN;
  process.env.IDEABOX_SSH_BIN = join(files.root, 'missing-ssh');
  try {
    await assert.rejects(
      () => executeSync(
        { channel: 'stable', targets: 'all', execute: true, confirm: 'wrong' },
        files.configPath,
        { releaseRoot: files.releaseRoot, packagePath: files.packagePath },
      ),
      /requires --confirm sync:codedoc@1\.0\.0:stable:oss/,
    );
  } finally {
    if (previous === undefined) delete process.env.IDEABOX_SSH_BIN;
    else process.env.IDEABOX_SSH_BIN = previous;
    await rm(files.root, { recursive: true, force: true });
  }
});

test('full sync uses ordered phases, resumes from status, and downloads the receipt', async () => {
  const files = await fixture();
  const fakeSsh = join(files.root, 'fake-ssh.sh');
  const fakeRsync = join(files.root, 'fake-rsync.sh');
  const stateFile = join(files.root, 'state.txt');
  const logFile = join(files.root, 'ssh.log');
  const rsyncLogFile = join(files.root, 'rsync.log');
  const receiptFixture = join(files.root, 'receipt.json');
  const prepared = JSON.parse(await readFile(files.recordPath, 'utf8')).targets[0];
  await writeFile(receiptFixture, `${JSON.stringify({
    releaseRecordVersion: 1,
    recordType: 'published-release',
    appSlug: 'codedoc',
    version: '1.0.0',
    channel: 'stable',
    target: { platform: 'win', arch: 'x64' },
    artifacts: prepared.artifacts,
    metadata: prepared.metadata,
  }, null, 2)}\n`);
  await writeFile(fakeSsh, `#!/bin/sh
command_text="\${2:-}"
printf '%s\\n' "$command_text" >> "$FAKE_SSH_LOG"
case "$command_text" in
  *"printf 'finalized"*) if [ -f "$FAKE_STATE" ]; then cat "$FAKE_STATE"; else printf 'absent\\n'; fi ;;
  *"'upload-artifacts'"*) printf 'artifacts-uploaded\\n' > "$FAKE_STATE" ;;
  *"'verify-artifacts'"*) printf 'artifacts-verified\\n' > "$FAKE_STATE" ;;
  *"'publish-metadata'"*) printf 'metadata-published\\n' > "$FAKE_STATE" ;;
  *"'verify-release'"*) printf 'release-verified\\n' > "$FAKE_STATE" ;;
  *"'finalize'"*) printf 'finalized\\n' > "$FAKE_STATE" ;;
  *".ready"*) printf 'handed-off\\n' > "$FAKE_STATE" ;;
esac
`);
  await writeFile(fakeRsync, `#!/bin/sh
printf '%s\n' "$*" >> "$FAKE_RSYNC_LOG"
for last do :; done
case "$last" in
  *:*) exit 0 ;;
  *) cp "$FAKE_RECEIPT" "$last" ;;
esac
`);
  await Promise.all([chmod(fakeSsh, 0o700), chmod(fakeRsync, 0o700)]);
  const previous = {
    ssh: process.env.IDEABOX_SSH_BIN,
    rsync: process.env.IDEABOX_RSYNC_BIN,
    state: process.env.FAKE_STATE,
    log: process.env.FAKE_SSH_LOG,
    rsyncLog: process.env.FAKE_RSYNC_LOG,
    receipt: process.env.FAKE_RECEIPT,
  };
  Object.assign(process.env, {
    IDEABOX_SSH_BIN: fakeSsh,
    IDEABOX_RSYNC_BIN: fakeRsync,
    FAKE_STATE: stateFile,
    FAKE_SSH_LOG: logFile,
    FAKE_RSYNC_LOG: rsyncLogFile,
    FAKE_RECEIPT: receiptFixture,
  });
  try {
    const progress = [];
    const runtime = {
      releaseRoot: files.releaseRoot,
      packagePath: files.packagePath,
      log: (message) => progress.push(message),
    };
    const options = {
      channel: 'stable', targets: 'all', execute: true, confirm: 'sync:codedoc@1.0.0:stable:oss',
    };
    const output = await executeSync(options, files.configPath, runtime);
    assert.match(output, /Release sync completed/);
    assert.equal(await readFile(stateFile, 'utf8'), 'finalized\n');
    const published = JSON.parse(await readFile(files.publishedPath, 'utf8'));
    assert.equal(published.recordType, 'published-release-collection');
    assert.equal(published.targets[0].recordType, 'published-release');
    const log = await readFile(logFile, 'utf8');
    const positions = [
      "'upload-artifacts'",
      "'verify-artifacts'",
      "'publish-metadata'",
      "'verify-release'",
      "'finalize'",
    ].map((phase) => log.indexOf(phase));
    assert.ok(positions.every((position) => position >= 0));
    assert.deepEqual([...positions].sort((a, b) => a - b), positions);
    const progressText = progress.join('\n');
    assert.match(progressText, /\[sync\] START:/);
    assert.match(progressText, /\[win-x64\] handoff START/);
    assert.match(progressText, /\[stable\/win\/x64\] transfer 1\/2 START:/);
    assert.match(progressText, /\[win-x64\] upload-artifacts SUCCESS/);
    assert.match(progressText, /\[sync\] phase SUCCESS: verify-release/);
    assert.match(progressText, /\[win-x64\] receipt SUCCESS:/);
    assert.match(progressText, /Published installer URLs:/);
    assert.match(progressText, /https:\/\/download\.example\.com\/codedoc\/stable\/win\/x64\/CodeDoc-1\.0\.0-win-x64\.exe/);
    assert.match(progressText, /Published record: .*published\.json/);
    assert.match(progressText, /\[sync\] SUCCESS:/);
    assert.match(await readFile(rsyncLogFile, 'utf8'), /--progress/);

    const secondRun = await executeSync(options, files.configPath, runtime);
    assert.match(secondRun, /Release sync completed/);
  } finally {
    const restore = (name, value) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('IDEABOX_SSH_BIN', previous.ssh);
    restore('IDEABOX_RSYNC_BIN', previous.rsync);
    restore('FAKE_STATE', previous.state);
    restore('FAKE_SSH_LOG', previous.log);
    restore('FAKE_RSYNC_LOG', previous.rsyncLog);
    restore('FAKE_RECEIPT', previous.receipt);
    await rm(files.root, { recursive: true, force: true });
  }
});

test('remote status command only references configured release directories', async () => {
  const files = await fixture();
  try {
    const plan = await buildSyncPlan(
      { channel: 'stable', targets: 'all', execute: false },
      files.configPath,
      { releaseRoot: files.releaseRoot, packagePath: files.packagePath },
    );
    const command = remoteStatusCommand(plan, plan.items[0]);
    assert.match(command, /\/srv\/ideabox-release\/incoming\/codedoc\/stable\/win\/x64\/1\.0\.0/);
    assert.match(command, /\/srv\/ideabox-release\/archive\/codedoc\/stable\/win\/x64\/1\.0\.0/);
    assert.doesNotMatch(command, /IdeaBoxWebsite/);
  } finally {
    await rm(files.root, { recursive: true, force: true });
  }
});
