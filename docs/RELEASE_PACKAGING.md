# CodeDoc 本地发布打包

本文说明如何在不依赖 AI、不上传服务器且不修改 Git 历史的情况下，从已提交的 CodeDoc 源码生成并在本仓库归档发布候选产物。

macOS 与 Windows 安装后的用户可见名称统一为“软著代码整理器”；应用包、可执行文件和 `CodeDoc-<version>-<platform>-<arch>` 发布产物继续使用 `CodeDoc` 技术名，避免破坏升级兼容和同步脚本。

## 一条命令

在 CodeSucker 根目录执行：

```bash
npm run package:release
```

脚本会交互选择 `beta` 或 `stable`，并默认构建以下三套目标：

- `mac-arm64`：Developer ID 签名、公证、Stapler 与 Gatekeeper 校验，包含 DMG 和应用内更新 ZIP；
- `mac-x64`：与 arm64 相同，但可执行文件只包含 `x86_64`；
- `win-x64`：用于人工下载安装的 NSIS EXE；当前不要求 Windows 代码签名，也不启用应用内自动下载和安装。

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
2. 用 `npm run version:set -- <version>` 设置版本，更新 `docs/CHANGELOG.md`，完成代码审查并提交。
3. CodeSucker 工作区应保持干净。
4. macOS 目标需要本机存在 Developer ID Application，并已保存 `ideabox-notary` Keychain profile。
5. Gatekeeper 必须开启。

打包脚本不会让 Electron Builder 隐式下载目标平台的 Electron Runtime。它会优先查找 CodeDoc 专用缓存和 Electron 标准缓存，并使用仓库中锁定版本的 `node_modules/electron/checksums.json` 校验 SHA-256。只要任一所选目标缺少有效缓存，脚本就会在构建前停止，以红字显示缺失文件、期望哈希和可复制的官方 `curl` 下载命令。下载完成后重新运行即可。

CodeDoc 专用缓存默认位于：

```text
~/Library/Caches/CodeDoc/electron/
```

Windows NSIS 辅助工具不属于 Electron Runtime。选择 Windows 目标时，脚本固定使用 Electron Builder toolset `nsis@1.2.1` 的 NSIS 3.12 unified bundle，避免 Apple Silicon 执行旧版 Intel `makensis` 时依赖 Rosetta。统一归档必须位于 Electron Builder 标准缓存目录并通过固定 SHA-256 校验；缺失时以红字给出官方 `curl` 命令。下载归档即可，无需手动解压。

通道与版本必须匹配：

- Beta：`1.2.3-beta.1`；
- Stable：`1.2.3`。

脚本不会自动改版本、提交、创建 Tag 或推送。源码以当前 Git Commit 追溯；发布 GitHub Stable Release 前，必须先创建并推送指向该构建 Commit 的附注 Tag。只做本地构建验收时可以不创建 Tag。

## 执行顺序

脚本在真正构建前显示版本、通道、Commit、目标和本地归档目录，并提示 `开始本地打包与归档？[Y/n]`。直接回车或输入 `y` 继续，输入 `n` 取消；默认选择 `y`。确认后执行：

1. 检查源码与归档状态；完整且仍兼容当前构建输入的已有目标会复核后跳过；
2. 查找并校验全部所选目标的 Electron 本地缓存；选择 Windows 时同时校验 NSIS 3.12 unified bundle；
3. 检查 macOS 签名身份、公证 profile 和 Gatekeeper；
4. 运行完整 `npm run verify`；
5. 在互相隔离的临时目录依次构建三个目标；
6. macOS 校验 Bundle ID、版本、单架构、深层签名、公证票据和系统分发策略；
7. Windows 校验 EXE 体积和 MZ/PE 文件头；
8. 调用本仓库 `ops/app-release/` 的发布 checklist；
9. 写入二进制归档、SHA-256、构建日志、验证日志与 Git-safe prepared 记录。

任何目标失败都会停止后续目标，并保留临时目录和已完成目标，方便审计。重新执行时，脚本支持断点续打：

- 归档目录与 `prepared.json` 中对应平台记录同时存在时，重新运行 checklist 并校验源码兼容性；
- 从原构建 Commit 到当前 Commit 只修改打包脚本或文档时，已有目标会自动跳过；
- `packages/app`、`packages/core`、根 `package.json`、`package-lock.json` 或随包许可证发生变化时，拒绝复用旧包；
- 只有归档或只有 prepared 记录属于不完整状态，脚本会停止，不会覆盖历史；
- 尚未归档的目标继续构建，全部目标已经完成时正常结束。

## 归档位置

二进制和本机验证资料不会进入 Git：

```text
ops/app-release/.release-work/
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
ops/app-release/releases/
└── codedoc/<channel>/<version>/prepared.json
```

`prepared.json` 的 `targets` 数组聚合该版本已完成归档的平台；已存在的平台记录不可覆盖，新平台以原子方式追加。

## 上传边界

本脚本只负责本地构建、校验和归档，绝不执行以下操作：

- SSH 中转；
- 上传 OSS；
- 发布 `latest-mac.yml`；
- 修改任何外部下载页面；
- Git commit、Tag 或 push。

需要发布时，继续执行 `npm run release:sync`。日常步骤见 [`RELEASE_SYNC.md`](RELEASE_SYNC.md)，底层发布工具见 [`../ops/app-release/README.md`](../ops/app-release/README.md)。Windows 发布带版本号的 EXE及配套发布资产；`latest-win.yml` 可供外部版本发现和人工下载提示使用，但当前应用本身不启用 Windows 应用内更新服务。
