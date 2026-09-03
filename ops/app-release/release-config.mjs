import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_RELEASE_CONFIG = join(SCRIPT_DIR, 'release.config.json');

const SAFE_SEGMENT = /^[a-z0-9][a-z0-9-]*$/;
const SAFE_TARGET_ID = /^[a-z0-9][a-z0-9-]*$/;
const SECRET_FIELD = /(?:access.?key|secret|password|token|private.?key|credential)/i;

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

function assertString(value, label, pattern) {
  if (typeof value !== 'string' || value.length === 0 || (pattern && !pattern.test(value))) {
    throw new Error(`${label} is missing or invalid`);
  }
  return value;
}

function assertNoSecretFields(value, path = 'releaseConfig') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretFields(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (SECRET_FIELD.test(key)) throw new Error(`${path}.${key} is forbidden in release configuration`);
    assertNoSecretFields(child, `${path}.${key}`);
  }
}

function assertHttpsUrl(value, label) {
  const parsed = new URL(assertString(value, label));
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must be a plain HTTPS URL without credentials, query, or fragment`);
  }
  return value.replace(/\/$/, '');
}

function validateProvider(name, provider) {
  assertObject(provider, `providers.${name}`);
  if (typeof provider.enabled !== 'boolean') throw new Error(`providers.${name}.enabled must be boolean`);
  assertString(provider.type, `providers.${name}.type`);
  if (name === 'github' && (provider.enabled || provider.implemented !== false)) {
    throw new Error('GitHub release provider is not implemented');
  }
  if (name === 'oss' && provider.enabled) {
    if (provider.type !== 'generic') throw new Error('providers.oss.type must be generic');
    assertString(provider.bucket, 'providers.oss.bucket', /^[a-z0-9][a-z0-9-]{1,62}$/);
    assertHttpsUrl(provider.publicBaseUrl, 'providers.oss.publicBaseUrl');
    assertHttpsUrl(provider.updateBaseUrl, 'providers.oss.updateBaseUrl');
    if (provider.transport !== 'release-host') throw new Error('providers.oss.transport must be release-host');
    assertString(provider.server, 'providers.oss.server', /^[A-Za-z_][A-Za-z0-9_-]*@[A-Za-z0-9.-]+$/);
    for (const key of ['remoteIncomingBase', 'remoteArchiveBase', 'remoteCommand']) {
      assertString(provider[key], `providers.oss.${key}`, /^\/(?:[A-Za-z0-9._-]+\/?)+$/);
    }
  }
}

function validateApp(app) {
  assertObject(app, 'app');
  assertString(app.slug, 'app.slug', SAFE_SEGMENT);
  assertString(app.displayName, 'app.displayName');
  if (!Array.isArray(app.channels) || app.channels.length === 0) throw new Error('app.channels must not be empty');
  app.channels.forEach((channel) => assertString(channel, 'app.channels[]', SAFE_SEGMENT));
  if (!Array.isArray(app.targets) || app.targets.length === 0) throw new Error('app.targets must not be empty');
  const ids = new Set();
  for (const target of app.targets) {
    assertObject(target, 'app.targets[]');
    const id = assertString(target.id, 'app.targets[].id', SAFE_TARGET_ID);
    if (ids.has(id)) throw new Error(`Duplicate target id: ${id}`);
    ids.add(id);
    assertString(target.platform, 'app.targets[].platform', SAFE_SEGMENT);
    assertString(target.arch, 'app.targets[].arch', SAFE_SEGMENT);
    if (!['app-update', 'internal-download'].includes(target.distributionMode)) {
      throw new Error(`Unsupported distributionMode for ${id}`);
    }
    if (!Array.isArray(target.metadataNames)) throw new Error(`metadataNames must be an array for ${id}`);
    if (target.distributionMode === 'internal-download' && target.metadataNames.length !== 0) {
      throw new Error(`internal-download target ${id} cannot publish update metadata`);
    }
  }
  return app;
}

export function validateReleaseConfig(config) {
  assertObject(config, 'releaseConfig');
  assertNoSecretFields(config);
  if (config.schemaVersion !== 1) throw new Error('releaseConfig.schemaVersion must be 1');
  if (config.releaseContractVersion !== 1) throw new Error('releaseContractVersion must be 1');
  const app = validateApp(config.app);
  const providers = assertObject(config.providers, 'providers');
  for (const [name, provider] of Object.entries(providers)) validateProvider(name, provider);
  const ossProvider = providers.oss;
  if (ossProvider?.enabled && ossProvider.updateBaseUrl !== `${ossProvider.publicBaseUrl}/${app.slug}`) {
    throw new Error('providers.oss.updateBaseUrl must match publicBaseUrl and app.slug');
  }
  const activeProvider = assertString(config.activeProvider, 'activeProvider', SAFE_SEGMENT);
  if (!providers[activeProvider]?.enabled) throw new Error(`Active provider is unavailable: ${activeProvider}`);
  if (!Array.isArray(config.publishProviders) || config.publishProviders.length === 0) {
    throw new Error('publishProviders must not be empty');
  }
  if (new Set(config.publishProviders).size !== config.publishProviders.length) {
    throw new Error('publishProviders must not contain duplicates');
  }
  for (const name of config.publishProviders) {
    assertString(name, 'publishProviders[]', SAFE_SEGMENT);
    if (!providers[name]?.enabled) throw new Error(`Publish provider is unavailable: ${name}`);
  }
  return { ...config, app, providers };
}

export function normalizeReleaseRegistry(config, providerName = 'oss') {
  if (config.app && config.providers) {
    const validated = validateReleaseConfig(config);
    const provider = validated.providers[providerName];
    if (!provider?.enabled) throw new Error(`Release provider is unavailable: ${providerName}`);
    if (providerName !== 'oss' || provider.type !== 'generic') {
      throw new Error(`Release provider is not implemented: ${providerName}`);
    }
    return {
      ...validated,
      infrastructure: {
        bucket: provider.bucket,
        publicBaseUrl: provider.publicBaseUrl,
      },
      apps: { [validated.app.slug]: validated.app },
    };
  }
  return config;
}

export async function loadReleaseConfig(filePath = DEFAULT_RELEASE_CONFIG) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read release configuration ${filePath}: ${error.message}`);
  }
  return validateReleaseConfig(parsed);
}

export async function loadReleaseRegistry(filePath = DEFAULT_RELEASE_CONFIG, providerName = 'oss') {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read release configuration ${filePath}: ${error.message}`);
  }
  return normalizeReleaseRegistry(parsed, providerName);
}
