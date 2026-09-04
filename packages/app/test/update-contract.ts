import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  UPDATE_BASE_URL,
  UPDATE_PROVIDER,
  hasAvailableUpdate,
  isDownloadUpdateError,
  safeUpdateError,
  supportsAppUpdates,
  updateChannelFromArgs,
  updateFeedConfiguration,
  updateFeedUrl,
} from '../src/shared/update.ts';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(testDirectory, '..');
const workspaceRoot = path.resolve(appRoot, '../..');
const readSource = (relativePath: string) => fs.readFileSync(path.join(appRoot, relativePath), 'utf8');

assert.equal(UPDATE_BASE_URL, 'https://download.ideaboxapps.com/codedoc');
assert.equal(UPDATE_PROVIDER, 'github');
assert.equal(supportsAppUpdates('darwin'), true, 'macOS 应启用应用内更新');
assert.equal(supportsAppUpdates('win32'), false, 'Windows 不应启用应用内更新');
assert.equal(supportsAppUpdates('linux'), false, 'Linux 不应启用应用内更新');
assert.equal(updateFeedUrl('stable', 'darwin', 'arm64'), `${UPDATE_BASE_URL}/stable/mac/arm64`);
assert.equal(updateFeedUrl('beta', 'darwin', 'x64'), `${UPDATE_BASE_URL}/beta/mac/x64`);
assert.deepEqual(updateFeedConfiguration('stable', 'darwin', 'arm64', 'oss'), {
  provider: 'generic',
  url: `${UPDATE_BASE_URL}/stable/mac/arm64`,
});
assert.deepEqual(updateFeedConfiguration('stable', 'darwin', 'arm64'), {
  provider: 'github',
  owner: 'littleben803',
  repo: 'CodeSucker',
  tagNamePrefix: 'v',
  channel: 'latest',
});
assert.deepEqual(updateFeedConfiguration('beta', 'darwin', 'x64'), {
  provider: 'github',
  owner: 'littleben803',
  repo: 'CodeSucker',
  tagNamePrefix: 'v',
  channel: 'beta',
});
assert.equal(updateFeedConfiguration('stable', 'win32', 'x64'), null);
assert.equal(updateFeedUrl('stable', 'win32', 'x64'), null, 'Windows 不应启用更新源');
assert.equal(updateFeedUrl('stable', 'linux', 'x64'), null, 'Linux 不应启用桌面更新源');
assert.equal(updateFeedUrl('stable', 'darwin', 'ia32'), null, '不受支持的架构不应启用更新源');
assert.equal(updateChannelFromArgs([]), 'stable', '正式渠道必须默认使用 stable');
assert.equal(updateChannelFromArgs(['--update-channel=beta']), 'beta');
assert.equal(updateChannelFromArgs(['--update-channel=nightly']), 'stable', '未知渠道必须回落到 stable');
assert.equal(
  updateChannelFromArgs([], '1.0.1-beta.2'),
  'beta',
  'Beta 安装版升级重启后必须自动恢复 beta 通道',
);
assert.equal(updateChannelFromArgs([], '1.0.1'), 'stable', '正式版本无参数时必须使用 stable');
assert.equal(
  updateChannelFromArgs(['--update-channel=stable'], '1.0.1-beta.2'),
  'stable',
  '显式 stable 参数必须能覆盖版本推导结果',
);
assert.equal(
  updateChannelFromArgs(['--update-channel=beta'], '1.0.1'),
  'beta',
  '显式 beta 参数必须能覆盖正式版本默认通道',
);

