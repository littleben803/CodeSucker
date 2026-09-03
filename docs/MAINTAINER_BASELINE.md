# CodeDoc 维护者基线

## 目标

本文件定义 CodeDoc 当前版本的最低可复现条件、验证命令和分发边界。

## 产品与工程基线

- 产品版本：由根目录及两个 workspace 的 `package.json` 统一声明，并由 `npm run version:check` 校验
- 用户可见安装名称：`软著代码整理器`；技术产品名、可执行文件和发布产物名：`CodeDoc`
- App ID：`com.ideaboxapps.codedoc`
- npm workspace：`@codedoc/app`、`@codedoc/core`
- 项目配置：`.codedoc.json`

再分发时必须保留 Apache-2.0 `LICENSE`、`NOTICE` 和适用的第三方许可证，并按许可证要求标明修改。

## 开发环境

- macOS Apple Silicon 已完成实际运行与 arm64 DMG 验证。
- 本地开发、CI 与发布基准统一为 Node.js `24.19.0`（Krypton LTS）；工程仅支持 Node.js `>=24.19.0 <25`。
- 仓库通过 `.nvmrc` 与 `.node-version` 固定开发版本；进入项目后应先切换到对应 Node.js 版本。
- 依赖必须通过 `npm ci` 按 `package-lock.json` 安装，不使用未锁定的临时版本作为验收结果。
- 根目录 `npm run dev` 会先执行 Electron 二进制完整性检查；缺失时按 Electron 锁定版本下载，已安装时直接跳过。

```bash
npm ci
npm run dev
npm run audit:runtime
npm run audit:all
npm run verify
npm run package:release
npm run release:sync -- --channel stable --targets all
npm run perf
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:arm64
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:x64
```

`npm run verify` 包含版本、锁文件源、图标、许可证、发布工具、核心/桌面端测试、生产构建和 worker 集成测试。

## 已确认的产品链路

当前正式版本已经完成以下产品链路验收：

1. 启动桌面应用。
2. 选择项目目录并扫描源码。
3. 调整文件范围和排序。
4. 填写软件名称及著作权人并执行清洗。
5. 生成分页预览和风险校验。
6. 导出 PDF、DOCX 和 TXT，并检查输出文件。
7. 构建 macOS arm64、macOS x64 和 Windows x64 安装包。
8. 通过 GitHub Release 发布并完成三平台公开下载和真实安装。
9. 完成 macOS 旧版本到新版本的应用内升级。

自动化验证不能替代每个正式候选版本的真实 GUI 冒烟，但日常改动至少必须保持 `npm run verify` 通过。

## 当前网络边界

CodeDoc 已为 macOS 接入受控的应用内更新路径：正式安装版在首屏稳定后延迟约 2～3 秒检查，也允许用户在设置页主动检查和下载；Windows 不启用应用内更新服务，采用人工获取新版安装包的方式更新；开发版不会连接正式更新源。更新 Provider 由 `ops/app-release/release.config.json` 在构建时确定，GitHub Release 是默认方案，阿里云 OSS 是备选方案。

以下边界继续保持：

- 不向渲染进程开放通用外部链接 IPC；
- 不自动下载更新，不在普通退出时静默安装；
- 安装前必须等待扫描、处理或导出任务结束；
- 扫描、清洗、脱敏、排版和导出保持完全离线，更新请求不携带项目内容。

一键本地打包和归档详见 [`RELEASE_PACKAGING.md`](RELEASE_PACKAGING.md)，安装包同步详见 [`RELEASE_SYNC.md`](RELEASE_SYNC.md)。CodeDoc 发布工具、配置和记录统一位于本仓库 `ops/app-release/`，不依赖其他应用仓库作为发布控制面。更新架构和发布边界见 [`04-通用应用内更新技术方案.md`](04-通用应用内更新技术方案.md)。

## 安全与依赖基线

当前安全基线包括：

- Electron 渲染进程启用 sandbox，继续使用 `contextIsolation: true`、`nodeIntegration: false` 和严格 CSP；
- preload 只通过 `contextBridge` 暴露面向具体操作的窄接口，不直接暴露 `ipcRenderer`；
- 主进程 IPC 只接受当前主窗口发送的请求，并对任务标识、绝对路径、项目内相对路径、文本、清洗配置、导出格式及配置体积做运行时校验；
- 项目配置只允许写回当前成功扫描且目录身份未变化的项目根目录；
- electron-vite 升级到 5.x、Vite 升级到 7.x、React 插件升级到 5.x；Electron 仍保持 43.x，避免在同一阶段叠加桌面运行时大版本迁移；
- `npm audit` 的运行时及完整依赖树均为 0 个已知漏洞，CI 与打包工作流会重新执行审计。

安全边界、限制及回归要求详见 [`SECURITY.md`](SECURITY.md)。依赖审计依赖 npm 当前漏洞数据库；它能防止已知问题回退，但不能证明不存在未知漏洞。

## 每次正式分发必须确认

以下事项不得由维护脚本猜测、跳过或自动填写：

1. 用户可见支持渠道。
2. 版本号、CHANGELOG、源码 Commit 和 Git Tag 一致。
3. macOS 使用有效的 Developer ID Application 身份，并完成 Hardened Runtime、Apple 公证、staple、Gatekeeper 和真实安装验证。
4. GitHub 或 OSS 中的安装包、更新元数据、哈希和发布回执来自同一次受控构建。
5. Windows 当前不启用应用内更新且未做代码签名；扩大公开分发范围前必须重新评估签名与系统信誉提示风险。

任何密钥、证书、私钥、公证密码或 Apple 凭据都不得提交到仓库。

## 本地开发 DMG 的边界

关闭 `CSC_IDENTITY_AUTO_DISCOVERY` 生成的 DMG 只用于验证构建链，不能替代正式发布包。正式 DMG 必须由 `package:release` 的受控流程生成并通过签名、公证、staple、Gatekeeper、真实安装和发布哈希校验。
