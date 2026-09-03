# CodeDoc 品牌基准

本文是 CodeDoc 产品品牌名称、标准文案和使用边界的唯一基准。品牌文案发生变化时，应先更新并确认本文，再安排代码、界面、安装包和外部资料的迁移。

## 已确认品牌信息

| 项目 | 标准内容 |
| --- | --- |
| 中文正式名 | 软著代码整理器 |
| 英文正式名 | CodeDoc Generator |
| 英文简称 | CodeDoc |
| 中文副标题 | 一键生成软著代码审核材料 |
| 英文副标题 | Generate source code documents for software copyright registration. |
| 确认状态 | 产品经理最终确认 |
| 确认日期 | 2026-08-27 |

## 标准写法

- 中文产品名必须写作“软著代码整理器”。
- 英文完整产品名必须写作“CodeDoc Generator”。
- 空间有限或品牌已在上下文中明确时，可以使用英文简称“CodeDoc”。
- `CodeDoc` 中的 `C` 和 `D` 必须大写；不要写成 `Codedoc`、`Code Doc`、`CODEDOC` 或 `codeDoc`。
- 中文副标题必须写作“一键生成软著代码审核材料”。
- 英文副标题必须保留完整句子和句末句点：`Generate source code documents for software copyright registration.`

推荐组合：

```text
软著代码整理器
一键生成软著代码审核材料
```

```text
CodeDoc Generator
Generate source code documents for software copyright registration.
```

需要中英文同时出现时，推荐使用：

```text
软著代码整理器 · CodeDoc
```

## 产品定义

CodeDoc 是一款本地优先的桌面工具，用于把用户主动选择的软件项目源码整理成软件著作权登记所需的源程序鉴别材料准备稿。

产品覆盖以下核心流程：

1. 扫描用户主动选择的本地代码项目。
2. 筛选需要纳入材料的文件并调整顺序。
3. 清洗代码、处理排版并对敏感信息进行脱敏。
4. 按内置规则截取和分页，生成预览。
5. 检查页数、行数、页眉、署名和首尾边界等风险。
6. 导出 PDF / docx / txt 材料准备稿。

产品功能应保持完全离线，扫描、清洗、脱敏、排版、校验和导出均在本机完成，用户源代码不得离开本机。

## 对外表述边界

可以使用：

- 帮助整理软件著作权源程序鉴别材料。
- 一键生成软著代码审核材料。
- 减少人工排版、检查和整理工作。
- 导出结果是提交前的材料准备稿。
- 最终要求以登记机构的最新规定为准。

不得使用：

- 官方认证或官方指定工具。
- 保证审核通过、百分之百通过或永不补正。
- 无需复核即可直接提交。
- 自动完成软件著作权申请或替代登记机构审查。
- 法律意见、法律保证或专业法律建议。

## 当前迁移状态

截至 2026-09-03，应用层、技术标识和仓库内品牌资产已经统一：

- macOS 与 Windows 安装后的用户可见名称使用“软著代码整理器”。
- Electron `productName`、可执行文件、应用包和安装包文件名继续使用 `CodeDoc`，用于维持升级兼容和发布脚本稳定。
- App ID 使用 `com.ideaboxapps.codedoc`。
- npm workspace 使用 `@codedoc/app` 和 `@codedoc/core`。
- 项目配置文件使用 `.codedoc.json`。
- Preload API 使用 `window.codedoc`。
- 标题栏使用 `CodeDoc / 软著代码整理器`，关于页使用 `CodeDoc Generator`。
- 设计原型使用 `design/prototype/CodeDoc.dc.html`。
- 旧品牌截图和旧构建产物已经移出当前工程。
- 正式图标采用紫蓝色代码装订册方案；`design/icon/codedoc-icon-source.png` 是仓库内唯一的 1024 × 1024 透明 PNG 品牌母图。
- macOS 使用 `packages/app/build/icon.icns`，Windows 使用 `packages/app/build/icon.ico`。
- 官网、README 和设计文档直接使用同一品牌母图；不得在 `docs/brand/` 或其他目录维护内容相同的 Logo 副本。

正式发布截图待应用界面完成验收后重新制作。仓库目录和远程仓库本轮不改名，后续迁移到新 Git 仓库时单独处理。

除根目录 `NOTICE` 为履行 Apache-2.0 归属义务而保留的历史声明外，当前工程源码、文档和文件名不再使用迁移前的品牌标识。

## 许可证与归属

项目继续采用 Apache-2.0。再分发时必须附带 `LICENSE`、`NOTICE` 和适用的第三方许可证，并按许可证要求标明修改。品牌文档不替代法律归属文件；需要保留的归属信息以根目录 `NOTICE` 为准。

## 待后续确认

- CodeDoc 正式发布截图。
- 新 Git 仓库的名称、地址和干净代码迁移方案。
- 正式发布主体、签名、公证、下载渠道和更新地址。

以上项目必须分别立项、确认边界并完成验证，不得从本品牌文档推导出默认修改授权。
