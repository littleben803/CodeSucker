// 从 CodeDoc 唯一 PNG 母版生成并校验各平台应用图标。
import sharp from 'sharp';
import png2icons from 'png2icons';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'design/icon/codedoc-icon-source.png');
const outDir = join(root, 'packages/app/build');
const checkOnly = process.argv.includes('--check');

const master = await sharp(src)
  .resize(1024, 1024, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .ensureAlpha()
  .png()
  .toBuffer();
const assets = new Map([[join(outDir, 'icon.png'), master]]);
for (const size of [512, 256, 128]) {
  assets.set(join(outDir, `icon-${size}.png`), await sharp(master).resize(size, size).png().toBuffer());
}
const icns = png2icons.createICNS(master, png2icons.BILINEAR, 0);
const ico = png2icons.createICO(master, png2icons.BILINEAR, 0, false, true);
if (!icns || !ico) throw new Error('无法从正式图标源生成 ICNS/ICO');
assets.set(join(outDir, 'icon.icns'), icns);
assets.set(join(outDir, 'icon.ico'), ico);

if (checkOnly) {
  const stale = [...assets].filter(([output, expected]) => {
    return !existsSync(output) || !readFileSync(output).equals(expected);
  }).map(([output]) => relative(root, output));
  if (stale.length > 0) {
    console.error(`❌ 图标生成资产与 design/icon/codedoc-icon-source.png 不一致：${stale.join(', ')}`);
    console.error('请执行 npm run icons:generate 后提交生成结果');
    process.exitCode = 1;
  } else {
    console.log('✓ 唯一品牌图标源与 PNG/ICNS/ICO 生成资产一致');
  }
} else {
  for (const [output, content] of assets) {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, content);
  }
  console.log('✅ icons generated →', outDir);
}
