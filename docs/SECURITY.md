# CodeDoc 桌面安全基线

本文记录阶段 3 建立的桌面运行时边界，供后续维护、代码审查和发布验收使用。

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

`packages/app/test/security-policy.ts` 防止 sandbox、context isolation、Node integration、CSP 和 preload 暴露策略回退；IPC 与路径校验另有单元测试。GitHub CI 和打包工作流都会检查锁定依赖的已知漏洞。

## 仍不包含的能力

本阶段没有新增网络请求、在线账号、分析或追踪 SDK、自动更新、签名、公证或凭据管理。依赖审计只覆盖公开数据库中已经披露的问题；正式公开分发仍需 Developer ID 签名、Hardened Runtime、公证、staple 和干净机器安装验证。
