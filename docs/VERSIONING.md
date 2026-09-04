# CodeDoc 版本与发布规范

本文是 CodeDoc 产品版本、配置兼容、规则版本和 Git 发布的维护标准。打包与同步操作分别见 [RELEASE_PACKAGING.md](RELEASE_PACKAGING.md) 和 [RELEASE_SYNC.md](RELEASE_SYNC.md)。

## 一、版本类型

| 类型 | 当前示例 | 用途 | 来源 |
|---|---|---|---|
| 产品版本 | `1.0.3` | 应用、安装包和 Release 对外版本 | 根目录及两个 workspace 的 `package.json` |
| 构建来源 | Git SHA | 确认安装包对应的源码提交 | Git 与发布回执 |
| 项目配置版本 | `1` | 迁移 `.codedoc.json` | `CONFIG_SCHEMA_VERSION` |
| 合规规则版本 | `2026.08.1` | 记录导出采用的规则口径 | `RULES_VERSION` |

四种版本相互独立。产品升级不能替代配置迁移或规则版本更新。

## 二、产品版本

产品版本遵循 Semantic Versioning，`package.json` 中不带 `v` 前缀：

- `1.0.3`：缺陷修复或兼容性优化。
- `1.1.0`：新增用户可见能力，或调整处理、配置、输出行为。
- `2.0.0`：存在明确的不兼容变化。
- `1.1.0-beta.1`：公开测试版。
- `1.1.0-rc.1`：候选发布版，只接受发布阻断修复。

Git Tag 使用 `v<SemVer>`，例如 `v1.0.2`。已发布版本的 Tag、Release 和带版本号的安装包不得移动、覆盖或复用；需要修正时必须创建新版本。

## 三、统一版本入口

禁止手工只修改某一个 `package.json`。统一执行：

```bash
npm run version:set -- 1.0.3
```

脚本同步：

- `package.json`
- `packages/app/package.json`
- `packages/core/package.json`
- `package-lock.json` 的根包与 workspace 记录
- `docs/CHANGELOG.md` 顶部的新版本模板

重复设置同一版本不会重复插入 CHANGELOG 标题。

```bash
npm run version:check
npm run verify
```

`verify` 包含版本、lockfile、维护基线、图标、许可证、发布工具、单元测试、生产构建和 Worker Integration 检查。依赖安全审计由 CI 或发布前专项命令执行：

```bash
npm run audit:runtime
npm run audit:all
```

## 四、CHANGELOG

所有用户可见变化写入 `docs/CHANGELOG.md`。`version:set` 会在顶部生成：

```markdown
## [1.0.3] - 2026-09-04

### Added

### Changed
```

按实际变化填写内容；没有内容的分类可以删除。可使用 Added、Changed、Fixed、Security、Removed。日期使用本地日期，格式为 `YYYY-MM-DD`。

## 五、配置结构与规则版本

项目配置包含：

```json
{
  "schemaVersion": 1,
  "appVersion": "1.0.3",
  "rulesVersion": "2026.08.1"
}
```

配置结构版本规则：

- 新增可选字段且旧版本可安全忽略：通常不提升 schema。
- 删除、改名、改变字段类型或语义：提升 schema。
- 读取低版本时执行明确迁移，保存时写入当前 schema。
- 读取高于当前支持的版本时不得猜测解析，应提示升级应用。

以下变化需要更新 `RULES_VERSION`：

- 申报规则或审查口径变化。
- 新增、删除或改变校验项及判定。
- 改变分页、截取、页眉、页脚或文档格式规则。

单纯 UI、性能和不影响输出结果的修复不提升规则版本。

## 六、分支与 Tag

- `main` 始终保持可测试、可构建。
- 功能与修复使用短期分支；不维护长期 `develop` 分支。
- 需要时创建版本 milestone，例如 `v1.0.3`。
- release blocker 处理完成后才能创建 Stable Tag。
- 正式构建前工作区必须干净。
- 三个平台必须由同一个 Tag 指向的源码提交构建。

```bash
git tag -a v1.0.3 -m "CodeDoc 1.0.3"
git push origin v1.0.3
```

## 七、发布 Provider

Provider 配置位于 `ops/app-release/release.config.json`：

- `activeProvider`：构建进客户端的应用内更新源。
- `publishProviders`：发布脚本的默认托管目标。
- GitHub Release 是当前默认 Provider。
- 阿里云 OSS 是可以独立切换的备选 Provider。

切换 `activeProvider` 后必须重新构建安装包。GitHub 和 OSS 的真实发布、公网下载及 macOS 应用内升级均已验证。Windows 发布元数据可以支持外部版本发现和人工下载提示，但当前应用不启用 Windows 应用内更新服务。

## 八、正式发布流程

### 8.1 设置版本并验证

```bash
npm run version:set -- <version>
npm run audit:runtime
npm run audit:all
npm run verify
```

填写 CHANGELOG，提交并推送版本修改，然后创建与版本一致的附注 Tag。Tag 必须指向实际用于构建的源码提交。

### 8.2 构建三平台安装包

```bash
npm run package:release -- \
  --channel stable \
  --targets all \
  --yes
```

脚本构建并归档 macOS arm64、macOS x64 和 Windows x64，生成更新元数据与聚合 `prepared.json`。macOS Stable 正式包必须完成 Developer ID 签名、公证、staple 和 Gatekeeper 验证。

### 8.3 发布预演

```bash
npm run release:sync -- \
  --provider github \
  --channel stable \
  --targets all
```

预演不写入远端。确认版本、Tag、提交、文件、哈希、目标地址和确认字符串正确后再执行。

### 8.4 正式发布

```bash
npm run release:sync -- \
  --provider github \
  --channel stable \
  --targets all \
  --execute \
  --confirm '<dry-run 输出的确认字符串>'
```

GitHub 发布采用 Draft、上传、资产校验、公开 Release 的顺序。中断后可安全续跑：一致资产跳过，不一致资产阻止发布。

发布后检查：

- 三个平台安装包可以公开下载。
- `latest-mac.yml` 与 `latest-win.yml` 可访问；后者当前不代表应用已启用 Windows 应用内更新。
- macOS 旧版可以检测、下载并安装新版本。
- 对应版本的 `published.json` 已生成。

## 九、发布记录与安全边界

- `prepared.json` 和 `published.json` 按版本聚合平台及 Provider 记录。
- 发布回执可以提交；安装包和 `.release-work` 不得提交。
- Token、AccessKey、证书、私钥和密码不得进入配置、参数、日志或回执。
- 发布脚本默认 dry-run，真实写入必须提供 `--execute` 和完全匹配的确认字符串。
- 不得修改已发布版本的历史回执。

## 十、当前基线

截至 2026-09-04：

- 源码产品版本：`1.0.3`。
- 配置结构版本：`1`。
- 合规规则版本：`2026.08.1`。
- 默认托管与应用内更新 Provider：GitHub Release。
- OSS：已验证的备选 Provider。
- 支持目标：macOS arm64、macOS x64、Windows x64。
- Linux 不在当前发布范围。

当前值变化后，应通过对应源码和发布回执确认，不要只依赖本节的文字快照。
