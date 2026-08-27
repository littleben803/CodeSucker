export interface BuiltInScanExcludeRuleHelp {
  detail: string;
  reason: string;
}

export const BUILT_IN_SCAN_EXCLUDE_RULE_HELP = {
  node_modules: {
    detail: '任意层级的 Node.js 依赖目录',
    reason: '包含大量第三方 JS/TS 代码，不属于项目原创源码。',
  },
  dist: {
    detail: '任意层级的发布产物目录',
    reason: '通常存放打包后的文件，内容由源码自动生成。',
  },
  build: {
    detail: '任意层级的构建输出目录',
    reason: '通常包含编译结果和临时文件，不是直接编写的源码。',
  },
  out: {
    detail: '任意层级的输出目录',
    reason: '常用于保存编译或转换后的结果，容易与原始源码重复。',
  },
  vendor: {
    detail: '任意层级的第三方依赖目录',
    reason: '通常由包管理工具下载外部代码，不属于项目原创源码。',
  },
  target: {
    detail: '任意层级的构建目标目录',
    reason: 'Rust、Maven 等工具会在这里生成编译产物和缓存。',
  },
  '.git': {
    detail: 'Git 版本管理数据目录',
    reason: '保存提交记录、索引和仓库内部数据，不是业务源码。',
  },
  '.gradle': {
    detail: 'Gradle 缓存与任务状态目录',
    reason: '由 Gradle 自动维护，不会排除项目中的 build.gradle 文件。',
  },
  '.idea': {
    detail: 'JetBrains 系列 IDE 配置目录',
    reason: '保存 Android Studio、IntelliJ IDEA 等编辑器配置，不是产品源码。',
  },
  '.vscode': {
    detail: 'VS Code 工作区配置目录',
    reason: '主要保存编辑器设置、任务和调试配置，不是业务源码。',
  },
  '.next': {
    detail: 'Next.js 构建与缓存目录',
    reason: '由 Next.js 根据源码自动生成，可能包含大量重复代码。',
  },
  '.nuxt': {
    detail: 'Nuxt 构建与生成目录',
    reason: '由 Nuxt 根据源码自动生成，不属于直接编写的项目源码。',
  },
  __pycache__: {
    detail: '任意层级的 Python 缓存目录',
    reason: '主要保存 Python 自动生成的字节码缓存。',
  },
  venv: {
    detail: '任意层级的 Python 虚拟环境',
    reason: '包含 Python 运行环境和第三方依赖，通常体积较大。',
  },
  '.venv': {
    detail: '任意层级的隐藏 Python 虚拟环境',
    reason: '作用与 venv 相同，包含运行环境和第三方依赖。',
  },
  coverage: {
    detail: '任意层级的测试覆盖率报告目录',
    reason: '包含自动生成的 HTML、CSS 和 JS 报告，不是项目源码。',
  },
  Pods: {
    detail: '任意层级的 CocoaPods 依赖目录',
    reason: '包含下载的第三方 iOS/macOS 依赖源码，不属于项目原创代码。',
  },
  '*.min.js': {
    detail: '任意层级的压缩 JavaScript 文件',
    reason: '压缩代码难以阅读，通常由原始 JavaScript 自动生成。',
  },
  '*.min.css': {
    detail: '任意层级的压缩 CSS 文件',
    reason: '压缩样式难以阅读，通常由原始 CSS 自动生成。',
  },
  '*.lock': {
    detail: '任意层级的依赖版本锁定文件',
    reason: '用于固定第三方依赖版本，不属于业务实现源码。',
  },
} as const satisfies Record<string, BuiltInScanExcludeRuleHelp>;

export function getBuiltInScanExcludeRuleHelp(rule: string): BuiltInScanExcludeRuleHelp | null {
  return Object.prototype.hasOwnProperty.call(BUILT_IN_SCAN_EXCLUDE_RULE_HELP, rule)
    ? BUILT_IN_SCAN_EXCLUDE_RULE_HELP[rule as keyof typeof BUILT_IN_SCAN_EXCLUDE_RULE_HELP]
    : null;
}
