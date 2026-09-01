# CodeDoc 主题设计基线

本目录保存已经由产品负责人确认的 CodeDoc 界面主题设计稿，供后续主题实现、界面迁移和视觉回归使用。

品牌名称与正式文案仍以 [`docs/BRAND.md`](../../docs/BRAND.md) 为唯一基准；本目录中的图片不是品牌文案源文件。

## 暗黑主题

- [`codedoc-dark-foundations-controls.png`](codedoc-dark-foundations-controls.png)：基础颜色、字体与通用控件状态。
- [`codedoc-dark-business-states.png`](codedoc-dark-business-states.png)：业务组件、页面状态与反馈模式。

## 浅色主题

- [`codedoc-light-foundations-controls.png`](codedoc-light-foundations-controls.png)：最终基础颜色、字体、渐变及通用控件完整状态。
- [`codedoc-light-business-states.png`](codedoc-light-business-states.png)：最终业务组件、页面状态、反馈、弹层、预览和审计模式。

## 实现约束

- 暗黑模式是默认主题。
- 暗黑主题与浅色方案均已实现；两套主题使用同构语义 Token，默认主题仍为暗黑模式。
- 页面和组件必须使用语义化 Theme Token，不得把设计稿色值散落到 JSX/TSX 内联样式中。
- 主题文件不得覆盖既有布局尺寸、字号、控件高度或页面间距；生产 `theme.css` 是 UI 几何基准。
- 高密度列表行使用 `--list-row-*` Token，只保留细边框，不使用面板级投影；阴影仅用于面板、菜单和弹层等需要表达层级的位置。
- 同级次级操作统一消费 `--button-secondary-*` 与 `--control-focus-ring`；业务组件只允许补充尺寸或图标动效，不得覆盖 Hover 描边、背景或焦点环。
- 大面积渐变用于应用背景；内容表面保持低饱和、高对比，避免影响代码、表单和文档预览的可读性。
- 洋红色只用于主操作、选中、焦点和局部环境光，不用于长段正文背景。

## 暗黑主题基准色

| Token | Value |
| --- | --- |
| Canvas | `#090048` |
| Canvas Raised | `#130A35` |
| Surface | `#1A123D` |
| Surface Elevated | `#24164B` |
| Violet | `#681392` |
| Violet Bright | `#8B2BC3` |
| Magenta | `#D31DAC` |
| Focus | `#EF48BE` |
| Text Primary | `#F7F3FF` |
| Text Secondary | `#B9ACD3` |
| Text Disabled | `#756A90` |
| Success | `#5EE68A` |
| Warning | `#FFBF4A` |
| Danger | `#FF6B7A` |
| Info | `#61A8FF` |

具体 CSS 映射以 Renderer 的 `styles/tokens.css`、`styles/themes/dark.css` 和 `styles/components.css` 为准。

## 浅色主题基准色

| Token | Value |
| --- | --- |
| Canvas | `#F5F7FC` |
| Canvas Raised | `#EDF1FA` |
| Surface | `#FBFCFF` |
| Surface Elevated | `#FFFFFF` |
| Violet | `#6F4CCB` |
| Violet Bright | `#8257D8` |
| Magenta | `#C72AA8` |
| Magenta Focus | `#B9289B` |
| Text Primary | `#1D2940` |
| Text Secondary | `#657089` |
| Text Disabled | `#9AA4B6` |
| Border | `#D8DFEB` |
| Success | `#14804A` |
| Warning | `#A96500` |
| Danger | `#C7354B` |
| Info | `#2F6FED` |

浅色背景使用极弱的蓝紫渐变：左上为淡长春花蓝，中上区域带低透明度紫色环境光，向右下过渡到冰川白。主按钮使用 `#6F4CCB → #C72AA8` 渐变；紫色负责导航与选中，洋红负责主操作与焦点，避免大面积粉色造成视觉疲劳。

字体继续使用平台原生字体：macOS 为 System UI / PingFang SC，Windows 为 Segoe UI Variable / Microsoft YaHei UI；字号、字重、行高和 Mono 规则与暗黑主题完全一致。

## 前端统一主题方案

主题系统按三层组织，对应原生 App 中的 Foundation Token、Semantic Color 和 Component Style：

1. `styles/tokens.css`：字体、基础色板、间距、圆角、动效和跨平台字体回退；不直接表达业务语义。
2. `styles/themes/dark.css`：默认暗黑模式的 Canvas、Surface、Text、Border、Accent、状态色、渐变、阴影和语言分类色；浅色实现阶段新增同构的 `styles/themes/light.css`。
3. `styles/themes/light.css`：方案 2 的 Canvas、Surface、Text、Border、Accent、状态色、渐变、阴影和语言分类色映射。
4. `styles/components.css`：按钮、输入框、焦点环、遮罩和表面层级等控件 Token。

Renderer 在 React 挂载前由 `theme-controller.ts` 把主题写入根节点 `data-theme`，避免启动时出现主题闪烁。页面组件只引用语义变量，不直接写十六进制或 `rgb/rgba` 色值；主题切换不修改字号、宽高、间距或布局。浅色实现位于独立的 `styles/themes/light.css`，导入区等业务表面也通过组件语义 Token 取值。
