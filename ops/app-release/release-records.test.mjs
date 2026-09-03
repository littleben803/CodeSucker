import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  appendTargetRecord,
  createReleaseCollection,
  readTargetRecord,
  selectTargetRecord,
} from './release-records.mjs';

function record(platform, arch) {
  return {
    releaseRecordVersion: 1,
    recordType: 'prepared-release',
    appSlug: 'codedoc',
    version: '1.0.0',
    channel: 'stable',
    target: { platform, arch },
    artifacts: [],
    metadata: [],
  };
}

function publishedRecord(provider, platform = 'mac', arch = 'arm64') {
  return {
    ...record(platform, arch),
    recordType: 'published-release',
    provider,
  };
}

test('release collection keeps target records grouped and selectable', () => {
  const arm64 = record('mac', 'arm64');
  const collection = createReleaseCollection(arm64);
  assert.equal(collection.recordType, 'prepared-release-collection');
  assert.equal(selectTargetRecord(collection, {
    appSlug: 'codedoc', version: '1.0.0', channel: 'stable', platform: 'mac', arch: 'arm64',
  }, 'prepared-release'), arm64);
});

test('aggregate writer appends targets but refuses to replace one target history', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codedoc-release-records-'));
  const output = join(directory, 'prepared.json');
  try {
    await appendTargetRecord(output, record('win', 'x64'), 'prepared release');
    await appendTargetRecord(output, record('mac', 'arm64'), 'prepared release');
    const saved = JSON.parse(await readFile(output, 'utf8'));
    assert.deepEqual(saved.targets.map((entry) => `${entry.target.platform}-${entry.target.arch}`), [
      'mac-arm64', 'win-x64',
    ]);
    assert.ok(await readTargetRecord(output, {
      appSlug: 'codedoc', version: '1.0.0', channel: 'stable', platform: 'win', arch: 'x64',
    }, 'prepared-release'));
    await assert.rejects(
      () => appendTargetRecord(output, record('win', 'x64'), 'prepared release'),
      /Refusing to overwrite existing prepared release target/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('published collection uses provider plus target as its identity and reads legacy OSS records', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codedoc-published-records-'));
  const output = join(directory, 'published.json');
  try {
    const legacyOss = publishedRecord(undefined);
    const collection = createReleaseCollection(legacyOss);
    collection.releaseCollectionVersion = 1;
    await writeFile(output, `${JSON.stringify(collection, null, 2)}\n`);
    await appendTargetRecord(output, publishedRecord('github'), 'published release');
    const saved = JSON.parse(await readFile(output, 'utf8'));
    assert.equal(saved.releaseCollectionVersion, 2);
    assert.deepEqual(saved.targets.map((entry) => entry.provider ?? 'oss'), ['github', 'oss']);
    assert.ok(await readTargetRecord(output, {
      appSlug: 'codedoc', version: '1.0.0', channel: 'stable', platform: 'mac', arch: 'arm64', provider: 'oss',
    }, 'published-release'));
    assert.ok(await readTargetRecord(output, {
      appSlug: 'codedoc', version: '1.0.0', channel: 'stable', platform: 'mac', arch: 'arm64', provider: 'github',
    }, 'published-release'));
    await assert.rejects(
      () => appendTargetRecord(output, publishedRecord('github'), 'published release'),
      /Refusing to overwrite existing published release target github:mac-arm64/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
