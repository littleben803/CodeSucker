import { app } from 'electron';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { Page } from '@codedoc/core';
import { PdfRenderer, pdfDocumentKey, writePdfAtomic } from '../src/main/pdf-renderer.ts';

const outputDirectory = process.env.CODEDOC_PDF_SMOKE_OUTPUT;
if (!outputDirectory || !path.isAbsolute(outputDirectory)) throw new Error('CODEDOC_PDF_SMOKE_OUTPUT 必须是绝对路径');

const pages: Page[] = Array.from({ length: 60 }, (_, pageIndex) => ({
  no: pageIndex + 1,
  startFile: `src/module-${pageIndex + 1}.ts`,
  endFile: `src/module-${pageIndex + 1}.ts`,
  lines: Array.from({ length: 60 }, (_, lineIndex) => {
    const number = pageIndex * 60 + lineIndex + 1;
    if (lineIndex === 0) return `// 第 ${pageIndex + 1} 页：中文、English、<tag> & special`;
    return `export const line${number} = "软著 PDF 本地渲染 ${String(number).padStart(4, '0')}";`;
  }),
}));

void app.whenReady().then(async () => {
  const renderer = new PdfRenderer();
  try {
    const document = {
      pages,
      options: { title: 'PDF渲染验收系统V1.0', owner: '某某科技有限公司', fontName: 'SimSun', fontSizePt: 10.5 },
    };
    const key = pdfDocumentKey(document);
    const otherOwnerKey = pdfDocumentKey({
      ...document,
      options: { ...document.options, owner: '另一著作权人' },
    });
    if (key === otherOwnerKey) throw new Error('著作权人变化后 PDF 缓存键未失效');
    const first = await renderer.render(key, document);
    const second = await renderer.render(key, document);
    if (!first.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('输出不是有效 PDF 文件头');
    if (!first.equals(second)) throw new Error('相同内容未复用同一 PDF Buffer');
    const file = await writePdfAtomic(first, outputDirectory, document.options.title);
    process.stdout.write(`${JSON.stringify({
      file,
      bytes: first.length,
      pages: pages.length,
      sha256: createHash('sha256').update(first).digest('hex'),
      cacheIdentical: true,
    })}\n`);
  } finally {
    await renderer.close();
    app.quit();
  }
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  app.exit(1);
});
