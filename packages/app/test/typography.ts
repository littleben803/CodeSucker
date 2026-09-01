import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rendererRoot = join(appRoot, 'src/renderer/src');
const themeCss = readFileSync(join(rendererRoot, 'theme.css'), 'utf8');
const tokenCss = readFileSync(join(rendererRoot, 'styles/tokens.css'), 'utf8');
const darkThemeCss = readFileSync(join(rendererRoot, 'styles/themes/dark.css'), 'utf8');
const lightThemeCss = readFileSync(join(rendererRoot, 'styles/themes/light.css'), 'utf8');
const componentTokenCss = readFileSync(join(rendererRoot, 'styles/components.css'), 'utf8');
const themeControllerSource = readFileSync(join(rendererRoot, 'theme-controller.ts'), 'utf8');
const storeSource = readFileSync(join(rendererRoot, 'store.ts'), 'utf8');
const preloadSource = readFileSync(join(appRoot, 'src/preload/index.ts'), 'utf8');
const rendererEntry = readFileSync(join(rendererRoot, 'main.tsx'), 'utf8');
const appSource = readFileSync(join(rendererRoot, 'App.tsx'), 'utf8');
const step1ImportSource = readFileSync(join(rendererRoot, 'screens/Step1Import.tsx'), 'utf8');
const step2FilesSource = readFileSync(join(rendererRoot, 'screens/Step2Files.tsx'), 'utf8');
const step3CleanSource = readFileSync(join(rendererRoot, 'screens/Step3Clean.tsx'), 'utf8');
const step4PreviewSource = readFileSync(join(rendererRoot, 'screens/Step4Preview.tsx'), 'utf8');
const step5ExportSource = readFileSync(join(rendererRoot, 'screens/Step5Export.tsx'), 'utf8');
const settingsSource = readFileSync(join(rendererRoot, 'screens/Settings.tsx'), 'utf8');
const appAlertSource = readFileSync(join(rendererRoot, 'components/AppAlert.tsx'), 'utf8');
const pdfTemplateSource = readFileSync(join(appRoot, '../core/src/pdf-template.ts'), 'utf8');
const pipelineSource = readFileSync(join(appRoot, 'src/main/pipeline.ts'), 'utf8');

