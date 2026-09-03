# Changelog

本文件记录 CodeDoc 的用户可见变化，格式遵循 Keep a Changelog，版本号遵循 Semantic Versioning。

## [1.0.2] - 2026-09-03

### Added

- 新增 GitHub Release 发布 Provider

### Changed

- 默认安装包托管与应用内更新源切换为 GitHub Release
- macOS 支持通过 GitHub Release 检测、下载并安装新版本

## [1.0.1] - 2026-09-03

### Added

- 新增安装包构建脚本，同时支持 macOS 和 Windows
- 新增安装包发布脚本，同时支持阿里云 OSS 和 GitHub Release

### Changed

- 优化 macOS 版本更新逻辑和交互，支持应用内升级
- 优化关于页面

## [1.0.0] - 2026-09-02

### Added

- 新增 PDF 导出格式
- macOS 新增应用内更新能力；Windows 暂不启用应用内自动更新
- 新增深色和浅色高保真主题设计
- 新增主题管理器，统一管理 UI 元素和界面 Token
- 优化各界面的交互和视觉样式

### Changed

- 产品品牌由 CodeSucker 更新为 CodeDoc Generator（中文名：软著代码整理器）
- 源程序材料按每页 60 行分页，前后各 30 页时截取前 1800 行与后 1800 行
- PDF / DOCX 保持宋体 10.5pt，并使用 12pt 固定行距改善页面填充
- 正式发布渠道支持启动版本检查、手动更新入口和运行时外链能力
- 增加维护者基线文档及自动门禁，防止失效更新渠道被重新带入运行时代码
- 桌面构建工具链升级到 electron-vite 5、Vite 7 和 React 插件 5
- 本地开发、CI 与发布工具链统一到 Node.js 24.19.0（Krypton LTS），并增加仓库级版本声明

### Security

- 启用 Electron 渲染进程 sandbox，继续保持 context isolation 并关闭 Node.js integration
- 所有主进程 IPC 校验消息来源
- 扫描、处理、导出、配置写入和文件路径请求增加类型、长度、相对路径及会话边界校验
- 项目配置只能写回当前已扫描且目录身份未变化的项目根目录，拖入路径先解析真实目录
- 升级并锁定受影响的构建依赖，完整及运行时依赖审计均清零，并在 CI 和打包工作流中增加依赖审计门禁

## [0.1.0] - 2026-08-25

### Added

- 基于 CodeSucker v0.4.4 代码基线继续维护
- 保留并遵循原项目的 Apache-2.0 许可证及归属要求
