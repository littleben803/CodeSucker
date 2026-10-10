export function parseCustomExtensions(input: string): string[] {
  const values = input.split(/[,\s;，；]+/).filter(Boolean);
  if (values.length > 100) throw new Error('最多添加 100 个自定义后缀');

  const extensions = new Set<string>();
  for (const value of values) {
    const extension = value.startsWith('.') ? value.slice(1) : value;
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/.test(extension)) {
      throw new Error(`文件后缀格式无效：${value}`);
    }
    extensions.add(extension.toLowerCase());
  }
  return [...extensions];
}
