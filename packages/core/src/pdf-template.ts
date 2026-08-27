import type { Page } from './types.ts';

/** 改动 PDF 纸张、字体、边距或页内结构时同步更新，用于使旧预览缓存失效。 */
export const PDF_LAYOUT_VERSION = '2026.08.6' as const;

/** 60 行正文在当前 A4 可用高度内的固定行距，保留少量打印舍入安全空间。 */
export const SOURCE_CODE_LINE_HEIGHT_PT = 12 as const;

export interface PdfTemplateOptions {
  title: string;
  owner?: string;
  fontName: string;
  fontSizePt: number;
}

/**
 * 构造只包含申报文档的静态打印页面。
 * 每个 Page 都对应一个固定 A4 容器，浏览器不参与代码行的自动分页。
 */
export function renderPdfHtml(pages: Page[], options: PdfTemplateOptions): string {
  const title = escapeHtml(options.title);
  const owner = escapeHtml(options.owner?.trim() || '未填写');
  const fontName = escapeCssString(options.fontName);
  const fontSize = finitePositive(options.fontSizePt, 10.5);
  const lineHeight = Math.max(fontSize, SOURCE_CODE_LINE_HEIGHT_PT);
  const pageMarkup = pages.map((page, index) => {
    const lines = page.lines.map((line) => `<div class="code-line">${escapeHtml(line) || '&nbsp;'}</div>`).join('');
    return `<section class="pdf-page${index === pages.length - 1 ? ' pdf-page--last' : ''}">
      <header class="pdf-header"><span class="pdf-title">${title}</span><span class="pdf-page-number">第 ${page.no} 页</span></header>
      <main class="pdf-code">${lines}</main>
      <footer class="pdf-footer"><span class="pdf-owner">${owner}</span></footer>
    </section>`;
  }).join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>${title}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    .pdf-page {
      position: relative;
      width: 210mm;
      /* 略小于物理页高，避开 Chromium 毫米转像素的累积舍入导致跨页碎片。 */
      height: 296mm;
      overflow: hidden;
      padding: 8.4667mm 21.1667mm 12.7mm;
      break-after: page;
      page-break-after: always;
      background: #fff;
    }
    .pdf-page--last { break-after: auto; page-break-after: auto; }
    .pdf-header {
      display: flex;
      height: 10.5833mm;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8mm;
      overflow: hidden;
      border-bottom: 0.2mm solid #8c8c8c;
      padding: 0 0 1.4mm;
      color: #222;
      font-family: "${fontName}", "Songti SC", "STSong", serif;
      font-size: 9pt;
      line-height: 11pt;
    }
    .pdf-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .pdf-page-number { flex: none; }
    .pdf-code {
      overflow: hidden;
      padding-top: 2.1167mm;
      color: #000;
      font-family: "${fontName}", "Songti SC", "STSong", serif;
      font-size: ${fontSize}pt;
      font-variant-ligatures: none;
      line-height: ${lineHeight}pt;
      tab-size: 4;
    }
    .code-line {
      height: ${lineHeight}pt;
      overflow: hidden;
      white-space: pre;
    }
    .pdf-footer {
      position: absolute;
      right: 21.1667mm;
      bottom: 3.2mm;
      left: 21.1667mm;
      overflow: hidden;
      color: #222;
      font-family: "${fontName}", "Songti SC", "STSong", serif;
      font-size: 9pt;
      line-height: 11pt;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>${pageMarkup}</body>
</html>`;
}

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeCssString(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replace(/[\r\n\f]/g, ' ');
}