assert.match(
  tokenCss,
  /:root\[data-platform="win32"\]\{[\s\S]*?--font-ui:"Segoe UI Variable","Segoe UI","Microsoft YaHei UI",sans-serif;/,
  'Windows UI 字体回退顺序必须稳定',
);
assert.match(
  tokenCss,
  /:root\[data-platform="win32"\]\{[\s\S]*?--font-mono:"Cascadia Mono",Consolas,"Microsoft YaHei UI",monospace;/,
  'Windows 等宽字体必须优先 Cascadia Mono，并在中文字体前回退到 Consolas',
);
assert.match(themeCss, /@import '\.\/styles\/tokens\.css';/, 'Renderer 必须加载基础 Token');
assert.match(themeCss, /@import '\.\/styles\/themes\/dark\.css';/, 'Renderer 必须加载默认暗黑主题');
assert.match(themeCss, /@import '\.\/styles\/components\.css';/, 'Renderer 必须加载组件 Token');
assert.match(themeCss, /@import '\.\/styles\/themes\/light\.css';/, 'Renderer 必须加载已确认浅色主题');
assert.doesNotMatch(themeCss, /:root\[data-theme="light"\]\{/, '浅色主题映射必须独立维护，不能回写生产布局文件');
assert.match(tokenCss, /--ref-color-indigo-950:#090048;/, '暗黑主题 Canvas 基准色必须稳定');
assert.match(tokenCss, /--ref-color-magenta-400:#ef48be;/, '暗黑主题 Focus 基准色必须稳定');
assert.match(darkThemeCss, /:root,[\s\S]*:root\[data-theme="dark"\]\{/, '暗黑主题必须作为根节点默认主题');
assert.match(darkThemeCss, /--gradient-app-background:/, '暗黑主题必须提供统一应用背景渐变');
assert.match(componentTokenCss, /--control-focus-ring:/, '组件 Token 必须提供统一键盘焦点环');
assert.match(themeControllerSource, /DEFAULT_THEME: ThemeMode = 'dark'/, '应用默认主题必须为暗黑模式');
assert.match(themeControllerSource, /document\.documentElement\.dataset\.theme = theme/, '主题控制器必须通过根节点 data-theme 应用主题');
assert.match(storeSource, /theme: DEFAULT_THEME/, 'Renderer Store 必须使用统一默认主题');
assert.match(rendererEntry, /applyTheme\(DEFAULT_THEME\)/, 'React 挂载前必须应用默认主题，避免亮色闪烁');
assert.doesNotMatch(rendererEntry, /styles\/shell\.css/, '主题换肤不得加载覆盖生产 UI 几何尺寸的样式层');
assert.match(themeCss, /\.app-sidebar\{[^}]*width:260px;min-width:260px;/, '主题换肤必须保留 260px 侧栏基线');
assert.match(themeCss, /\.sidebar-primary\{height:44px;/, '主题换肤必须保留一级导航高度');
assert.match(themeCss, /\.sidebar-step\{height:38px;/, '主题换肤必须保留步骤导航高度');
assert.match(themeCss, /\.workspace-toolbar\{[^}]*min-height:69px;/, '主题换肤必须保留工具栏高度');
assert.match(themeCss, /\.step2-stats-panel\{[^}]*width:286px;/, '主题换肤必须保留文件统计栏宽度');
assert.match(themeCss, /\.step3-controls\{[^}]*width:420px;/, '主题换肤必须保留清洗控制栏宽度');
assert.match(themeCss, /\.step4-preview\{[^}]*grid-template-columns:var\(--route-inline-padding\) minmax\(0,1fr\) var\(--route-inline-padding\);/, '主题换肤必须保留预览页网格结构');
assert.match(themeCss, /\.step5-export-panel\{[^}]*width:284px;/, '主题换肤必须保留导出栏宽度');
assert.match(themeCss, /\.settings-grid\{[^}]*grid-template-columns:minmax\(0,1\.16fr\) minmax\(300px,\.84fr\);/, '主题换肤必须保留设置页网格结构');
assert.match(darkThemeCss, /--color-document-canvas:/, '暗黑主题必须覆盖 PDF 画布颜色');
assert.match(darkThemeCss, /--color-language-typescript:/, '暗黑主题必须覆盖文件语言标签色');
assert.match(darkThemeCss, /--dialog-elevation:/, '暗黑主题必须覆盖弹层阴影');
assert.match(lightThemeCss, /:root\[data-theme="light"\]\{/, '浅色主题必须由根节点 data-theme 显式启用');
assert.match(lightThemeCss, /--color-bg-canvas:#f5f7fc;/, '浅色主题 Canvas 必须使用已确认的冰川底色');
assert.match(lightThemeCss, /--color-accent:#6f4ccb;/, '浅色主题导航强调色必须使用已确认的 Violet');
assert.match(lightThemeCss, /--color-accent-strong:#c72aa8;/, '浅色主题主要动作强调色必须使用已确认的 Magenta');
assert.match(lightThemeCss, /--color-focus:#b9289b;/, '浅色主题 Focus 必须使用已确认的 Magenta Focus');
assert.match(lightThemeCss, /--color-text-primary:#1d2940;/, '浅色主题主文字色必须使用已确认的 Ink');
assert.match(lightThemeCss, /--gradient-app-background:/, '浅色主题必须提供统一冰川蓝紫背景渐变');
assert.match(lightThemeCss, /--button-primary-bg:linear-gradient\(135deg,#6f4ccb,#c72aa8\);/, '浅色主题主要按钮必须使用 Violet 到 Magenta 渐变');
assert.match(lightThemeCss, /--dropzone-bg:rgb\(111 76 203 \/ 3%\);/, '浅色主题导入区必须保持高保真设计中的轻盈表面层级');
assert.match(lightThemeCss, /--list-row-shadow:none;/, '浅色主题高密度列表行不得出现右下灰色拖影');
assert.match(lightThemeCss, /--export-option-selected-bg:rgb\(111 76 203 \/ 8%\);/, '浅色导出格式选中态必须使用方案 2 的 Violet 表面色');
assert.match(themeCss, /\.step5-audit-card\{[^}]*box-shadow:var\(--list-row-shadow\);/, '检验列表行必须使用无拖影的列表层级 Token');
assert.match(step2FilesSource, /boxShadow: 'var\(--list-row-shadow\)'/, '文件排序列表必须使用无拖影的列表层级 Token');
assert.match(themeCss, /\.btn-ghost:not\(:disabled\):hover\{border-color:var\(--button-secondary-border-hover\);background:var\(--button-secondary-bg-hover\);color:var\(--accent\)\}/, '通用次级按钮必须统一消费 hover Token');
assert.doesNotMatch(themeCss, /\.theme-toggle:not\(:disabled\):hover\{[^}]*border-color:/, '主题切换按钮不得覆盖通用次级按钮的 hover 描边');
assert.doesNotMatch(themeCss, /\.theme-toggle:focus-visible\{[^}]*outline:/, '主题切换按钮不得叠加独立焦点环');
assert.doesNotMatch(themeCss, /\.theme-toggle\{[^}]*transition:/, '主题切换按钮不得覆盖通用按钮的状态过渡');
assert.match(themeCss, /\.step1-recent__heading button:not\(:disabled\):hover,\.step1-recent__manage button:not\(:disabled\):hover\{border-color:var\(--button-secondary-border-hover\);background:var\(--button-secondary-bg-hover\);color:var\(--accent\)\}/, '最近项目管理按钮必须与工具栏次级按钮使用同一 hover Token');
assert.match(themeCss, /\.step1-recent__heading button:focus-visible,\.step1-recent__manage button:focus-visible\{outline:none;box-shadow:var\(--control-focus-ring\)\}/, '最近项目管理按钮必须使用统一键盘焦点环');
assert.match(lightThemeCss, /--color-document-canvas:/, '浅色主题必须覆盖 PDF 画布颜色');
assert.match(lightThemeCss, /--color-language-typescript:/, '浅色主题必须覆盖文件语言标签色');
assert.match(lightThemeCss, /--dialog-elevation:/, '浅色主题必须覆盖弹层阴影');
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

const allThemeCss = `${tokenCss}\n${darkThemeCss}\n${lightThemeCss}\n${componentTokenCss}\n${themeCss}`;
const themedRendererSource = [
  appSource,
  step1ImportSource,
  step2FilesSource,
  step3CleanSource,
  step4PreviewSource,
  step5ExportSource,
  settingsSource,
  appAlertSource,
].join('\n');

assert.doesNotMatch(`${allThemeCss}\n${componentSource}`, /fontWeight:\s*(?:550|650)\b|font-weight:(?:550|650)\b/, '普通 UI 不得使用合成字重 550/650');
assert.doesNotMatch(themedRendererSource, /#[0-9a-f]{3,8}\b|rgba?\(/i, '页面组件不得绕过 Theme Token 硬编码颜色');

for (const match of componentSource.matchAll(/fontSize:\s*([0-9]+(?:\.[0-9]+)?)/g)) {
  assert.ok(Number(match[1]) >= 11, `React 内联 UI 字号不得小于 11px：${match[0]}`);
}

for (const match of componentSource.matchAll(/fontSize\s*=\s*(?:\{\s*)?["']?([0-9]+(?:\.[0-9]+)?)/g)) {
  assert.ok(Number(match[1]) >= 11, `JSX UI 字号不得小于 11px：${match[0]}`);
}

for (const match of componentSource.matchAll(/font-size\s*=\s*["']([0-9]+(?:\.[0-9]+)?)/g)) {
  assert.ok(Number(match[1]) >= 11, `SVG UI 字号不得小于 11px：${match[0]}`);
}

for (const line of allThemeCss.split('\n')) {
  for (const match of line.matchAll(/font-size:([0-9]+(?:\.[0-9]+)?)px/g)) {
    assert.ok(Number(match[1]) >= 11, `普通 CSS UI 字号不得小于 11px：${line}`);
  }
}

console.log('✅ typography/theme policy 全部通过');
