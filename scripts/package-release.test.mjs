import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TARGETS,
  createReleaseManifest,
  defaultChannelForVersion,
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
