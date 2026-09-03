import assert from 'node:assert/strict';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtemp } from 'node:fs/promises';
import test from 'node:test';

import { buildPlan, executeCommand, parseArgs } from './release.mjs';

async function fixture({ artifactName = 'CodeDoc-1.0.1-mac-arm64.zip', metadataText } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ideabox-release-'));
  const artifact = join(directory, artifactName);
  const metadata = join(directory, 'latest-mac.yml');
  const registry = join(directory, 'apps.json');
  const manifest = join(directory, 'manifest.json');
  await writeFile(artifact, 'signed-update-payload');
  await writeFile(metadata, metadataText ?? `version: 1.0.1\npath: ${artifactName}\nsha512: placeholder\n`);
  await writeFile(registry, JSON.stringify({
    releaseContractVersion: 1,
    infrastructure: { bucket: 'test-bucket', publicBaseUrl: 'https://download.example.com' },
    apps: {
      codedoc: {
        channels: ['beta', 'stable'],
        targets: [{ platform: 'mac', arch: 'arm64', metadataNames: ['latest-mac.yml'] }],
      },
    },
  }));
  await writeFile(manifest, JSON.stringify({
    releaseContractVersion: 1,
    appSlug: 'codedoc',
    version: '1.0.1',
    channel: 'beta',
    target: { platform: 'mac', arch: 'arm64' },
    artifacts: [{ path: artifact, role: 'updater', referencedByMetadata: true }],
    metadata: [{ path: metadata, publishName: 'latest-mac.yml' }],
  }));
  return { directory, artifact, metadata, registry, manifest };
}

test('parseArgs keeps cloud writes disabled by default', () => {
  const options = parseArgs(['upload-artifacts', '--manifest', 'release.json']);
  assert.equal(options.execute, false);
});

test('buildPlan computes deterministic keys, size, and SHA-256', async () => {
  const files = await fixture();
  const plan = await buildPlan(files.manifest, files.registry);
  assert.equal(plan.artifacts[0].key, 'codedoc/beta/mac/arm64/CodeDoc-1.0.1-mac-arm64.zip');
  assert.equal(plan.artifacts[0].size, 21);
  assert.match(plan.artifacts[0].sha256, /^[a-f0-9]{64}$/);
  assert.equal(plan.confirmationToken, 'codedoc@1.0.1:beta:mac:arm64');
  assert.equal(plan.distributionMode, 'app-update');
});

test('buildPlan accepts an internal Windows installer without update metadata', async () => {
  const files = await fixture({ artifactName: 'CodeDoc-1.0.1-win-x64.exe' });
  const registry = JSON.parse(await readFile(files.registry, 'utf8'));
  registry.apps.codedoc.targets = [{
    platform: 'win',
    arch: 'x64',
    distributionMode: 'internal-download',
    metadataNames: [],
    requiredArtifactRoles: ['installer'],
    requireUpdaterBlockmap: false,
  }];
  await writeFile(files.registry, JSON.stringify(registry));
  const manifest = JSON.parse(await readFile(files.manifest, 'utf8'));
  manifest.target = { platform: 'win', arch: 'x64' };
  manifest.artifacts = [{ path: files.artifact, role: 'installer' }];
  manifest.metadata = [];
  await writeFile(files.manifest, JSON.stringify(manifest));

  const plan = await buildPlan(files.manifest, files.registry);
  assert.equal(plan.distributionMode, 'internal-download');
  assert.equal(plan.artifacts[0].role, 'installer');
  assert.deepEqual(plan.metadata, []);
});

test('buildPlan rejects update metadata for an internal-download target', async () => {
  const files = await fixture({ artifactName: 'CodeDoc-1.0.1-win-x64.exe' });
  const registry = JSON.parse(await readFile(files.registry, 'utf8'));
  registry.apps.codedoc.targets = [{
    platform: 'win', arch: 'x64', distributionMode: 'internal-download', metadataNames: [],
  }];
  await writeFile(files.registry, JSON.stringify(registry));
  const manifest = JSON.parse(await readFile(files.manifest, 'utf8'));
  manifest.target = { platform: 'win', arch: 'x64' };
  manifest.artifacts = [{ path: files.artifact, role: 'installer' }];
  await writeFile(files.manifest, JSON.stringify(manifest));

  await assert.rejects(() => buildPlan(files.manifest, files.registry), /must not publish update metadata/);
});

