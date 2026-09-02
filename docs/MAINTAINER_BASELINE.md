# CodeDoc 维护者基线

## 目标

本文件定义 CodeDoc 当前版本的最低可复现条件、验证命令和分发边界。

## 产品与工程基线

- 产品版本：由根目录及两个 workspace 的 `package.json` 统一声明，并由 `npm run version:check` 校验
- 产品名称：`CodeDoc`
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
npm run perf
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:arm64
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:x64
```

`npm run verify` 包含版本、锁文件源、图标、许可证、核心/桌面端测试、生产构建和 worker 集成测试。

## 已确认的产品链路

在隔离用户数据目录和临时项目中，v0.4.4 已实际完成：

1. 启动桌面应用。
2. 选择项目目录并扫描源码。
3. 调整文件范围和排序。
4. 填写软件名称及著作权人并执行清洗。
5. 生成分页预览和风险校验。
6. 导出 DOCX，并通过 ZIP 容器完整性检查。

自动化验证不能替代每个正式候选版本的真实 GUI 冒烟，但日常改动至少必须保持 `npm run verify` 通过。

## 当前网络边界

CodeDoc 已为 macOS 接入受控的应用内更新路径：macOS 正式安装版可在启动后延迟检查，或由用户在设置页主动检查和下载更新；Windows 不展示更新入口，也不执行启动检查，采用人工获取新版安装包的方式更新；开发版不会连接生产更新源。macOS 更新源仅允许使用 `https://download.ideaboxapps.com/codedoc/<channel>/mac/<arch>/`，渲染进程只能经 Preload 白名单调用检查、下载和安装操作，不能直接访问网络、文件系统或完整 `ipcRenderer`。

以下边界继续保持：

- 不恢复旧 GitHub Release 检查或任何失效原仓库 URL；
- 不向渲染进程开放通用外部链接 IPC；
- 不自动下载更新，不在普通退出时静默安装；
- 安装前必须等待扫描、处理或导出任务结束；
- 扫描、清洗、脱敏、排版和导出保持完全离线，更新请求不携带项目内容。

一键本地打包和归档详见 [`RELEASE_PACKAGING.md`](RELEASE_PACKAGING.md)。更新架构、OSS/CDN 路径、发布顺序和证书续期方案详见 [`04-通用应用内更新技术方案.md`](04-通用应用内更新技术方案.md)。

## 安全与依赖基线

阶段 3 已完成以下收敛：

- Electron 渲染进程启用 sandbox，继续使用 `contextIsolation: true`、`nodeIntegration: false` 和严格 CSP；
- preload 只通过 `contextBridge` 暴露面向具体操作的窄接口，不直接暴露 `ipcRenderer`；
- 主进程 IPC 只接受当前主窗口发送的请求，并对任务标识、绝对路径、项目内相对路径、文本、清洗配置、导出格式及配置体积做运行时校验；
- 项目配置只允许写回当前成功扫描且目录身份未变化的项目根目录；
- electron-vite 升级到 5.x、Vite 升级到 7.x、React 插件升级到 5.x；Electron 仍保持 43.x，避免在同一阶段叠加桌面运行时大版本迁移；
- `npm audit` 的运行时及完整依赖树均为 0 个已知漏洞，CI 与打包工作流会重新执行审计。

安全边界、限制及回归要求详见 [`SECURITY.md`](SECURITY.md)。依赖审计依赖 npm 当前漏洞数据库；它能防止已知问题回退，但不能证明不存在未知漏洞。

## 正式分发前必须确定

以下事项不得由维护脚本猜测或自动填写：

1. 用户可见支持渠道。
2. CodeDoc 新图标及其平台生成资产。
3. 官网直接分发所需的 Developer ID Application 证书和公证凭据；当前检测到的 Apple Distribution 证书不能替代该用途。
4. Windows 安装包仅用于小范围内部下载，不启用应用内更新，也不要求代码签名；若未来扩大公开分发范围，必须重新评估 Windows 签名方案。

任何密钥、证书、私钥、公证密码或 Apple 凭据都不得提交到仓库。

## DMG 的含义

关闭 `CSC_IDENTITY_AUTO_DISCOVERY` 生成的 DMG 只用于验证构建链。公开分发至少需要：Developer ID 签名、启用 Hardened Runtime、Apple 公证、staple 校验、干净机器安装测试和 SHA-256 发布清单。
