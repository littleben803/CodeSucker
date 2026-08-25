import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const runtimeRoot = path.resolve('packages/app/src');
const sourceExtensions = new Set(['.ts', '.tsx']);
const forbiddenRuntimeFragments = [
  'api.github.com/repos/fanbuz/codesucker',
  'github.com/fanbuz/codesucker/releases',
  'update:check',
  'checkForUpdates(',
  'shell:openExternal',
];

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  }));
  return nested.flat();
}

const violations = [];
for (const file of await sourceFiles(runtimeRoot)) {
  const source = await readFile(file, 'utf8');
  for (const fragment of forbiddenRuntimeFragments) {
    if (source.includes(fragment)) violations.push(`${path.relative(process.cwd(), file)}: ${fragment}`);
  }
}

if (violations.length > 0) {
  console.error('维护基线检查失败：运行时代码仍包含已停用的更新渠道或外链入口');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('✅ 维护基线检查通过：运行时代码未连接失效更新渠道或外链入口');
