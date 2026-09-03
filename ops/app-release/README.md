# CodeDoc 发布工具

本目录负责 CodeDoc 安装包的本地归档、发布校验、OSS/CDN 同步和发布记录。所有命令都从 CodeSucker 根目录执行，不依赖 IdeaBoxWebsite 工作区。

## 目录

- `release.config.json`：CodeDoc、目标平台和托管 Provider 配置；不得保存凭据。
- `prepare-release.mjs`：归档产物、执行 checklist、生成 prepared 记录。
- `release.mjs`：OSS 对象路径、上传和校验的底层契约。
- `publish-via-host.mjs`：把单个目标安全中转到发布服务器。
- `sync-release.mjs`：面向维护者的整批同步入口。
- `server/`：服务器审计、部署、互斥发布和 OSS/CDN 验证工具。
- `releases/`：可进入 Git 的聚合 prepared、published 和逐平台 acceptance 记录。
- `.release-work/`：被 Git 忽略的安装包、清单、哈希和验证日志。

## 日常入口

先生成并归档正式候选包：

```bash
npm run package:release
```

只查看同步计划：

```bash
npm run release:sync -- --channel stable --targets all
```

计划会显示版本、Provider、目标、文件和精确确认字符串。确认后执行：

```bash
npm run release:sync -- \
  --channel stable \
  --targets all \
  --execute \
  --confirm 'sync:codedoc@1.0.0:stable:oss'
```

版本从根 `package.json` 读取。Beta 和 stable 必须分别使用 Beta SemVer 和正式 SemVer。可以通过 `--targets mac-arm64,mac-x64` 只处理部分目标。

同步顺序固定为：

```text
本地清单和 prepared 记录复核
  -> 全部目标中转
  -> 全部版本化产物上传
  -> OSS/CDN 验证
  -> 发布更新元数据
  -> 再次验证
  -> 服务器归档
  -> 取回 published 记录
  -> 打印安装包 URL 和聚合回执路径
```

所有版本化产物通过验证前，不会发布 `latest-mac.yml`。Windows 当前是 `internal-download`，只发布版本化安装包，不发布更新元数据。

执行模式会实时显示目标、远端恢复状态、阶段和文件传输进度。日志中的 `START` 表示开始、`SKIP` 表示服务器已有可验证进度、`SUCCESS` 表示该步骤完成、`FAIL` 表示停止并保留现场。OSS 上传和回读使用 ossutil 原生进度，CDN 完整下载校验按百分比输出。

## Provider 配置

`release.config.json` 中：

- `activeProvider` 决定构建进客户端的应用内更新源；
- `publishProviders` 决定发布脚本写入哪些托管端；
- 当前只启用 `oss`；
- `github` 是后续实现的保留项，启用前会被配置检查拒绝。

切换 `activeProvider` 后必须重新构建安装包。AccessKey、SSH 私钥、签名证书和公证凭据不得写入配置、命令参数、清单、发布记录或日志。

## 恢复与安全边界

- 默认是 dry-run；只有 `--execute` 和完全匹配的确认字符串同时存在才会写服务器或云端。
- 版本化 OSS 对象不可覆盖。
- 服务器阶段使用标记文件；重新执行会跳过已完成阶段。
- 已 finalize 但本地缺回执时，只重新取回 published 记录。
- 本地 `prepared.json`、`published.json` 使用 `targets` 聚合平台记录；已存在的平台不可覆盖。
- 本地已有对应平台的 published 记录时会先核对身份，不会重复取回或覆盖历史。
- 同一目标由服务器 `flock` 互斥执行。
- 脚本不构建安装包、不修改版本、不提交、不创建 Tag、不推送 Git、不部署官网。

Windows 后续版本计划切换为只提示更新的 `update-notification` 模式，并发布 `latest-win.yml`。该规划不改变当前 `1.0.0` 的 prepared 记录。

生产服务器目前继续使用兼容路径：

```text
/opt/ideabox-release
/etc/ideabox-release
/srv/ideabox-release
```

路径名称不代表发布工具仍属于官网仓库。本阶段不迁移生产凭据或服务器目录。

## 底层单目标命令

日常维护应使用 `npm run release:sync`。故障排查时才直接运行底层命令：

```bash
node ops/app-release/prepare-release.mjs checklist \
  --manifest ops/app-release/.release-work/codedoc/stable/mac/arm64/1.0.0/release-manifest.json

node ops/app-release/publish-via-host.mjs \
  --manifest ops/app-release/.release-work/codedoc/stable/mac/arm64/1.0.0/release-manifest.json
```

底层写操作仍要求各阶段自己的精确确认字符串，不应使用手写 `ossutil cp` 绕过门禁。

## 服务器工具

服务器路径和凭据不变时，只需从当前仓库部署工具：

```bash
./ops/app-release/server/audit-server.sh
./ops/app-release/server/deploy-server-tools.sh
```

部署和凭据配置脚本默认 dry-run。不要读取、打印、截图或复制 `/etc/ideabox-release/ossutilconfig`。

## 离线验证

```bash
node --check ops/app-release/*.mjs
bash -n ops/app-release/server/*.sh
npm run release:tools:test
npm run verify
```

测试使用临时文件和假的 SSH、rsync、OSS 工具，不访问真实服务器或云服务。
