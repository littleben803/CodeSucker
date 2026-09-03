import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
