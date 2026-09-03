# CodeDoc 1.0.1-beta.2 macOS arm64 Beta 验收

- 验收时间（UTC）：2026-09-02T07:21:28Z
- Bundle ID：`com.ideaboxapps.codedoc`
- 源版本：`1.0.1-beta.1`
- 目标版本：`1.0.1-beta.2`
- 更新通道：`beta`
- 源码 Commit：`70c8522f29b15aa62e68a7ce91265e92044c521c`
- 源码 Tag：`v1.0.1-beta.2`
- 发布回执：`published.json` 中的 `mac-arm64` 目标记录

## 端到端结果

1. 将已签名、公证且已 Staple 的 beta.1 安装到 `/Applications/CodeDoc.app`。
2. `spctl --status` 返回 `assessments enabled`。
3. beta.1 设置页显示 `BETA`、当前版本 `v1.0.1-beta.1` 和可用的“检查更新”操作。
4. 发布 `latest-mac.yml` 后，CDN 返回目标版本 `1.0.1-beta.2`；元数据 SHA-256 为 `6b5b076f5eca7b83cd340718d4d04916bdb75cf955ef0ffc3512d99e12bb8a9d`，ZIP Range 请求返回 HTTP `206`。
5. 应用内依次完成发现 beta.2、下载约 118 MB 更新、进入“重启并安装”和自动重启。
6. 重启后的设置页与安装目录均显示 `v1.0.1-beta.2`。
7. 安装后的 beta.2 通过深层签名校验、Developer ID 与 Team ID 校验、Stapler 票据校验和 `syspolicy_check distribution`；系统输出 `Passed Gatekeeper scan` 及 `ready for distribution`。
8. 服务器完成 `verify-release` 和 `finalize`，版本目录已从 `incoming` 归档，并生成不可变 published 回执。

结论：`1.0.1-beta.1 -> 1.0.1-beta.2` 真实安装版应用内升级验收通过。

## 已知项

- beta 验收使用命令行参数选择更新通道；`quitAndInstall` 重启后该临时参数不会继承，因此重启后的界面恢复显示 `STABLE`。本次目标版本安装结果不受影响；后续若需要长期 Beta 用户通道，应单独设计持久化通道选择。
- 当前 DMG 容器没有单独签名或 Staple，但其中的 `.app` 已完成 Developer ID 签名、公证和 Staple，并通过 macOS 分发检查。正式 stable 发布前建议补齐 DMG 容器签名、公证和 Staple，降低下载与挂载阶段的信任链歧义。
- prepared 与 published JSON 保留发布准备时的 `gatekeeper: disabled-warning` 历史事实，不覆盖写入；本文件记录随后开启 Gatekeeper 后完成的真实验收。
