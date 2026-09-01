export const THEME_MODES = ['dark', 'light'] as const;
export type ThemeMode = (typeof THEME_MODES)[number];

export const DEFAULT_THEME: ThemeMode = 'dark';

export function applyTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = theme;

  // 兼容仍在分阶段迁移的 body.dark 页面级选择器。
  document.body.classList.toggle('dark', theme === 'dark');
}
