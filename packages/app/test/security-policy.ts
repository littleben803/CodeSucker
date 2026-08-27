import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(testDirectory, '../src');
const mainSource = fs.readFileSync(path.join(sourceRoot, 'main/index.ts'), 'utf8');
const preloadSource = fs.readFileSync(path.join(sourceRoot, 'preload/index.ts'), 'utf8');
const rendererHtml = fs.readFileSync(path.join(sourceRoot, 'renderer/index.html'), 'utf8');
const pdfRendererSource = fs.readFileSync(path.join(sourceRoot, 'main/pdf-renderer.ts'), 'utf8');
const exposedApiSource = preloadSource.slice(
  preloadSource.indexOf('const api ='),
  preloadSource.indexOf("contextBridge.exposeInMainWorld('codedoc', api)"),
);

assert.match(mainSource, /app\.enableSandbox\(\)/, '必须全局启用 Electron sandbox');
assert.match(mainSource, /contextIsolation:\s*true/, '必须启用 contextIsolation');
assert.match(mainSource, /nodeIntegration:\s*false/, '必须关闭 renderer Node.js integration');
assert.match(mainSource, /sandbox:\s*true/, 'BrowserWindow 必须显式启用 sandbox');
assert.doesNotMatch(mainSource, /webSecurity:\s*false/, '不得关闭 webSecurity');
assert.doesNotMatch(mainSource, /allowRunningInsecureContent:\s*true/, '不得允许不安全内容');
assert.match(mainSource, /isTrustedRenderer/, 'IPC 必须校验消息来自当前主窗口');
assert.match(pdfRendererSource, /contextIsolation:\s*true/, 'PDF 隐藏窗口必须启用 contextIsolation');
assert.match(pdfRendererSource, /nodeIntegration:\s*false/, 'PDF 隐藏窗口必须关闭 Node.js integration');
assert.match(pdfRendererSource, /sandbox:\s*true/, 'PDF 隐藏窗口必须启用 sandbox');
assert.doesNotMatch(pdfRendererSource, /webSecurity:\s*false/, 'PDF 隐藏窗口不得关闭 webSecurity');

assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('codedoc', api\)/, 'preload 必须通过 contextBridge 暴露窄接口');
assert.doesNotMatch(exposedApiSource, /\bipcRenderer\s*[:,}]/, '不得把 ipcRenderer 对象直接暴露给 renderer');
assert.match(rendererHtml, /Content-Security-Policy/, 'renderer 必须声明 CSP');
assert.match(rendererHtml, /default-src 'self'/, 'CSP 默认只能加载应用自身资源');
assert.match(rendererHtml, /frame-src 'self' blob:/, 'PDF 预览只能额外允许当前页面创建的 blob frame');
assert.match(rendererHtml, /object-src 'none'/, '不得开放 object/embed 插件内容');
assert.doesNotMatch(rendererHtml, /script-src[^>]*'unsafe-eval'/, 'CSP 不得允许 unsafe-eval');

console.log('✅ Electron security policy 全部通过');