test('buildPlan rejects mutable latest artifact names', async () => {
  const files = await fixture({ artifactName: 'CodeDoc-1.0.1-latest.zip' });
  await assert.rejects(() => buildPlan(files.manifest, files.registry), /cannot use latest/);
});

test('buildPlan rejects metadata that does not reference updater payload', async () => {
  const files = await fixture({ metadataText: 'version: 1.0.1\npath: wrong.zip\n' });
  await assert.rejects(() => buildPlan(files.manifest, files.registry), /does not reference/);
});

test('buildPlan accepts a matching updater blockmap required by target policy', async () => {
  const files = await fixture();
  const blockmap = `${files.artifact}.blockmap`;
  await writeFile(blockmap, 'blockmap');
  const registry = JSON.parse(await readFile(files.registry, 'utf8'));
  registry.apps.codedoc.targets[0].requiredArtifactRoles = ['updater', 'blockmap'];
  registry.apps.codedoc.targets[0].requireUpdaterBlockmap = true;
  await writeFile(files.registry, JSON.stringify(registry));
  const manifest = JSON.parse(await readFile(files.manifest, 'utf8'));
  manifest.artifacts.push({ path: blockmap, role: 'blockmap' });
  await writeFile(files.manifest, JSON.stringify(manifest));

  const plan = await buildPlan(files.manifest, files.registry);
  assert.equal(plan.artifacts.length, 2);
  assert.equal(plan.artifacts[1].publishName, 'CodeDoc-1.0.1-mac-arm64.zip.blockmap');
});

test('buildPlan rejects a target missing its required updater blockmap', async () => {
  const files = await fixture();
  const registry = JSON.parse(await readFile(files.registry, 'utf8'));
  registry.apps.codedoc.targets[0].requiredArtifactRoles = ['updater', 'blockmap'];
  registry.apps.codedoc.targets[0].requireUpdaterBlockmap = true;
  await writeFile(files.registry, JSON.stringify(registry));

  await assert.rejects(() => buildPlan(files.manifest, files.registry), /requires an artifact with role blockmap/);
});

test('buildPlan rejects a blockmap without its matching payload', async () => {
  const files = await fixture();
  const orphan = join(files.directory, 'CodeDoc-1.0.1-other.zip.blockmap');
  await writeFile(orphan, 'orphan-blockmap');
  const manifest = JSON.parse(await readFile(files.manifest, 'utf8'));
  manifest.artifacts.push({ path: orphan, role: 'blockmap' });
  await writeFile(files.manifest, JSON.stringify(manifest));

  await assert.rejects(() => buildPlan(files.manifest, files.registry), /no matching payload artifact/);
});

test('publish-metadata execute requires exact confirmation token before ossutil', async () => {
  const files = await fixture();
  await assert.rejects(
    () => executeCommand({ command: 'publish-metadata', manifest: files.manifest, registry: files.registry, execute: true }),
    /requires --confirm/,
  );
});

test('upload command without --execute remains offline even when ossutil is unavailable', async () => {
  const files = await fixture();
  const previous = process.env.OSSUTIL_BIN;
  process.env.OSSUTIL_BIN = join(files.directory, 'does-not-exist');
  try {
    const result = await executeCommand({
      command: 'upload-artifacts',
      manifest: files.manifest,
      registry: files.registry,
      execute: false,
    });
    assert.match(result.output, /DRY RUN: no cloud writes were performed/);
  } finally {
    if (previous === undefined) delete process.env.OSSUTIL_BIN;
    else process.env.OSSUTIL_BIN = previous;
  }
});

