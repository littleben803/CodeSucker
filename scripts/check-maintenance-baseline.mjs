import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const runtimeRoot = path.resolve('packages/app/src');
const sourceExtensions = new Set(['.ts', '.tsx']);
const forbiddenRuntimeFragments = ['shell:openExternal'];
const approvedUpdateFragments = new Map([
  ['update:check', new Set([
    'packages/app/src/main/update-service.ts',
    'packages/app/src/preload/index.ts',
  ])],
  ['checkForUpdates(', new Set([
    'packages/app/src/main/update-service.ts',
    'packages/app/src/renderer/src/screens/Settings.tsx',
  ])],
]);

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
  const relativeFile = path.relative(process.cwd(), file);
  for (const fragment of forbiddenRuntimeFragments) {
    if (source.includes(fragment)) violations.push(`${relativeFile}: ${fragment}`);
  }
  for (const [fragment, allowedFiles] of approvedUpdateFragments) {
    if (source.includes(fragment) && !allowedFiles.has(relativeFile)) {
      violations.push(`${relativeFile}: 未经批准的 ${fragment}`);
    }
  }
}

if (violations.length > 0) {
  console.error('维护基线检查失败：运行时代码包含未经批准的更新渠道或外链入口');
  for (const violation of violations) console.error(`- ${violation}`);
  process.exit(1);
}

console.log('✅ 维护基线检查通过：更新入口仅存在于批准的受控路径，且未开放外部链接 IPC');
