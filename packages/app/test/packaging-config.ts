import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const appPackage = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));

assert.deepEqual(
  appPackage.build.mac.electronLanguages,
  ['zh_CN', 'en'],
  'macOS Electron 运行时只能保留简体中文和英文语言资源',
);
assert.deepEqual(
  appPackage.build.win.electronLanguages,
  ['zh-CN', 'en-US'],
  'Windows Electron 运行时只能保留简体中文和英文语言资源',
);

console.log('✅ packaging config contract 全部通过');
