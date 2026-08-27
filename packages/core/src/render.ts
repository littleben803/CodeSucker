import {
  AlignmentType, Document, Footer, Header, LineRuleType, Packer, PageNumber,
  Paragraph, TabStopPosition, TabStopType, TextRun,
} from 'docx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SOURCE_CODE_LINE_HEIGHT_PT } from './pdf-template.ts';
import type { Page } from './types.ts';

export interface RenderOptions {
  title: string;
  owner?: string;
  fontName: string; // 宋体
  fontSizePt: number; // 10.5
  outDir: string;
  baseName?: string;
}

/**
 * 生成 docx：
 * - 页眉左侧软件名称+版本号，右侧「第 X 页」自动页码
 * - 每行一个段落，固定 12pt 行距（Exactly），字体宋体 10.5pt
 * - 每页 linesPerPage 行后显式分页（pageBreakBefore），不依赖排版凑页
 */
export async function renderDocx(pages: Page[], opts: RenderOptions): Promise<string> {
  const sizeHalfPt = Math.round(opts.fontSizePt * 2);
  const lineTwips = SOURCE_CODE_LINE_HEIGHT_PT * 20;
  const font = { name: opts.fontName, eastAsia: opts.fontName } as const;
  const owner = opts.owner?.trim() || '未填写';

  const children: Paragraph[] = [];
  pages.forEach((page, pi) => {
    page.lines.forEach((line, li) => {
      children.push(new Paragraph({
        pageBreakBefore: pi > 0 && li === 0,
        spacing: { line: lineTwips, lineRule: LineRuleType.EXACT, before: 0, after: 0 },
        children: [new TextRun({ text: line === '' ? ' ' : line, font, size: sizeHalfPt })],
      }));
    });
  });

  const doc = new Document({
    styles: { default: { document: { run: { font, size: sizeHalfPt } } } },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1080, bottom: 720, left: 1200, right: 1200, header: 480, footer: 360 },
        },
      },
      headers: {
        default: new Header({
          children: [new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [
              new TextRun({ text: opts.title, font, size: 18 }),
              new TextRun({ children: ['\t'], font, size: 18 }),
              new TextRun({ text: '第 ', font, size: 18 }),
              new TextRun({ children: [PageNumber.CURRENT], font, size: 18 }),
              new TextRun({ text: ' 页', font, size: 18 }),
            ],
          })],
        }),
      },
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [new TextRun({ text: owner, font, size: 18 })],
          })],
        }),
      },
      children,
    }],
  });

  const buf = await Packer.toBuffer(doc);
  fs.mkdirSync(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, `${opts.baseName ?? '源程序_' + sanitize(opts.title)}.docx`);
  fs.writeFileSync(file, buf);
  return file;
}

export function renderTxt(pages: Page[], opts: RenderOptions): string {
  fs.mkdirSync(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, `${opts.baseName ?? '源程序_' + sanitize(opts.title)}.txt`);
  const text = pages.map((p) => p.lines.join('\n')).join('\n');
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

export async function renderTxtAsync(pages: Page[], opts: RenderOptions): Promise<string> {
  await fs.promises.mkdir(opts.outDir, { recursive: true });
  const file = path.join(opts.outDir, `${opts.baseName ?? '源程序_' + sanitize(opts.title)}.txt`);
  const text = pages.map((p) => p.lines.join('\n')).join('\n');
  await fs.promises.writeFile(file, text, 'utf8');
  return file;
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '未命名';
}
