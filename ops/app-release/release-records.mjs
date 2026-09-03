import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const COLLECTION_VERSION = 1;

function collectionType(recordType) {
  return `${recordType}-collection`;
}

function targetKey(target) {
  return `${target?.platform ?? ''}-${target?.arch ?? ''}`;
}

function assertRecord(record, expectedRecordType) {
  if (
    !record
    || typeof record !== 'object'
    || Array.isArray(record)
    || record.releaseRecordVersion !== 1
    || record.recordType !== expectedRecordType
    || typeof record.appSlug !== 'string'
    || typeof record.version !== 'string'
    || typeof record.channel !== 'string'
    || !record.target?.platform
    || !record.target?.arch
  ) throw new Error(`Unsupported ${expectedRecordType} target record`);
}

function assertCollection(collection, expectedRecordType) {
  if (
    !collection
    || typeof collection !== 'object'
    || Array.isArray(collection)
    || collection.releaseCollectionVersion !== COLLECTION_VERSION
    || collection.recordType !== collectionType(expectedRecordType)
    || typeof collection.appSlug !== 'string'
    || typeof collection.version !== 'string'
    || typeof collection.channel !== 'string'
    || !Array.isArray(collection.targets)
  ) throw new Error(`Unsupported ${expectedRecordType} collection`);
  for (const record of collection.targets) {
    assertRecord(record, expectedRecordType);
    if (!identityMatches(record, collection)) throw new Error(`${expectedRecordType} target identity mismatch`);
  }
  const keys = collection.targets.map((record) => targetKey(record.target));
  if (new Set(keys).size !== keys.length) throw new Error(`Duplicate target in ${expectedRecordType} collection`);
}

function identityMatches(record, identity) {
  return record.appSlug === identity.appSlug
    && record.version === identity.version
    && record.channel === identity.channel;
}

export function createReleaseCollection(record) {
  assertRecord(record, record.recordType);
  return {
    releaseCollectionVersion: COLLECTION_VERSION,
    recordType: collectionType(record.recordType),
    appSlug: record.appSlug,
    version: record.version,
    channel: record.channel,
    targets: [record],
  };
}

export function selectTargetRecord(value, identity, expectedRecordType) {
  if (value?.recordType === expectedRecordType) {
    assertRecord(value, expectedRecordType);
    return identityMatches(value, identity)
      && value.target.platform === identity.platform
      && value.target.arch === identity.arch
      ? value
      : null;
  }
  assertCollection(value, expectedRecordType);
  if (!identityMatches(value, identity)) throw new Error(`${expectedRecordType} collection identity mismatch`);
  return value.targets.find((record) => (
    record.target.platform === identity.platform && record.target.arch === identity.arch
  )) ?? null;
}

export async function readTargetRecord(filePath, identity, expectedRecordType) {
  let value;
  try {
    value = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw new Error(`Cannot read ${expectedRecordType} collection ${filePath}: ${error.message}`);
  }
  return selectTargetRecord(value, identity, expectedRecordType);
}

async function writeJsonAtomic(filePath, value) {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  const temporaryPath = `${absolutePath}.tmp-${process.pid}-${Date.now()}`;
  let handle;
  try {
    handle = await open(temporaryPath, 'wx', 0o644);
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, absolutePath);
  } finally {
    await handle?.close();
    await rm(temporaryPath, { force: true });
  }
}

export async function appendTargetRecord(filePath, record, label) {
  assertRecord(record, record.recordType);
  const absolutePath = resolve(filePath);
  let collection;
  try {
    collection = JSON.parse(await readFile(absolutePath, 'utf8'));
    assertCollection(collection, record.recordType);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    collection = createReleaseCollection(record);
    await writeJsonAtomic(absolutePath, collection);
    return absolutePath;
  }

  if (!identityMatches(collection, record)) {
    throw new Error(`${label} collection identity mismatch: ${absolutePath}`);
  }
  if (collection.targets.some((entry) => targetKey(entry.target) === targetKey(record.target))) {
    throw new Error(`Refusing to overwrite existing ${label} target ${targetKey(record.target)}: ${absolutePath}`);
  }
  collection.targets.push(record);
  collection.targets.sort((left, right) => targetKey(left.target).localeCompare(targetKey(right.target)));
  await writeJsonAtomic(absolutePath, collection);
  return absolutePath;
}
