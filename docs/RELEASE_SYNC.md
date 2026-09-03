# CodeDoc 安装包同步

本文是 CodeDoc 发布人员的日常操作手册。打包细节见 [`RELEASE_PACKAGING.md`](RELEASE_PACKAGING.md)，底层脚本和故障排查见 [`../ops/app-release/README.md`](../ops/app-release/README.md)。

## 发布前

1. 确认版本和通道匹配：Beta 使用 `1.2.3-beta.1`，stable 使用 `1.2.3`。
2. 执行 `npm run package:release`，完成所需平台的正式构建与归档。
3. 确认 `ops/app-release/release.config.json` 中的 `activeProvider` 和 `publishProviders`。
4. 不要把 AccessKey、SSH 私钥、签名证书或密码放进项目。

## 查看计划

```bash
npm run release:sync -- --channel stable --targets all
```

该命令只读取配置、归档、清单和发布记录，不访问服务器。逐项检查版本、平台、文件名和 Provider。

## 执行同步

复制计划末尾显示的确认字符串：

```bash
npm run release:sync -- \
  --channel stable \
  --targets all \
  --execute \
  --confirm 'sync:codedoc@1.0.0:stable:oss'
```

脚本会先发布并验证所有版本化产物，再发布更新元数据。完成后，本地应出现：

```text
ops/app-release/releases/codedoc/<channel>/<version>/published.json
```

`published.json` 的 `targets` 数组聚合各个平台的最终 OSS Key、CDN `publicUrl`、文件大小和 SHA-256。同步成功后，终端还会直接打印本次所选平台的安装包下载地址和该回执路径。

## 进度日志

执行模式会实时打印：

- 发布计划和每个目标的服务器恢复状态；
- handoff、`upload-artifacts`、`verify-artifacts`、`publish-metadata`、`verify-release`、`finalize` 和回执下载阶段；
- 本机到服务器的 rsync 文件传输进度；
- OSS 上传、Stat、回读校验，以及 CDN 完整下载百分比和 Range 验证；
- 每个目标和阶段的 `START`、`SKIP`、`SUCCESS` 或 `FAIL`。

出现 `FAIL` 或 `ERROR` 时保留现场，不要并发重试。确认原进程已经结束后，使用完全相同的同步命令续跑。

## 中断后继续

使用完全相同的命令重新执行。脚本会读取服务器阶段状态，跳过已经完成的步骤。不要手工删除服务器标记、覆盖 OSS 对象或重写历史回执。

如果脚本报告身份、哈希或远端对象不一致，应停止发布并保留现场，不要用强制覆盖解决。

## 当前 Provider 状态

- OSS：已启用，使用 `download.ideaboxapps.com` 对外下载。
- GitHub：只保留配置入口，尚未实现同步和应用内更新，不可启用。

GitHub 方案完成专项调研和真实升级验证后，才允许修改 `activeProvider` 或把 `github` 加入 `publishProviders`。

## 发布后人工验收

脚本完成只代表服务器、OSS、CDN 和回执检查通过。正式发布仍需人工验证：

- macOS arm64/x64 首次安装；
- 已安装旧版本到新版本的应用内升级；
- 签名、公证、Stapler 和 Gatekeeper；
- Windows 安装包下载及覆盖安装；
- 官网下载链接。

人工验收结果写入同版本目录的 `<platform>-<arch>.acceptance.md`，不得改写 prepared 或 published 历史记录。

Windows `1.0.0` 仍按 `internal-download` 发布，不包含更新元数据。后续版本计划使用 `latest-win.yml` 提供版本发现和人工下载提示；在 Windows 代码签名完成前，不启用应用内自动下载安装。
