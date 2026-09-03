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
assert.equal(
  appPackage.build.productName,
  'CodeDoc',
  '技术产品名必须保持 CodeDoc，避免改变应用包、可执行文件和发布产物命名',
);
assert.equal(
  appPackage.build.mac.extendInfo.CFBundleDisplayName,
  '软著代码整理器',
  'macOS 安装后必须显示中文正式名',
);
assert.equal(appPackage.build.nsis.shortcutName, '软著代码整理器', 'Windows 快捷方式必须显示中文正式名');
assert.equal(appPackage.build.nsis.uninstallDisplayName, '软著代码整理器', 'Windows 已安装应用必须显示中文正式名');
assert.equal(
  appPackage.build.mac.artifactName,
  '${productName}-${version}-mac-${arch}.${ext}',
  'macOS 发布文件名必须继续使用 CodeDoc 技术名',
);
assert.equal(
  appPackage.build.win.artifactName,
  '${productName}-${version}-win-${arch}.${ext}',
  'Windows 发布文件名必须继续使用 CodeDoc 技术名',
);

console.log('✅ packaging config contract 全部通过');
