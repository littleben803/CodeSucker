import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { executeServerCommand, parseServerArgs, verifyUrl } from './publish-release.mjs';

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ideabox-server-release-'));
  const incomingBase = join(root, 'incoming');
  const archiveBase = join(root, 'archive');
  const releaseDirectory = join(incomingBase, 'codedoc', 'beta', 'mac', 'arm64', '1.0.1-beta.2');
  await mkdir(releaseDirectory, { recursive: true });
  await mkdir(archiveBase);
  const updaterName = 'CodeDoc-1.0.1-beta.2-mac-arm64.zip';
  const blockmapName = `${updaterName}.blockmap`;
  const metadataName = 'latest-mac.yml';
  const updater = 'signed updater';
  const blockmap = 'blockmap';
  const metadata = `version: 1.0.1-beta.2\npath: ${updaterName}\nsha512: placeholder\n`;
  await writeFile(join(releaseDirectory, updaterName), updater);
  await writeFile(join(releaseDirectory, blockmapName), blockmap);
  await writeFile(join(releaseDirectory, metadataName), metadata);
  await writeFile(join(releaseDirectory, '.ready'), '');

  const registry = join(root, 'apps.json');
  const publicBaseUrl = 'https://download.example.com';
  await writeFile(registry, JSON.stringify({
    releaseContractVersion: 1,
    infrastructure: { bucket: 'test-bucket', publicBaseUrl },
    apps: {
      codedoc: {
        channels: ['beta'],
        targets: [{
          platform: 'mac',
          arch: 'arm64',
          metadataNames: [metadataName],
          requiredArtifactRoles: ['updater', 'blockmap'],
          requireUpdaterBlockmap: true,
        }],
      },
    },
  }));
  const baseKey = 'codedoc/beta/mac/arm64';
  const item = (publishName, role, contents, referencedByMetadata = false) => ({
    role,
    publishName,
    key: `${baseKey}/${publishName}`,
    publicUrl: `${publicBaseUrl}/${baseKey}/${publishName}`,
    size: Buffer.byteLength(contents),
    sha256: digest(contents),
    ...(referencedByMetadata ? { referencedByMetadata: true } : {}),
  });
  const record = {
    releaseRecordVersion: 1,
    recordType: 'prepared-release',
    releaseContractVersion: 1,
    appSlug: 'codedoc',
    version: '1.0.1-beta.2',
    channel: 'beta',
    target: { platform: 'mac', arch: 'arm64' },
    source: { repository: 'CodeSucker', commit: 'a'.repeat(40), tag: 'v1.0.1-beta.2' },
    verification: { releaseBuild: 'passed', signing: 'passed' },
    confirmationToken: 'codedoc@1.0.1-beta.2:beta:mac:arm64',
    artifacts: [
      item(updaterName, 'updater', updater, true),
      item(blockmapName, 'blockmap', blockmap),
    ],
    metadata: [item(metadataName, 'metadata', metadata)],
    checklist: { status: 'passed', checks: [], warnings: [] },
  };
  await writeFile(join(releaseDirectory, 'mac-arm64.prepared.json'), JSON.stringify(record));
  return { root, incomingBase, archiveBase, releaseDirectory, registry, updaterName };
}

test('parseServerArgs keeps server and cloud writes disabled by default', () => {
  const options = parseServerArgs(['plan', '--release-dir', '/srv/ideabox-release/incoming/a']);
  assert.equal(options.execute, false);
});

test('plan validates incoming hashes and leaves no server manifest behind', async () => {
  const files = await fixture();
  const output = await executeServerCommand({
    command: 'plan',
    execute: false,
    releaseDirectory: files.releaseDirectory,
    incomingBase: files.incomingBase,
    archiveBase: files.archiveBase,
    registry: files.registry,
  });
  assert.match(output, /DRY RUN: no server or cloud state was changed/);
  await assert.rejects(() => readFile(join(files.releaseDirectory, '.server-manifest.json')), /ENOENT/);
});

test('plan rejects a file changed after the prepared record was created', async () => {
  const files = await fixture();
  await writeFile(join(files.releaseDirectory, files.updaterName), 'tampered');
  await assert.rejects(() => executeServerCommand({
    command: 'plan',
    execute: false,
    releaseDirectory: files.releaseDirectory,
    incomingBase: files.incomingBase,
    archiveBase: files.archiveBase,
    registry: files.registry,
  }), /Size mismatch|SHA-256 mismatch/);
});

test('cloud phase rejects a missing exact confirmation before invoking ossutil', async () => {
  const files = await fixture();
  await assert.rejects(() => executeServerCommand({
    command: 'upload-artifacts',
    execute: true,
    releaseDirectory: files.releaseDirectory,
    incomingBase: files.incomingBase,
    archiveBase: files.archiveBase,
    registry: files.registry,
  }), /requires --execute --confirm upload-artifacts:/);
});

test('CDN verification reports full-download progress and Range success', async () => {
  const contents = Buffer.alloc(1024, 'x');
  const server = createServer((request, response) => {
    if (request.headers.range) {
      response.writeHead(206, {
        'content-length': '1',
        'content-range': `bytes 0-0/${contents.length}`,
      });
      response.end(contents.subarray(0, 1));
      return;
    }
    response.writeHead(200, { 'content-length': String(contents.length) });
    response.write(contents.subarray(0, contents.length / 2));
    response.end(contents.subarray(contents.length / 2));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const progress = [];
    await verifyUrl({
      publishName: 'CodeDoc-test.zip',
      publicUrl: `http://127.0.0.1:${address.port}/CodeDoc-test.zip`,
      size: contents.length,
      sha256: digest(contents),
    }, true, (message) => progress.push(message));
    const text = progress.join('\n');
    assert.match(text, /full verification START/);
    assert.match(text, /full verification PROGRESS: CodeDoc-test\.zip 100%/);
    assert.match(text, /full verification SUCCESS/);
    assert.match(text, /range verification SUCCESS/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
