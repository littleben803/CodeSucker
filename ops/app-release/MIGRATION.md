# 发布工具迁移记录

2026-09-03，CodeDoc 发布工具从 IdeaBoxWebsite 迁入 CodeSucker，目的是让构建、归档、同步和发布记录在应用仓库内闭环。

迁移来源：

- 仓库：`IdeaBoxWebsite`
- 来源 Commit：`0262dbb5c1e53ace2ead62c5a74e76efb0feddd1`
- 来源目录：`ops/app-release/`

阶段 2A 先复制后改造。复制时排除 `.DS_Store`，其余发布工具、测试、Git 发布记录和 `.release-work` 本地归档逐文件执行 SHA-256 比较，结果一致。

迁入后发生的预期调整：

- `apps.json` 改为 CodeDoc 专属 `release.config.json`；
- 打包归档改为当前仓库 `ops/app-release/.release-work/`；
- 新增 `npm run release:sync` 整批同步入口；
- 应用内更新地址从同一发布配置读取；
- 服务器兼容路径暂时保留 `/opt/ideabox-release`、`/etc/ideabox-release` 和 `/srv/ideabox-release`。

阶段 2B 完成双仓文档和操作入口回写。阶段 2C 清理前再次逐文件比较 6 个发布记录和 37 个本地归档文件，结果一致；随后 IdeaBoxWebsite 删除旧脚本、测试、发布记录和本地归档，只保留 `ops/app-release/README.md` 迁移说明。发布控制面迁移至此完成。
