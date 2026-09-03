import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  DEFAULT_RELEASE_CONFIG,
  loadReleaseConfig,
  normalizeReleaseRegistry,
  validateReleaseConfig,
} from './release-config.mjs';

test('repository release configuration uses GitHub for updates and default publishing', async () => {
  const config = await loadReleaseConfig(DEFAULT_RELEASE_CONFIG);
  assert.equal(config.activeProvider, 'github');
  assert.deepEqual(config.publishProviders, ['github']);
  assert.equal(config.providers.oss.updateBaseUrl, 'https://download.ideaboxapps.com/codedoc');
  assert.equal(config.providers.github.enabled, true);
  assert.equal(config.providers.github.implemented, true);
  assert.equal(config.providers.github.writeEnabled, true);
  assert.equal(config.providers.github.appUpdateEnabled, true);
  assert.equal(config.providers.github.owner, 'littleben803');
  assert.equal(config.providers.github.repo, 'CodeSucker');
  assert.equal(config.providers.github.publicBaseUrl, 'https://github.com/littleben803/CodeSucker/releases/download');
  const registry = normalizeReleaseRegistry(config);
  assert.equal(registry.apps.codedoc.displayName, 'CodeDoc');
  assert.equal(registry.infrastructure.bucket, 'ideabox-app-releases-cn-hangzhou');
});

test('disabled providers cannot be selected or published', async () => {
  const config = JSON.parse(await readFile(DEFAULT_RELEASE_CONFIG, 'utf8'));
  config.providers.github.enabled = false;
  config.activeProvider = 'github';
  assert.throws(() => validateReleaseConfig(config), /Active provider is unavailable: github/);
  config.activeProvider = 'oss';
  config.publishProviders = ['oss', 'github'];
  assert.throws(() => validateReleaseConfig(config), /Publish provider is unavailable: github/);
  config.publishProviders = ['oss'];
  config.providers.github.enabled = true;
  config.providers.github.implemented = false;
  assert.throws(() => validateReleaseConfig(config), /Enabled GitHub release provider must be implemented/);
});

test('implemented GitHub provider can publish while app updates remain gated', async () => {
  const config = JSON.parse(await readFile(DEFAULT_RELEASE_CONFIG, 'utf8'));
  config.providers.github.enabled = true;
  config.providers.github.implemented = true;
  config.providers.github.appUpdateEnabled = false;
  config.activeProvider = 'oss';
  config.publishProviders = ['oss', 'github'];
  const validated = validateReleaseConfig(config);
  assert.equal(validated.activeProvider, 'oss');
  assert.deepEqual(validated.publishProviders, ['oss', 'github']);
  config.activeProvider = 'github';
  assert.throws(() => validateReleaseConfig(config), /not enabled for app updates/);
});

test('release configuration rejects credential-shaped fields', async () => {
  const config = JSON.parse(await readFile(DEFAULT_RELEASE_CONFIG, 'utf8'));
  config.providers.oss.accessKeySecret = 'must-not-exist';
  assert.throws(() => validateReleaseConfig(config), /forbidden in release configuration/);
});
