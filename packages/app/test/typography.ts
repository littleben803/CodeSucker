import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererRoot = join(appRoot, 'src/renderer/src');
const themeCss = readFileSync(join(rendererRoot, 'theme.css'), 'utf8');
const preloadSource = readFileSync(join(appRoot, 'src/preload/index.ts'), 'utf8');
const rendererEntry = readFileSync(join(rendererRoot, 'main.tsx'), 'utf8');
const step3CleanSource = readFileSync(join(rendererRoot, 'screens/Step3Clean.tsx'), 'utf8');
const step4PreviewSource = readFileSync(join(rendererRoot, 'screens/Step4Preview.tsx'), 'utf8');
const pdfTemplateSource = readFileSync(join(appRoot, '../core/src/pdf-template.ts'), 'utf8');
const pipelineSource = readFileSync(join(appRoot, 'src/main/pipeline.ts'), 'utf8');

assert.match(
  themeCss,
  /:root\[data-platform="win32"\]\{[\s\S]*?--font-ui:"Segoe UI Variable","Segoe UI","Microsoft YaHei UI",sans-serif;/,
  'Windows UI 字体回退顺序必须稳定',
);
assert.match(
  themeCss,
  /:root\[data-platform="win32"\]\{[\s\S]*?--font-mono:"Cascadia Mono",Consolas,"Microsoft YaHei UI",monospace;/,
  'Windows 等宽字体必须优先 Cascadia Mono，并在中文字体前回退到 Consolas',
);
assert.match(pipelineSource, /fontName: 'SimSun', fontSizePt: 10\.5/, 'PDF 申报文档必须使用宋体 10.5pt');
assert.match(pipelineSource, /linesPerPage: 60/, '产品分页规则必须按每页 60 行执行');
assert.match(pdfTemplateSource, /"Songti SC", "STSong", serif/, 'PDF 模板必须提供 macOS 中文字体回退');
assert.match(pdfTemplateSource, /font-size: \$\{fontSize\}pt/, 'PDF 正文必须由固定字号驱动');
assert.match(pdfTemplateSource, /SOURCE_CODE_LINE_HEIGHT_PT = 12/, 'PDF 正文必须使用 12pt 固定行距');
assert.match(step3CleanSource, /12pt 行距 · 每页 60 行/, '排版参数摘要必须显示 12pt 行距和每页 60 行');
assert.match(
  step4PreviewSource,
  /<iframe key=\{`\$\{p\.documentKey\}:\$\{s\.page\}`\}/,
  '底部分页切换时必须重建 Chromium PDF Viewer，确保目标页参数生效',
);
assert.match(preloadSource, /platform: process\.platform/, 'preload 必须暴露只读平台信息');
assert.match(rendererEntry, /document\.documentElement\.dataset\.platform = window\.codedoc\.platform/, 'renderer 根节点必须标记平台');

function collectUiSourcePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectUiSourcePaths(entryPath);
    return /\.(?:jsx|tsx|svg)$/.test(entry.name) ? [entryPath] : [];
  });
}

const componentPaths = collectUiSourcePaths(rendererRoot);
const componentSource = componentPaths.map((file) => readFileSync(file, 'utf8')).join('\n');

assert.doesNotMatch(`${themeCss}\n${componentSource}`, /fontWeight:\s*(?:550|650)\b|font-weight:(?:550|650)\b/, '普通 UI 不得使用合成字重 550/650');

for (const match of componentSource.matchAll(/fontSize:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
  assert.ok(Number(match[1]) >= 11, `React 内联 UI 字号不得小于 11px：${match[0]}`);
}

for (const match of componentSource.matchAll(/fontSize\s*=\s*(?:\{\s*)?["']?([0-9]+(?:\.[0-9]+)?)/g)) {
  assert.ok(Number(match[1]) >= 11, `JSX UI 字号不得小于 11px：${match[0]}`);
}

for (const match of componentSource.matchAll(/font-size\s*=\s*["']([0-9]+(?:\.[0-9]+)?)/g)) {
  assert.ok(Number(match[1]) >= 11, `SVG UI 字号不得小于 11px：${match[0]}`);
}

for (const line of themeCss.split('\n')) {
  for (const match of line.matchAll(/font-size:([0-9]+(?:\.[0-9]+)?)px/g)) {
    assert.ok(Number(match[1]) >= 11, `普通 CSS UI 字号不得小于 11px：${line}`);
  }
}

console.log('✅ typography policy 全部通过');