const availableState = {
  phase: 'available' as const,
  supported: true,
  channel: 'stable' as const,
  currentVersion: '1.0.0',
  targetVersion: '1.0.1',
  message: '发现新版本',
};
assert.equal(hasAvailableUpdate(availableState), true, '发现新版本时必须显示全局更新提示');
assert.equal(hasAvailableUpdate({ ...availableState, phase: 'downloading' }), true, '下载期间必须保留更新提示');
assert.equal(hasAvailableUpdate({ ...availableState, phase: 'downloaded' }), true, '等待安装时必须保留更新提示');
assert.equal(hasAvailableUpdate({ ...availableState, phase: 'up-to-date', targetVersion: undefined }), false);
assert.equal(hasAvailableUpdate(null), false);
assert.equal(isDownloadUpdateError('download-failed'), true);
assert.equal(isDownloadUpdateError('download-network-failed'), true);
assert.equal(isDownloadUpdateError('update-service-failed'), true);
assert.equal(isDownloadUpdateError('check-failed'), false);
assert.deepEqual(safeUpdateError(new Error('sha512 checksum mismatch'), 'download'), {
  phase: 'error',
  errorCode: 'download-integrity-failed',
  message: '更新包完整性校验失败，请重新下载。',
});
assert.equal(safeUpdateError(new Error('net::ERR_CONNECTION_RESET'), 'download').errorCode, 'download-network-failed');
assert.equal(safeUpdateError(new Error('ENOSPC: no space left'), 'download').errorCode, 'download-storage-failed');
assert.equal(safeUpdateError(new Error('Code signature invalid'), 'download').errorCode, 'download-signature-failed');
assert.equal(safeUpdateError(new Error('Squirrel proxy server failed'), 'download').errorCode, 'update-service-failed');
assert.equal(safeUpdateError(new Error('unexpected failure'), 'download').errorCode, 'download-failed');
assert.equal(safeUpdateError(new Error('request timeout'), 'check').errorCode, 'check-failed');

const updateServiceSource = readSource('src/main/update-service.ts');
const mainSource = readSource('src/main/index.ts');
const preloadSource = readSource('src/preload/index.ts');
const appSource = readSource('src/renderer/src/App.tsx');
const settingsSource = readSource('src/renderer/src/screens/Settings.tsx');
const releaseWorkflow = fs.readFileSync(
  path.join(workspaceRoot, '.github/workflows/release.yml'),
  'utf8',
);
const packageJson = JSON.parse(readSource('package.json')) as {
  dependencies: Record<string, string>;
  build: {
    publish: Array<{ provider: string; url: string }>;
    mac: {
      target: string[];
      hardenedRuntime: boolean;
      entitlements: string;
      entitlementsInherit: string;
      notarize: boolean;
    };
    win: { target: string };
  };
  scripts: Record<string, string>;
};

