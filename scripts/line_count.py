#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
软著源程序行数快速预判工具（ruanzhu-one-stop 配套）
用途：统计项目源码总行数，判断是否超过 3000 行（超过才需"前后各30页"截取），
     并按 50 行/页 估算页数，提交 CodeSucker 前先心里有数。
注意：本脚本只做粗算；最终页数/行数以 CodeSucker 导出与登记机构要求为准。
用法：python line_count.py <项目目录>   （默认当前目录）
"""
import os
import sys

# 常见源代码后缀（与软著申报常用语言对应）
CODE_EXTS = {
    '.java', '.kt', '.py', '.js', '.ts', '.tsx', '.jsx', '.go', '.rs',
    '.c', '.cpp', '.cc', '.h', '.hpp', '.cs', '.swift', '.php', '.rb',
    '.vue', '.html', '.css', '.sql', '.scala', '.m', '.sh', '.bat', '.lua',
}
SKIP_DIRS = {'.git', 'node_modules', 'target', 'build', 'dist', '__pycache__',
             '.idea', '.vscode', '.svn', 'vendor', 'venv', 'bin', 'obj'}


def count_lines(root):
    total = 0
    per_ext = {}
    files = 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in CODE_EXTS:
                continue
            fp = os.path.join(dirpath, fn)
            try:
                with open(fp, 'r', encoding='utf-8', errors='ignore') as f:
                    n = sum(1 for _ in f)
            except Exception:
                continue
            total += n
            per_ext[ext] = per_ext.get(ext, 0) + n
            files += 1
    return total, per_ext, files


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else '.'
    if not os.path.isdir(root):
        print(f'目录不存在: {root}')
        sys.exit(1)
    total, per_ext, files = count_lines(root)
    pages = (total + 49) // 50
    print(f'扫描目录 : {os.path.abspath(root)}')
    print(f'源码文件数: {files}')
    print(f'代码总行数: {total:,} 行')
    print(f'估算页数(50行/页): {pages} 页')
    if total > 3000:
        print('判定     : 超过 3000 行 → 需按"前30页+后30页"截取（CodeSucker 自动处理）')
    else:
        print('判定     : 不足 3000 行 → 按规则提交全部源代码（无需硬凑 60 页）')
    print('--- 按后缀分布 ---')
    for ext, n in sorted(per_ext.items(), key=lambda x: -x[1]):
        print(f'  {ext:<8} {n:>8,} 行')


if __name__ == '__main__':
    main()
