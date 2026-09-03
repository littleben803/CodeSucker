# CodeDoc 桌面安全基线

本文记录 CodeDoc 当前桌面运行时、文件访问、应用更新和正式分发的安全边界，供后续维护、代码审查和发布验收使用。

## 安全目标

CodeDoc 需要读取用户主动选择的本地源码并生成本地文档。安全基线的目标是：即使渲染页面出现缺陷，也不让页面直接获得 Node.js 或 Electron 的完整能力，并尽量把主进程文件访问限制在用户已经选择和扫描的上下文内。

## 渲染进程隔离

- 全局调用 `app.enableSandbox()`，窗口显式设置 `sandbox: true`；
- 保持 `contextIsolation: true` 和 `nodeIntegration: false`；
- renderer 使用限制为应用自身资源的 CSP，不允许 `unsafe-eval`；
- preload 通过 `contextBridge` 暴露按操作命名的 API，不暴露原始 `ipcRenderer` 对象。

参考 Electron 官方的 [Sandbox](https://www.electronjs.org/docs/latest/tutorial/sandbox)、[Context Isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) 和 [Security](https://www.electronjs.org/docs/latest/tutorial/security) 指南。

## IPC 与文件边界

主进程只接受当前主窗口 WebContents 发来的 IPC。所有扫描、处理和导出请求都在主进程重新校验，不信任 TypeScript 类型或 renderer 状态：

- 任务与会话标识限制字符集和长度；
- 输入、输出目录必须是无 NUL 字符的绝对路径；
- 文件顺序只接受无重复、无 `..`、非绝对的项目内相对路径；
- 软件信息、清洗选项、导出格式和项目配置均检查类型与大小；
- 项目配置最大 1 MiB，只能写入当前已扫描且目录身份未变化的项目根目录；
- 拖入目录先解析 realpath 并确认仍是目录；
- 定位问题文件时继续执行项目根目录身份和 realpath 边界检查。

输出目录仍由用户通过系统目录选择器主动选择。导出到该目录属于产品预期能力，不应被静默改成固定目录。

## 自动门禁

```bash
npm run audit:runtime
npm run audit:all
npm run verify
```

`packages/app/test/security-policy.ts` 防止 sandbox、context isolation、Node integration、CSP 和 preload 暴露策略回退；IPC 与路径校验另有单元测试。`packages/app/test/update-contract.ts` 检查更新平台范围、Provider 配置、用户确认、安装时机和签名公证配置。GitHub CI 和打包工作流都会检查锁定依赖的已知漏洞。

## 应用更新与网络边界

- 扫描、清洗、脱敏、分页、校验和导出始终在本机完成，不上传项目内容、路径或导出资料。
- 只有已打包的 macOS arm64 和 x64 应用启用应用内更新；开发版和 Windows 版不连接应用内更新源。
- 主窗口 `ready-to-show` 后延迟约 2～3 秒检查版本。检查只读取发布元数据，不自动下载安装包。
- 发现新版本后，必须由用户在设置页主动开始下载；下载完成后，仍需用户主动确认重启安装。
- `autoDownload` 和 `autoInstallOnAppQuit` 均保持关闭，普通退出不得静默安装更新。
- 扫描、处理或导出任务进行中时拒绝安装，避免更新退出破坏正在执行的本地任务。
- 更新 IPC 与其他 IPC 一样，只接受当前主窗口发送的请求；Preload 不暴露 `autoUpdater` 实例或通用网络能力。
- GitHub Release 是当前默认发布与更新 Provider，阿里云 OSS 是已验证的备选 Provider。`activeProvider` 属于构建时配置，切换后必须重新打包，不能在已安装应用中动态改写。
- 更新通道只接受 stable 或 beta；正式版本使用 stable，预发布版本依据版本号或受控启动参数进入 beta。
- 更新错误只向 Renderer 返回归一化提示，不应把凭据、内部命令或敏感路径暴露给界面和日志。

应用更新与发布架构详见 [`04-通用应用内更新技术方案.md`](04-通用应用内更新技术方案.md)，日常同步与验收流程见 [`RELEASE_SYNC.md`](RELEASE_SYNC.md)。

## 正式分发边界

- macOS 正式安装包要求启用 Hardened Runtime，并完成 Developer ID 签名、Apple 公证、staple、Gatekeeper 和真实安装验收；当前正式发布链路已经完成这些验证。
- Windows 安装包当前不启用应用内自动下载和安装，也未完成代码签名。扩大公开分发范围前应重新评估 Windows 签名与信誉提示风险。
- 发布脚本默认 dry-run；远端写入必须显式提供 `--execute` 和完全匹配的确认字符串。
- GitHub、OSS、Apple 或服务器凭据不得写入仓库配置、发布清单、回执、命令示例和终端日志。
- 安装包、更新元数据和公开下载地址必须来自同一版本的受控发布流程；不得覆盖已经发布的版本化资产。

## 仍不包含的能力

CodeDoc 不包含在线账号、云端源码处理、分析 SDK、广告追踪或远程 AI。未经明确评审，不得新增通用外链 IPC、Renderer 直接网络访问、云同步、自动上传或后台静默安装。

依赖审计只覆盖公开数据库中已经披露的问题，不能证明不存在未知漏洞。自动化门禁也不能替代每个正式候选版本的签名、公证、公开下载、真实安装和应用内升级验收。