assert.match(updateServiceSource, /autoDownload = false/, '不得在用户确认前自动下载安装包');
assert.match(updateServiceSource, /autoInstallOnAppQuit = false/, '不得在普通退出时静默安装');
assert.match(updateServiceSource, /disableDifferentialDownload = true/, 'macOS 必须下载完整更新包，不得使用差分缓存');
assert.match(mainSource, /app\.getPath\('logs'\)/, '更新器必须写入应用日志目录');
assert.match(updateServiceSource, /正在校验/, '完整包下载后必须显示校验阶段');
assert.match(updateServiceSource, /scheduleAutomaticCheck\(delayMs = 2_000, jitterMs = 1_000\)/, '首屏稳定后应在 2–3 秒内检查更新');
assert.match(updateServiceSource, /仅 macOS 正式安装版支持应用内更新/, '禁用状态必须准确说明平台范围');
assert.match(updateServiceSource, /canInstall\(\)/, '安装前必须检查当前流水线任务');
assert.match(updateServiceSource, /isTrustedSender\(event\.sender\)/, '更新 IPC 必须校验消息来自主窗口');
assert.match(mainSource, /isPackaged: app\.isPackaged/, '开发版必须保持离线，不得连接正式更新源');
assert.match(mainSource, /isPipelineBusy\(\)/, '安装更新必须避让扫描、处理和导出任务');
assert.doesNotMatch(preloadSource, /\bautoUpdater\b/, 'Preload 不得直接暴露 updater 实例');
for (const channel of ['update:getState', 'update:check', 'update:download', 'update:install']) {
  assert.match(preloadSource, new RegExp(channel.replace(':', '\\:')), `Preload 缺少受控通道 ${channel}`);
}
assert.match(settingsSource, /supportsAppUpdates\(window\.codedoc\.platform\)/, '设置页必须使用实际运行平台判断更新能力');
assert.match(settingsSource, /\{updatesEnabled && \(/, '非 macOS 平台必须隐藏软件更新卡片');
assert.match(appSource, /if \(!updatesEnabled\) return undefined;/, '非 macOS 平台不得读取或订阅更新状态');
assert.match(appSource, /window\.codedoc\.onUpdateState/, '全局 App 必须持续订阅更新状态');
assert.match(appSource, /sidebar-update-available-dot/, '侧边栏设置入口必须显示更新红点');
assert.match(settingsSource, /showUpdateAvailable=\{hasAvailableUpdate\(updateState\)\}/, '软件更新卡片必须显示更新红点');
assert.match(settingsSource, /当前版本 v\$\{currentVersion\}，已经是最新版本/, '最新状态必须合并为单行版本说明');
assert.match(settingsSource, /当前版本 v\$\{currentVersion\}，最新版本 v\$\{state\.targetVersion\}/, '新版本状态必须合并为单行版本说明');
assert.match(settingsSource, /立即更新/, '发现新版本后按钮必须切换为立即更新');
assert.match(settingsSource, /重启并安装/, '设置页必须由用户主动确认安装');
assert.match(settingsSource, /更新中…/, '更新执行期间不得显示含义模糊的“处理中”');

assert.equal(packageJson.dependencies['electron-updater'], '6.8.9', 'electron-updater 必须固定确切版本');
assert.deepEqual(packageJson.build.mac.target, ['dmg', 'zip'], 'macOS 更新必须同时产出 DMG 与 ZIP');
assert.equal(packageJson.build.mac.hardenedRuntime, true, 'macOS 正式签名必须启用 Hardened Runtime');
assert.equal(packageJson.build.mac.entitlements, 'build/entitlements.mac.plist');
assert.equal(packageJson.build.mac.entitlementsInherit, 'build/entitlements.mac.inherit.plist');
assert.equal(packageJson.build.mac.notarize, true, 'macOS 正式构建必须启用公证集成');
assert.equal(packageJson.build.win.target, 'nsis');
assert.deepEqual(packageJson.build.publish, [{
  provider: 'generic',
  url: 'https://download.ideaboxapps.com/codedoc/stable',
}]);
assert.match(releaseWorkflow, /CodeDoc-\*-mac-x64\.dmg\.blockmap/);
assert.match(releaseWorkflow, /CodeDoc-\*-mac-x64\.zip\.blockmap/);
assert.match(releaseWorkflow, /CodeDoc-\*-mac-arm64\.dmg\.blockmap/);
assert.match(releaseWorkflow, /CodeDoc-\*-mac-arm64\.zip\.blockmap/);

for (const script of ['dist:mac:x64:release', 'dist:mac:arm64:release']) {
  assert.match(packageJson.scripts[script], /CSC_IDENTITY_AUTO_DISCOVERY=true/);
  assert.match(packageJson.scripts[script], /APPLE_KEYCHAIN_PROFILE=ideabox-notary/);
  assert.match(packageJson.scripts[script], /--config\.mac\.forceCodeSigning=true/);
}

for (const entitlementFile of ['build/entitlements.mac.plist', 'build/entitlements.mac.inherit.plist']) {
  const entitlements = readSource(entitlementFile);
  assert.match(entitlements, /com\.apple\.security\.cs\.allow-jit/);
  assert.match(entitlements, /com\.apple\.security\.cs\.allow-unsigned-executable-memory/);
  assert.doesNotMatch(entitlements, /com\.apple\.security\.cs\.disable-library-validation/);
  assert.doesNotMatch(entitlements, /com\.apple\.security\.app-sandbox/);
}

console.log('✅ 应用内更新契约全部通过');