test('artifact upload stops when remote absence cannot be proven', async () => {
  const files = await fixture();
  const fakeOssutil = join(files.directory, 'fake-ossutil-error.sh');
  await writeFile(fakeOssutil, '#!/bin/sh\necho "network timeout" >&2\nexit 1\n');
  await chmod(fakeOssutil, 0o700);
  const previous = process.env.OSSUTIL_BIN;
  process.env.OSSUTIL_BIN = fakeOssutil;
  try {
    await assert.rejects(
      () => executeCommand({ command: 'upload-artifacts', manifest: files.manifest, registry: files.registry, execute: true }),
      /Cannot prove.*is absent/,
    );
  } finally {
    if (previous === undefined) delete process.env.OSSUTIL_BIN;
    else process.env.OSSUTIL_BIN = previous;
  }
});

test('artifact upload refuses an existing remote key', async () => {
  const files = await fixture();
  const fakeOssutil = join(files.directory, 'fake-ossutil.sh');
  await writeFile(fakeOssutil, '#!/bin/sh\n[ "$1" = "stat" ] && exit 0\nexit 1\n');
  await chmod(fakeOssutil, 0o700);
  const previous = process.env.OSSUTIL_BIN;
  process.env.OSSUTIL_BIN = fakeOssutil;
  try {
    await assert.rejects(
      () => executeCommand({ command: 'upload-artifacts', manifest: files.manifest, registry: files.registry, execute: true }),
      /Refusing to overwrite immutable artifact/,
    );
  } finally {
    if (previous === undefined) delete process.env.OSSUTIL_BIN;
    else process.env.OSSUTIL_BIN = previous;
  }
});

test('artifact upload uses the selected profile and verifies an OSS read-back hash', async () => {
  const files = await fixture();
  const fakeOssutil = join(files.directory, 'fake-ossutil-success.sh');
  const fakeObject = join(files.directory, 'remote-object');
  const fakeLog = join(files.directory, 'ossutil.log');
  await writeFile(fakeOssutil, `#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_OSS_LOG"
case "$1" in
  stat)
    if [ -f "$FAKE_OSS_OBJECT" ]; then exit 0; fi
    echo 'NoSuchKey: object does not exist' >&2
    exit 1
    ;;
  cp)
    case "$2" in
      oss://*) cp "$FAKE_OSS_OBJECT" "$3" ;;
      *) cp "$2" "$FAKE_OSS_OBJECT" ;;
    esac
    ;;
esac
`);
  await chmod(fakeOssutil, 0o700);
  const previous = {
    binary: process.env.OSSUTIL_BIN,
    config: process.env.OSSUTIL_CONFIG_FILE,
    profile: process.env.OSSUTIL_PROFILE,
    object: process.env.FAKE_OSS_OBJECT,
    log: process.env.FAKE_OSS_LOG,
  };
  Object.assign(process.env, {
    OSSUTIL_BIN: fakeOssutil,
    OSSUTIL_CONFIG_FILE: '/etc/ideabox-release/ossutilconfig',
    OSSUTIL_PROFILE: 'release',
    FAKE_OSS_OBJECT: fakeObject,
    FAKE_OSS_LOG: fakeLog,
  });
  try {
    const progress = [];
    const result = await executeCommand({
      command: 'upload-artifacts',
      manifest: files.manifest,
      registry: files.registry,
      execute: true,
    }, { log: (message) => progress.push(message) });
    assert.match(result.output, /artifacts phase completed/);
    const progressText = progress.join('\n');
    assert.match(progressText, /\[oss\] preflight 1\//);
    assert.match(progressText, /\[oss\] upload START:/);
    assert.match(progressText, /\[oss\] upload SUCCESS:/);
    assert.match(progressText, /\[oss\] read-back SUCCESS:/);
    const log = await readFile(fakeLog, 'utf8');
    assert.match(log, /--config-file \/etc\/ideabox-release\/ossutilconfig --profile release/);
    assert.match(log, /cp oss:\/\/test-bucket\//);
  } finally {
    const restore = (name, value) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore('OSSUTIL_BIN', previous.binary);
    restore('OSSUTIL_CONFIG_FILE', previous.config);
    restore('OSSUTIL_PROFILE', previous.profile);
    restore('FAKE_OSS_OBJECT', previous.object);
    restore('FAKE_OSS_LOG', previous.log);
  }
});
