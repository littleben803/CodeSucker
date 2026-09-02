# CodeDoc 本地发布打包

本文说明如何在不依赖 AI、不上传服务器且不修改 Git 历史的情况下，从已提交的 CodeDoc 源码生成并归档发布候选产物。

## 一条命令

在 CodeSucker 根目录执行：

```bash
npm run package:release
```

脚本会交互选择 `beta` 或 `stable`，并默认构建以下三套目标：

- `mac-arm64`：Developer ID 签名、公证、Stapler 与 Gatekeeper 校验，包含 DMG 和应用内更新 ZIP；
- `mac-x64`：与 arm64 相同，但可执行文件只包含 `x86_64`；
- `win-x64`：企业内部分发和下载的 NSIS EXE，不要求 Windows 代码签名，不发布应用内更新元数据。

只查看计划、不执行构建：

```bash
npm run package:release -- --dry-run --channel beta --targets all
```

确定参数后跳过最终 `BUILD` 输入：

```bash
npm run package:release -- --channel beta --targets all --yes
```

也可以只构建部分目标：

```bash
npm run package:release -- --channel stable --targets mac-arm64,mac-x64 --yes
npm run package:release -- --channel beta --targets win-x64 --yes
```

## 打包前准备

1. 使用 Node.js `24.19.0`，依赖通过 `npm ci` 安装。
2. 用 `npm run version:set -- <version>` 设置版本，更新 `CHANGELOG.md`，完成代码审查并提交。
3. CodeSucker 和 IdeaBoxWebsite 工作区都应保持干净。
4. macOS 目标需要本机存在 Developer ID Application，并已保存 `ideabox-notary` Keychain profile。
5. Gatekeeper 必须开启。

首次在 macOS 上交叉构建 Windows 安装包时，Electron Builder 会下载官方
Electron / NSIS 工具链。若代理或网络导致下载长时间无进展，可按
`Control-C` 中止，修复网络后重新执行；目标未通过校验前，脚本不会生成该
版本的官网归档记录。

通道与版本必须匹配：

- Beta：`1.2.3-beta.1`；
- Stable：`1.2.3`。

脚本不会自动改版本、提交、创建 Tag 或推送。源码以当前 Git Commit 追溯，Tag 不是必需项。

## 执行顺序

脚本在真正构建前显示版本、通道、Commit、目标和归档仓库，并提示 `开始本地打包与归档？[Y/n]`。直接回车或输入 `y` 继续，输入 `n` 取消；默认选择 `y`。确认后执行：

1. 检查源码与归档目标不存在冲突；
2. 检查 macOS 签名身份、公证 profile 和 Gatekeeper；
3. 运行完整 `npm run verify`；
4. 在互相隔离的临时目录依次构建三个目标；
5. macOS 校验 Bundle ID、版本、单架构、深层签名、公证票据和系统分发策略；
6. Windows 校验 EXE 体积和 MZ/PE 文件头；
7. 调用 IdeaBoxWebsite 的发布 checklist；
8. 写入二进制归档、SHA-256、构建日志、验证日志与 Git-safe prepared 记录。

任何目标失败都会停止后续目标，并保留临时目录和已完成目标，方便审计。脚本拒绝覆盖同版本同目标的既有归档；修复后应使用新版本号重新构建。

## 归档位置

二进制和本机验证资料不会进入 Git：

```text
../IdeaBoxWebsite/ops/app-release/.release-work/
└── codedoc/<channel>/<platform>/<arch>/<version>/
    ├── files/
    ├── release-manifest.json
    ├── build-report.json
    ├── SHA256SUMS.txt
    └── verification/
        ├── npm-verify.log
        ├── build.log
        └── 平台验证日志
```

可进入 Git 的小型发布记录位于：

```text
../IdeaBoxWebsite/ops/app-release/releases/
└── codedoc/<channel>/<version>/<platform>-<arch>.prepared.json
```

## 上传边界

本脚本只负责本地构建、校验和归档，绝不执行以下操作：

- SSH 中转；
- 上传 OSS；
- 发布 `latest-mac.yml`；
- 更新官网下载链接；
- Git commit、Tag 或 push。

需要发布时，继续按 IdeaBoxWebsite 的 `ops/app-release/README.md` 执行服务器中转和分阶段发布。Windows 企业内部下载包只上传带版本号的 EXE，不发布 `latest.yml`，也不参与 Windows 应用内更新。
