import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildChecklist,
  createReleaseRecord,
  parsePrepareArgs,
  stageRelease,
  writeReleaseRecord,
} from './prepare-release.mjs';

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

async function fixture({ gatekeeper = 'passed' } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'ideabox-prepare-release-'));
  const updater = join(directory, 'CodeDoc-1.0.1-mac-arm64.zip');
  const blockmap = `${updater}.blockmap`;
  const metadata = join(directory, 'latest-mac.yml');
  const registry = join(directory, 'apps.json');
  const manifest = join(directory, 'manifest.json');
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
      gatekeeper,
    },
    artifacts: [
      { path: updater, role: 'updater', referencedByMetadata: true },
      { path: blockmap, role: 'blockmap' },
    ],
    metadata: [{ path: metadata, publishName: 'latest-mac.yml' }],
  }));
  return { directory, registry, manifest };
}

test('parsePrepareArgs accepts checklist without enabling writes', () => {
  const options = parsePrepareArgs(['checklist', '--manifest', 'manifest.json']);
  assert.equal(options.command, 'checklist');
  assert.equal(options.output, undefined);
});

test('stageRelease copies artifacts under the ignored work layout and applies publishName', async () => {
  const files = await fixture();
  const outputDirectory = join(files.directory, 'staged');
  const staged = await stageRelease(files.manifest, files.registry, outputDirectory);
  const manifest = JSON.parse(await readFile(staged.manifestPath, 'utf8'));
  assert.equal(manifest.artifacts[0].path, 'files/CodeDoc-1.0.1-mac-arm64.zip');
  assert.equal(manifest.metadata[0].path, 'files/latest-mac.yml');
  assert.equal(staged.checklist.plan.metadata[0].publishName, 'latest-mac.yml');
  await assert.rejects(
    () => stageRelease(files.manifest, files.registry, outputDirectory),
    /Refusing to overwrite staged file/,
  );
});

test('buildChecklist validates source, signing, notarization, hashes, and blockmap policy', async () => {
  const files = await fixture();
  const checklist = await buildChecklist(files.manifest, files.registry);
  assert.equal(checklist.status, 'passed');
  assert.equal(checklist.checks.length, 6);
  assert.equal(checklist.plan.artifacts.length, 2);
});

test('buildChecklist accepts commit-only source provenance without a Git tag', async () => {
  const files = await fixture();
  const manifest = JSON.parse(await readFile(files.manifest, 'utf8'));
  delete manifest.source.tag;
  await writeFile(files.manifest, JSON.stringify(manifest));

  const checklist = await buildChecklist(files.manifest, files.registry);
  assert.equal(checklist.source.tag, undefined);
  assert.match(checklist.checks.find((entry) => entry.id === 'source-revision').detail, /commit-only/);
});

test('buildChecklist accepts an unsigned internal Windows installer', async () => {
  const files = await fixture();
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
  delete manifest.source.tag;
  manifest.target = { platform: 'win', arch: 'x64' };
  manifest.verification = { releaseBuild: 'passed', signing: 'not-required-internal' };
  manifest.artifacts = [{ path: manifest.artifacts[0].path, role: 'installer' }];
  manifest.metadata = [];
  await writeFile(files.manifest, JSON.stringify(manifest));

  const checklist = await buildChecklist(files.manifest, files.registry);
  assert.equal(checklist.plan.distributionMode, 'internal-download');
  assert.equal(checklist.verification.signing, 'not-required-internal');
  assert.deepEqual(checklist.plan.metadata, []);
});

test('buildChecklist preserves Gatekeeper disabled state as a warning', async () => {
  const files = await fixture({ gatekeeper: 'disabled-warning' });
  const checklist = await buildChecklist(files.manifest, files.registry);
  assert.equal(checklist.status, 'warning');
  assert.equal(checklist.warnings.length, 1);
});

test('release record excludes local paths and contains deterministic public file evidence', async () => {
  const files = await fixture();
  const checklist = await buildChecklist(files.manifest, files.registry);
  const record = createReleaseRecord(checklist, '2026-09-02T00:00:00.000Z');
  const text = JSON.stringify(record);
  assert.equal(record.recordedAt, '2026-09-02T00:00:00.000Z');
  assert.equal(record.artifacts[0].publishName, 'CodeDoc-1.0.1-mac-arm64.zip');
  assert.equal('localPath' in record.artifacts[0], false);
  assert.equal(text.includes(files.directory), false);
});

test('release record writer creates one aggregate file and refuses to overwrite target history', async () => {
  const files = await fixture();
  const checklist = await buildChecklist(files.manifest, files.registry);
  const output = join(files.directory, 'record.json');
  await writeReleaseRecord(checklist, output);
  const saved = JSON.parse(await readFile(output, 'utf8'));
  assert.equal(saved.appSlug, 'codedoc');
  assert.equal(saved.recordType, 'prepared-release-collection');
  assert.equal(saved.targets.length, 1);
  await assert.rejects(() => writeReleaseRecord(checklist, output), /Refusing to overwrite/);
});

test('checklist rejects credential-like fields in a manifest', async () => {
  const files = await fixture();
  const manifest = JSON.parse(await readFile(files.manifest, 'utf8'));
  manifest.accessKeySecret = 'must-never-be-recorded';
  await writeFile(files.manifest, JSON.stringify(manifest));
  await assert.rejects(() => buildChecklist(files.manifest, files.registry), /cannot contain credentials/);
});
