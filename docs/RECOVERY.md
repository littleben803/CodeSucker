# CodeSucker v0.4.4 恢复记录

## 恢复目标

本仓库在 2026-08-25 接收时只包含软著申请工作流交接材料，不包含 CodeSucker 桌面应用源码。
本次恢复将原始 CodeSucker v0.4.4 应用、完整可获取 Git 历史、许可证、设计资料、测试与构建配置并入仓库，作为后续维护基线。

## 上游基线

- 版本：CodeSucker v0.4.4
- 发布提交：`b065a1825f4e32dca4c4b7fd8bccf3e020a77c5c`
- 提交作者：Fanbuz `<118787336+fanbuz@users.noreply.github.com>`
- 提交时间：2026-07-31T00:58:28+08:00
- 原仓库：`https://github.com/fanbuz/codesucker`（恢复时已无法公开访问）

## 交叉校验来源

恢复前通过 `git ls-remote` 确认以下独立公开 fork 的 `main` 均指向同一提交：

- `https://github.com/chituer/codesucker.git`
- `https://github.com/Alxstongit/codesucker.git`
- `https://github.com/xin-zero/codesucker.git`

实际 Git 对象从 `chituer/codesucker` 获取；提交哈希与另外两个来源一致，因此三者对应同一份 Git 内容。

## 历史与交接材料

- 原始 CodeSucker 历史以无共同祖先的合并方式保留，不压缩为单个源码快照。
- 恢复前已有的软著申请 skill 和辅助脚本未删除，归档至 `handoff/ruanzhu-one-stop/`。
- 原项目的 Apache-2.0 `LICENSE`、`NOTICE` 与 `THIRD_PARTY_NOTICES.txt` 保持在仓库根目录。
- 阶段 1 不修改原始业务逻辑、UI、依赖版本、产品版本、Bundle ID、品牌、签名或发布配置。

## 基线验收

恢复完成后至少执行：

```bash
npm ci
npm run verify
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:mac:arm64
```

DMG 仅用于验证构建链路；正式分发仍需要 Developer ID Application 签名、Apple 公证与干净机器验收。
