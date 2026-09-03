import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { buildChecklist, writeReleaseRecord } from './prepare-release.mjs';
import { buildHandoffPlan, executeHandoff, parseHandoffArgs } from './publish-via-host.mjs';

async function createRepository(directory) {
  const repositoryPath = join(directory, 'CodeSucker');
  await mkdir(repositoryPath);
  const run = (args) => {
    const result = spawnSync('git', ['-C', repositoryPath, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  run(['init', '--quiet']);
  run(['config', 'user.name', 'Release Test']);
  run(['config', 'user.email', 'release-test@example.com']);
  await writeFile(join(repositoryPath, 'README.md'), 'fixture\n');
  run(['add', 'README.md']);
  run(['commit', '--quiet', '-m', 'fixture']);
  const commit = run(['rev-parse', 'HEAD']);
  run(['tag', 'v1.0.1']);
  return { repositoryPath, commit };
}

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'ideabox-host-handoff-'));
  const updater = join(directory, 'CodeDoc-1.0.1-mac-arm64.zip');
  const blockmap = `${updater}.blockmap`;
  const metadata = join(directory, 'latest-mac.yml');
  const registry = join(directory, 'apps.json');
  const manifest = join(directory, 'manifest.json');
  const record = join(directory, 'mac-arm64.json');
  const source = await createRepository(directory);
  await writeFile(updater, 'signed-update-payload');
  await writeFile(blockmap, 'blockmap');
  await writeFile(metadata, 'version: 1.0.1\npath: CodeDoc-1.0.1-mac-arm64.zip\nsha512: placeholder\n');
  await writeFile(registry, JSON.stringify({
    releaseContractVersion: 1,
    infrastructure: { bucket: 'test-bucket', publicBaseUrl: 'https://download.example.com' },
    apps: {
      codedoc: {
        channels: ['beta'],
        targets: [{
          platform: 'mac',
          arch: 'arm64',
          metadataNames: ['latest-mac.yml'],
          requiredArtifactRoles: ['updater', 'blockmap'],
          requireUpdaterBlockmap: true,
        }],
      },
    },
  }));
  await writeFile(manifest, JSON.stringify({
    releaseContractVersion: 1,
    appSlug: 'codedoc',
    version: '1.0.1',
    channel: 'beta',
    target: { platform: 'mac', arch: 'arm64' },
    source: {
      repository: 'CodeSucker',
      repositoryPath: source.repositoryPath,
      commit: source.commit,
      tag: 'v1.0.1',
    },
    verification: {
      releaseBuild: 'passed',
      bundleId: 'com.ideaboxapps.codedoc',
      signing: 'passed',
      notarization: 'accepted',
      notarizationSubmissionId: '00000000-0000-0000-0000-000000000000',
      gatekeeper: 'passed',
    },
    artifacts: [
      { path: updater, role: 'updater', referencedByMetadata: true },
      { path: blockmap, role: 'blockmap' },
    ],
    metadata: [{ path: metadata, publishName: 'latest-mac.yml' }],
  }));
  const checklist = await buildChecklist(manifest, registry);
  await writeReleaseRecord(checklist, record);
  return { directory, registry, manifest, record };
}

test('parseHandoffArgs is dry-run by default and validates server syntax', () => {
  const options = parseHandoffArgs(['--manifest', 'manifest.json']);
  assert.equal(options.execute, false);
  assert.equal(options.server, 'ideabox-release@47.98.192.155');
  assert.throws(
    () => parseHandoffArgs(['--manifest', 'manifest.json', '--server', 'root@host;rm']),
    /server must use the form/,
  );
});

test('buildHandoffPlan uses an isolated version directory and validated record', async () => {
  const files = await fixture();
  const options = parseHandoffArgs([
    '--manifest', files.manifest,
    '--registry', files.registry,
    '--record', files.record,
  ]);
  const plan = await buildHandoffPlan(options);
  assert.equal(plan.remoteDirectory, '/srv/ideabox-release/incoming/codedoc/beta/mac/arm64/1.0.1');
  assert.equal(plan.files.length, 4);
  assert.equal(plan.files.find((file) => file.kind === 'metadata').remoteName, 'latest-mac.yml');
  assert.equal(plan.confirmationToken, 'handoff:codedoc@1.0.1:beta:mac:arm64');
});

test('dry-run never invokes ssh or rsync', async () => {
  const files = await fixture();
  const previousSsh = process.env.IDEABOX_SSH_BIN;
  const previousRsync = process.env.IDEABOX_RSYNC_BIN;
  process.env.IDEABOX_SSH_BIN = join(files.directory, 'missing-ssh');
  process.env.IDEABOX_RSYNC_BIN = join(files.directory, 'missing-rsync');
  try {
    const options = parseHandoffArgs([
      '--manifest', files.manifest,
      '--registry', files.registry,
      '--record', files.record,
    ]);
    const result = await executeHandoff(options);
    assert.match(result.output, /DRY RUN: no server writes were performed/);
  } finally {
    if (previousSsh === undefined) delete process.env.IDEABOX_SSH_BIN;
    else process.env.IDEABOX_SSH_BIN = previousSsh;
    if (previousRsync === undefined) delete process.env.IDEABOX_RSYNC_BIN;
    else process.env.IDEABOX_RSYNC_BIN = previousRsync;
  }
});

test('execute requires the exact handoff confirmation token before server writes', async () => {
  const files = await fixture();
  const options = parseHandoffArgs([
    '--manifest', files.manifest,
    '--registry', files.registry,
    '--record', files.record,
    '--execute',
  ]);
  await assert.rejects(() => executeHandoff(options), /Server handoff requires --confirm/);
});
