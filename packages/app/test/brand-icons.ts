import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { APP_ICON_URL } from '../src/renderer/src/brand-icons.ts';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const appPackage = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
const iconSource = join(repoRoot, 'design/icon/codedoc-icon-source.png');
const duplicateWebsiteLogo = join(repoRoot, 'docs/brand/codedoc-logo-1024.png');

assert.equal(
  fileURLToPath(APP_ICON_URL),
  join(appRoot, 'build/icon-128.png'),
  'renderer 标题栏必须直接使用正式图标生成物',
);
assert.ok(existsSync(fileURLToPath(APP_ICON_URL)), 'renderer 标题栏图标必须存在');
const rendererSource = readFileSync(join(appRoot, 'src/renderer/src/App.tsx'), 'utf8');
assert.match(rendererSource, /src=\{APP_ICON_URL\}/, 'renderer 标题栏必须渲染正式图标');
assert.doesNotMatch(rendererSource, /\{'<\/>'\}/, 'renderer 标题栏不得回退为手写占位图标');
assert.equal(appPackage.build.win.icon, 'build/icon.ico', 'Windows 应用必须使用正式 ICO');
assert.equal(appPackage.build.nsis.installerIcon, 'build/icon.ico', 'Windows 安装器必须使用正式 ICO');
assert.equal(appPackage.build.nsis.uninstallerIcon, 'build/icon.ico', 'Windows 卸载器必须使用正式 ICO');
assert.ok(appPackage.build.files.includes('build/icon.png'), 'BrowserWindow 图标必须随应用归档打包');

const mainSource = readFileSync(join(appRoot, 'src/main/index.ts'), 'utf8');
assert.match(mainSource, /build\/icon\.png/, 'BrowserWindow 必须使用正式 PNG');
const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
assert.match(readme, /design\/icon\/codedoc-icon-source\.png/, 'README 必须直接使用唯一品牌母图');
assert.equal(existsSync(duplicateWebsiteLogo), false, '不得在 docs/brand 保留重复的官网 Logo');

for (const name of ['icon.png', 'icon-512.png', 'icon-256.png', 'icon-128.png', 'icon.icns', 'icon.ico']) {
  assert.ok(existsSync(join(appRoot, 'build', name)), `${name} 必须由正式图标源生成`);
}

async function verifyRasterAssets(): Promise<void> {
  for (const [label, path] of [['图标母版', iconSource], ['应用 1024px PNG', join(appRoot, 'build/icon.png')]] as const) {
    assert.ok(existsSync(path), `${label}必须存在`);
    const metadata = await sharp(path).metadata();
    assert.equal(metadata.width, 1024, `${label}宽度必须为 1024`);
    assert.equal(metadata.height, 1024, `${label}高度必须为 1024`);
    assert.equal(metadata.hasAlpha, true, `${label}必须保留透明通道`);
  }

  const sourcePixels = await sharp(iconSource).ensureAlpha().raw().toBuffer();
  const appPixels = await sharp(join(appRoot, 'build/icon.png')).ensureAlpha().raw().toBuffer();
  assert.ok(sourcePixels.equals(appPixels), '应用 1024px PNG 必须与唯一品牌母图像素一致');
}

verifyRasterAssets()
  .then(() => console.log('✅ brand icon contract 全部通过'))
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
