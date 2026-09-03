# CodeDoc Release Records

本目录保存可进入 Git 的应用发布记录，不保存安装包、blockmap、证书或凭据。

目录协议：

```text
codedoc/<channel>/<version>/prepared.json
codedoc/<channel>/<version>/published.json
codedoc/<channel>/<version>/<platform>-<arch>.acceptance.md
```

`prepared.json` 由 `../prepare-release.mjs record` 生成，`published.json` 由后续服务器发布阶段生成。两个文件都使用 `targets` 数组聚合该版本各平台记录，包括源码 Commit、签名与公证公开状态、文件名、大小、哈希、OSS/CDN 地址和校验结果。聚合文件允许原子追加新平台，但不得覆盖已经存在的平台记录；同一目标需要修正时，应先审计原因，不得静默重写历史。

`*.acceptance.md` 记录 published 之后的真实安装、应用内升级和平台安全检查。它用于追加说明验收事实，不得改写 prepared 或 published 回执中的历史状态，也不得包含本地用户数据、凭据或签名私钥。
