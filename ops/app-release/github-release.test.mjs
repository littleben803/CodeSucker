import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';

import { buildGitHubMetadata, executeGitHubRelease } from './github-release.mjs';

function macPlan(id, arch, metadataPath) {
  return {
    target: { id, platform: 'mac', arch },
    plan: { metadata: [{ publishName: 'latest-mac.yml', localPath: metadataPath }] },
  };
}

test('GitHub metadata aggregates both macOS architectures and emits a beta alias', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codedoc-github-metadata-'));
  try {
    await mkdir(directory, { recursive: true });
    const arm = join(directory, 'arm.yml');
    const x64 = join(directory, 'x64.yml');
    await writeFile(arm, `version: 1.0.1-beta.1
files:
  - url: CodeDoc-1.0.1-beta.1-mac-arm64.zip
    sha512: arm-sha
    size: 101
path: CodeDoc-1.0.1-beta.1-mac-arm64.zip
sha512: arm-sha
releaseDate: '2026-09-03T00:00:00.000Z'
`);
    await writeFile(x64, `version: 1.0.1-beta.1
files:
  - url: CodeDoc-1.0.1-beta.1-mac-x64.zip
    sha512: x64-sha
    size: 202
path: CodeDoc-1.0.1-beta.1-mac-x64.zip
sha512: x64-sha
releaseDate: '2026-09-03T00:01:00.000Z'
`);
    const metadata = await buildGitHubMetadata('1.0.1-beta.1', 'beta', [
      macPlan('mac-arm64', 'arm64', arm),
      macPlan('mac-x64', 'x64', x64),
    ]);
    assert.deepEqual(metadata.map((entry) => entry.name), ['latest-mac.yml', 'beta-mac.yml']);
    assert.equal(metadata[0].content, metadata[1].content);
    assert.match(metadata[0].content, /mac-arm64\.zip/);
    assert.match(metadata[0].content, /mac-x64\.zip/);
    assert.match(metadata[0].content, /2026-09-03T00:01:00\.000Z/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('GitHub execute creates a draft, uploads without clobber, verifies, publishes, and records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codedoc-github-execute-'));
  const installerPath = join(directory, 'CodeDoc-1.0.1-win-x64.exe');
  const publishedPath = join(directory, 'published.json');
  await writeFile(installerPath, 'installer');
  const attachments = [
    {
      kind: 'artifact', role: 'installer', targetId: 'win-x64', name: basename(installerPath),
      localPath: installerPath, size: 9, sha256: 'installer-sha', uploadStatus: 'pending',
      publicUrl: `https://github.com/littleben803/CodeSucker/releases/download/v1.0.1/${basename(installerPath)}`,
    },
    {
      kind: 'metadata', role: 'windows-version', name: 'latest-win.yml', content: 'version: 1.0.1\n',
      size: 15, sha256: 'metadata-sha', uploadStatus: 'pending',
      publicUrl: 'https://github.com/littleben803/CodeSucker/releases/download/v1.0.1/latest-win.yml',
    },
  ];
  const targetPlan = {
    target: { id: 'win-x64', platform: 'win', arch: 'x64' },
    paths: { publishedPath },
    record: {
      releaseContractVersion: 1,
      distributionMode: 'internal-download',
      source: { repository: 'CodeSucker', commit: 'abc' },
    },
  };
  const plan = {
    config: { app: { slug: 'codedoc' } },
    provider: {}, version: '1.0.1', channel: 'stable', tag: 'v1.0.1', prerelease: false,
    sourceCommit: 'abc', preflight: { repository: 'littleben803/CodeSucker', releaseState: 'absent' },
    attachments, targetPlans: [targetPlan],
    installerUrls: [{ targetId: 'win-x64', url: attachments[0].publicUrl }],
    publishedPath,
  };
  let releaseState = 'absent';
  const remoteAssets = [];
  const commands = [];
  const runCommand = async (args) => {
    commands.push(args);
    if (args[1] === 'create') releaseState = 'draft';
    if (args[1] === 'upload') {
      const attachment = attachments.find((entry) => entry.name === basename(args[3]));
      remoteAssets.push({
        name: attachment.name,
        size: attachment.size,
        digest: `sha256:${attachment.sha256}`,
        state: 'uploaded',
        publicUrl: attachment.publicUrl,
      });
    }
    if (args[1] === 'edit') releaseState = 'published';
  };
  const inspectGitHub = () => ({
    repository: 'littleben803/CodeSucker', releaseState,
    releaseInfo: { prerelease: false, url: 'https://github.com/littleben803/CodeSucker/releases/tag/v1.0.1', assets: remoteAssets },
  });
  try {
    const logs = [];
    const result = await executeGitHubRelease(plan, { runCommand, inspectGitHub, log: (line) => logs.push(line) });
    assert.equal(result, 'Release sync completed.');
    assert.equal(releaseState, 'published');
    assert.ok(commands.some((args) => args[1] === 'create' && args.includes('--verify-tag')));
    assert.ok(commands.some((args) => args[1] === 'edit' && args.includes('--latest')));
    assert.ok(commands.every((args) => !args.includes('--clobber')));
    const saved = JSON.parse(await readFile(publishedPath, 'utf8'));
    assert.equal(saved.targets[0].provider, 'github');
    assert.equal(saved.targets[0].release.tag, 'v1.0.1');
    assert.match(logs.join('\n'), /Published installer URLs:/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('GitHub execute resumes an existing draft and skips verified assets', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codedoc-github-resume-'));
  const installerPath = join(directory, 'CodeDoc-1.0.1-win-x64.exe');
  const publishedPath = join(directory, 'published.json');
  await writeFile(installerPath, 'installer');
  const attachment = {
    kind: 'artifact', role: 'installer', targetId: 'win-x64', name: basename(installerPath),
    localPath: installerPath, size: 9, sha256: 'installer-sha', uploadStatus: 'verified-existing',
    publicUrl: `https://github.com/littleben803/CodeSucker/releases/download/v1.0.1/${basename(installerPath)}`,
  };
  const targetPlan = {
    target: { id: 'win-x64', platform: 'win', arch: 'x64' },
    paths: { publishedPath },
    record: {
      releaseContractVersion: 1,
      distributionMode: 'internal-download',
      source: { repository: 'CodeSucker', commit: 'abc' },
    },
  };
  const commands = [];
  let releaseState = 'draft';
  const inspections = [];
  const inspectGitHub = (...args) => {
    inspections.push(args);
    return ({
    repository: 'littleben803/CodeSucker', releaseState,
    releaseInfo: {
      prerelease: false,
      url: 'https://github.com/littleben803/CodeSucker/releases/tag/v1.0.1',
      assets: [{
        name: attachment.name, size: attachment.size, digest: `sha256:${attachment.sha256}`,
        state: 'uploaded', publicUrl: attachment.publicUrl,
      }],
    },
    });
  };
  const runCommand = async (args) => {
    commands.push(args);
    if (args[1] === 'edit') releaseState = 'published';
  };
  const plan = {
    config: { app: { slug: 'codedoc' } }, provider: {}, version: '1.0.1', channel: 'stable',
    tag: 'v1.0.1', prerelease: false, sourceCommit: 'abc',
    preflight: inspectGitHub(), attachments: [attachment], targetPlans: [targetPlan],
    installerUrls: [{ targetId: 'win-x64', url: attachment.publicUrl }], publishedPath,
  };
  inspections.length = 0;
  try {
    await executeGitHubRelease(plan, { runCommand, inspectGitHub });
    assert.ok(commands.some((args) => args[1] === 'edit'));
    assert.ok(commands.every((args) => args[1] !== 'create' && args[1] !== 'upload'));
    assert.ok(inspections.every((args) => args[3]?.skipAccessChecks === true));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
