# Changelog

本文件记录 CodeDoc 的用户可见变化，格式遵循 Keep a Changelog，版本号遵循 Semantic Versioning。

## [1.0.2] - 2026-09-03

### Added

- 增加 Publish Provider: github

### Changed

- 安装包托管切换到 GitHub
- 通过 Git Release 检测版本更新

## [1.0.1] - 2026-09-03

### Added

- 增加打包脚本，同时支持 Mac 和 Windows
- 增加安装包发布脚本，同时支持阿里云 OSS 和 GitHub Release

### Changed

- 优化 macOS 版本更新逻辑和交互，支持应用内升级
- 优化关于页面

## [1.0.0] - 2026-09-02

### Added

- 导出材料新增 pdf 格式
- macOS 增加应用内更新能力（Windows暂不支持，因为我不会 Windows 开发>_<）
- 增加高保真主题设计（支持深色和浅色模式）
- 增加主题管理器，统一管理 UI 元素和界面 Token 
- 优化所有界面交互和视觉样式

### Changed

- 更改程序名，Sucker 总让人想“入”菲菲
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

- 恢复 CodeSucker v0.4.4 基线（最后更新日期：2026-07-31）
- 原项目：github.com/fanbuz/codesucker，已被作者删除不再维护
- 原项目遵循 Apache-2.0 协议，之后的二次开发同样遵循这个协议
