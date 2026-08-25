import * as fs from 'node:fs';
import * as path from 'node:path';

export interface DroppedPathResult {
  path: string | null;
  error: string | null;
}

export async function validateDroppedDirectory(inputPath: unknown): Promise<DroppedPathResult> {
  if (typeof inputPath !== 'string' || inputPath.length === 0 || inputPath.length > 4096 || inputPath.includes('\0')) {
    return { path: null, error: '无法读取拖入项目的本地路径，请改用“点击选择”' };
  }
  if (!path.isAbsolute(inputPath)) return { path: null, error: '拖入项目路径无效，请改用“点击选择”' };

  try {
    const realPath = await fs.promises.realpath(inputPath);
    const stat = await fs.promises.stat(realPath);
    if (!stat.isDirectory()) return { path: null, error: '请拖入项目文件夹，而不是单个文件' };
    return { path: realPath, error: null };
  } catch {
    return { path: null, error: '无法访问拖入的文件夹，请检查权限后重试' };
  }
}
