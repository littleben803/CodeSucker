import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  TARGETS,
  builderCommand,
  createReleaseManifest,
  defaultChannelForVersion,
  electronArtifactName,
  electronDownloadCommand,
  electronDownloadUrl,
  findVerifiedElectronArtifact,
  parseBuildConfirmation,
  parsePackageArgs,
  parseTargetSelection,
  validateChannelVersion,
} from './package-release.mjs';

test('interactive package arguments keep local writes gated by confirmation', () => {
  const options = parsePackageArgs([]);
  assert.equal(options.channel, undefined);
  assert.equal(options.targets, undefined);
  assert.equal(options.yes, false);
  assert.equal(options.dryRun, false);
});

test('build confirmation defaults to yes and accepts y/n case-insensitively', () => {
  assert.equal(parseBuildConfirmation(''), true);
  assert.equal(parseBuildConfirmation('y'), true);
  assert.equal(parseBuildConfirmation('Y'), true);
  assert.equal(parseBuildConfirmation('n'), false);
  assert.equal(parseBuildConfirmation('N'), false);
  assert.equal(parseBuildConfirmation('1'), undefined);
});

test('non-interactive arguments select a channel and all targets', () => {
  const options = parsePackageArgs(['--channel', 'beta', '--targets', 'all', '--yes']);
  assert.equal(options.channel, 'beta');
  assert.equal(options.targets, 'all');
  assert.equal(options.yes, true);
  assert.deepEqual(parseTargetSelection(options.targets), ['mac-arm64', 'mac-x64', 'win-x64']);
});

test('target selection is deterministic and rejects unknown targets', () => {
  assert.deepEqual(parseTargetSelection('mac-x64,mac-arm64,mac-x64'), ['mac-x64', 'mac-arm64']);
  assert.throws(() => parseTargetSelection('linux-x64'), /未知构建目标/);
});

test('Electron runtime names and curl commands match every packaging target', () => {
  assert.equal(electronArtifactName(TARGETS['mac-arm64'], '43.2.0'), 'electron-v43.2.0-darwin-arm64.zip');
  assert.equal(electronArtifactName(TARGETS['mac-x64'], '43.2.0'), 'electron-v43.2.0-darwin-x64.zip');
  assert.equal(electronArtifactName(TARGETS['win-x64'], '43.2.0'), 'electron-v43.2.0-win32-x64.zip');
  assert.equal(
    electronDownloadUrl(TARGETS['win-x64'], '43.2.0'),
    'https://github.com/electron/electron/releases/download/v43.2.0/electron-v43.2.0-win32-x64.zip',
  );
  const command = electronDownloadCommand(TARGETS['mac-arm64'], '43.2.0', '/tmp/codedoc-electron');
  assert.match(command, /^curl --fail --location --progress-bar --create-dirs /);
  assert.match(command, /electron-v43\.2\.0-darwin-arm64\.zip/);
  const builder = builderCommand(TARGETS['mac-arm64'], '/tmp/output', '/tmp/electron-arm64.zip');
  assert.ok(builder.args.includes('--config.electronDist=/tmp/electron-arm64.zip'));
});

test('Electron runtime cache is accepted only when SHA-256 matches', async () => {
  const validRoot = await mkdtemp(join(tmpdir(), 'codedoc-electron-valid-'));
  const invalidRoot = await mkdtemp(join(tmpdir(), 'codedoc-electron-invalid-'));
  const artifactName = 'electron-v43.2.0-darwin-arm64.zip';
  const payload = Buffer.from('verified Electron fixture');
  const nestedDirectory = join(validRoot, 'content-addressed');
  await mkdir(nestedDirectory);
  await writeFile(join(nestedDirectory, artifactName), payload);
  await writeFile(join(invalidRoot, artifactName), 'tampered');
  const expectedSha256 = createHash('sha256').update(payload).digest('hex');

  const valid = await findVerifiedElectronArtifact({
    artifactName, expectedSha256, cacheRoots: [invalidRoot, validRoot],
  });
  assert.equal(valid.path, join(nestedDirectory, artifactName));
  assert.equal(valid.invalid.length, 1);

  const missing = await findVerifiedElectronArtifact({
    artifactName, expectedSha256, cacheRoots: [invalidRoot],
  });
  assert.equal(missing.path, null);
  assert.match(missing.invalid[0].reason, /SHA-256 不匹配/);
});

test('release channel must match the committed application version', () => {
  assert.equal(defaultChannelForVersion('1.2.3-beta.4'), 'beta');
  assert.equal(defaultChannelForVersion('1.2.3'), 'stable');
  assert.equal(validateChannelVersion('beta', '1.2.3-beta.4'), '1.2.3-beta.4');
  assert.equal(validateChannelVersion('stable', '1.2.3'), '1.2.3');
  assert.throws(() => validateChannelVersion('stable', '1.2.3-beta.4'), /Stable 通道要求/);
  assert.throws(() => validateChannelVersion('beta', '1.2.3'), /Beta 通道要求/);
});

test('macOS manifest carries updater metadata and commit-only provenance', () => {
  const result = {
    verification: {
      releaseBuild: 'passed', signing: 'passed', bundleId: 'com.ideaboxapps.codedoc',
      notarization: 'accepted', notarizationSubmissionId: '00000000-0000-0000-0000-000000000000',
      gatekeeper: 'passed',
    },
    artifacts: [
      { path: '/tmp/CodeDoc-1.2.3-beta.4-mac-arm64.zip', role: 'updater', referencedByMetadata: true },
    ],
    metadata: [{ path: '/tmp/beta-mac.yml', publishName: 'latest-mac.yml' }],
  };
  const manifest = createReleaseManifest({
    target: TARGETS['mac-arm64'],
    version: '1.2.3-beta.4',
    channel: 'beta',
    commit: '0123456789abcdef0123456789abcdef01234567',
    repositoryPath: '/tmp/CodeSucker',
    result,
  });
  assert.equal(manifest.source.tag, undefined);
  assert.equal(manifest.artifacts[0].referencedByMetadata, true);
  assert.equal(manifest.metadata[0].publishName, 'latest-mac.yml');
});

test('Windows internal manifest contains an installer and no update metadata', () => {
  const result = {
    verification: { releaseBuild: 'passed', signing: 'not-required-internal' },
    artifacts: [{ path: '/tmp/CodeDoc-1.2.3-win-x64.exe', role: 'installer' }],
    metadata: [],
  };
  const manifest = createReleaseManifest({
    target: TARGETS['win-x64'],
    version: '1.2.3',
    channel: 'stable',
    commit: '0123456789abcdef0123456789abcdef01234567',
    repositoryPath: '/tmp/CodeSucker',
    result,
  });
  assert.equal(TARGETS['win-x64'].distributionMode, 'internal-download');
  assert.equal(manifest.verification.signing, 'not-required-internal');
  assert.deepEqual(manifest.metadata, []);
});
