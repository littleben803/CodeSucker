import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { windowChromeOptions } from '../src/main/window-chrome.ts';

assert.deepEqual(
  windowChromeOptions('darwin'),
  { frame: true, titleBarStyle: 'hidden', trafficLightPosition: { x: 18, y: 18 } },
  'macOS 必须使用原生隐藏标题栏，并将交通灯定位到侧边栏顶部',
);
assert.deepEqual(windowChromeOptions('win32'), { frame: false }, 'Windows 必须保留自绘无边框窗口');
assert.deepEqual(windowChromeOptions('linux'), { frame: false }, 'Linux 暂时保持现有自绘窗口');

const mainSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8');
const themeCss = readFileSync(new URL('../src/renderer/src/theme.css', import.meta.url), 'utf8');

assert.match(mainSource, /\.\.\.windowChromeOptions\(process\.platform\)/, 'BrowserWindow 必须使用统一的平台窗口选项');
assert.match(appSource, /className="window-controls"/, '自绘窗口按钮必须位于可按平台隐藏的容器');
assert.match(appSource, /className="sidebar-window-drag-region"/, 'macOS 侧边栏必须提供交通灯拖拽安全区');
assert.match(themeCss, /\.titlebar\{[^}]*-webkit-app-region:drag/, '自定义标题区域必须保持可拖拽');
assert.match(themeCss, /\.window-controls\{[^}]*-webkit-app-region:no-drag/, '窗口按钮区域必须禁止拖拽');
assert.match(
  themeCss,
  /:root\[data-platform="darwin"\] \.window-controls\{display:none\}/,
  'macOS 必须隐藏右上角自绘窗口按钮',
);
assert.match(
  themeCss,
  /:root\[data-platform="darwin"\] \.titlebar\{display:none\}/,
  'macOS 不得保留独立占高的自绘标题栏',
);
assert.match(
  themeCss,
  /:root\[data-platform="darwin"\] \.sidebar-window-drag-region\{[^}]*-webkit-app-region:drag/,
  'macOS 侧边栏交通灯安全区必须支持拖拽窗口',
);
assert.match(
  themeCss,
  /:root\[data-platform="darwin"\] \.route-header\{[^}]*-webkit-app-region:drag/,
  'macOS 路由 Header 空白区域必须支持拖拽窗口',
);

console.log('✅ window chrome 全部通过');
