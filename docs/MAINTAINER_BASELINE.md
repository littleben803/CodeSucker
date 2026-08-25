# CodeSucker 维护者基线

## 目标

本文件定义从恢复后的 v0.4.4 继续开发时的最低可复现条件、验证命令和暂不跨越的分发边界。

## 基线来源

- 产品版本：`0.4.4`
- 原始提交：`b065a1825f4e32dca4c4b7fd8bccf3e020a77c5c`
- 恢复提交：`b7900b5127a1a7e854980eb2b52d250c8ac69df5`
- 来源与交叉校验过程：[`RECOVERY.md`](RECOVERY.md)

原始项目的 Apache-2.0 `LICENSE`、`NOTICE`、第三方归属清单和 Git 历史必须继续保留。修改或再分发时应标明变更，不得移除原作者版权信息。

## 开发环境

- macOS Apple Silicon 已完成实际运行与 arm64 DMG 验证。
- CI 基准为 Node.js `22.12.0`；工程声明最低版本为 Node.js `>=22.12.0`。
- 依赖必须通过 `npm ci` 按 `package-lock.json` 安装，不使用未锁定的临时版本作为验收结果。

```bash
npm ci
npm run audit:runtime
npm run audit:all
npm run verify
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

原始 `fanbuz/codesucker` Release 地址已经不可用。为避免启动时请求失效服务或把用户导向错误下载地址，维护基线已经移除：

- 启动时 GitHub Release 检查；
- 设置页手动检查更新和下载入口；
- 渲染进程可调用的外部链接 IPC；
- 指向失效原仓库的运行时 URL。

扫描、清洗、排版和导出保持离线。重新接入更新功能前，必须先确定公开维护仓库，并重新建立仅允许预期域名和路径的外链白名单及测试。

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

1. 新的公开维护仓库和 Release 地址。
2. 新维护者名称及用户可见支持渠道。
3. 是否继续使用 `CodeSucker` 名称、现有图标和 `com.fanbuz.codesucker` Bundle ID。
4. Apple Developer Team、Developer ID Application 证书和公证凭据。
5. 是否继续提供 Windows 版本及其代码签名方案。

任何密钥、证书、私钥、公证密码或 Apple 凭据都不得提交到仓库。

## DMG 的含义

关闭 `CSC_IDENTITY_AUTO_DISCOVERY` 生成的 DMG 只用于验证构建链。公开分发至少需要：Developer ID 签名、启用 Hardened Runtime、Apple 公证、staple 校验、干净机器安装测试和 SHA-256 发布清单。
