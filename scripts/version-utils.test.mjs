import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { ensureChangelogVersion, localDateString } from './version-utils.mjs';

test('localDateString uses the local calendar date', () => {
  assert.equal(localDateString(new Date(2026, 8, 3, 23, 59)), '2026-09-03');
});

test('ensureChangelogVersion inserts the requested template before history and is idempotent', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'codedoc-version-'));
  const changelogPath = join(directory, 'CHANGELOG.md');
  try {
    await writeFile(changelogPath, '# Changelog\n\n说明文字。\n\n## [1.0.0] - 2026-09-02\n\n旧内容。\n');
    assert.deepEqual(ensureChangelogVersion('1.0.1', {
      filePath: changelogPath,
      date: '2026-09-03',
    }), { added: true, date: '2026-09-03' });
    const once = await readFile(changelogPath, 'utf8');
    assert.match(once, /说明文字。\n\n## \[1\.0\.1\] - 2026-09-03\n\n### Added\n\n### Changed\n\n## \[1\.0\.0\]/);
    assert.deepEqual(ensureChangelogVersion('1.0.1', {
      filePath: changelogPath,
      date: '2026-09-04',
    }), { added: false, date: '2026-09-04' });
    assert.equal(await readFile(changelogPath, 'utf8'), once);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
