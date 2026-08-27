import { BrowserWindow } from 'electron';
import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  PDF_LAYOUT_VERSION, renderPdfHtml, type Page, type PdfTemplateOptions,
} from '@codedoc/core';

export interface PdfDocument {
  pages: Page[];
  options: PdfTemplateOptions;
}

/** 内容与排版共同决定缓存键；相同键可以安全复用同一份最终 PDF Buffer。 */
export function pdfDocumentKey(document: PdfDocument): string {
  const hash = createHash('sha256');
  hash.update(PDF_LAYOUT_VERSION).update('\0');
  hash.update(document.options.title).update('\0');
  hash.update(document.options.owner ?? '').update('\0');
  hash.update(document.options.fontName).update('\0');
  hash.update(String(document.options.fontSizePt)).update('\0');
  for (const page of document.pages) {
    hash.update(String(page.no)).update('\0');
    for (const line of page.lines) hash.update(String(Buffer.byteLength(line))).update(':').update(line).update('\0');
  }
  return hash.digest('hex');
}

/** 复用一个隐藏 Chromium 页面串行打印，避免重复启动渲染进程。 */
export class PdfRenderer {
  private window: BrowserWindow | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly cache = new Map<string, Buffer>();
  private cacheVersion = 0;

  render(key: string, document: PdfDocument): Promise<Buffer> {
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);

    const version = this.cacheVersion;
    const task = this.queue.then(async () => {
      const existing = this.cache.get(key);
      if (existing) return existing;
      const generated = await this.renderNow(document);
      if (version === this.cacheVersion) {
        this.cache.set(key, generated);
        while (this.cache.size > 2) this.cache.delete(this.cache.keys().next().value as string);
      }
      return generated;
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  clearCache(): void {
    this.cacheVersion++;
    this.cache.clear();
  }

  async close(): Promise<void> {
    await this.queue;
    this.cacheVersion++;
    this.cache.clear();
    const current = this.window;
    this.window = null;
    if (current && !current.isDestroyed()) current.destroy();
  }

  private async renderNow(document: PdfDocument): Promise<Buffer> {
    const window = this.ensureWindow();
    const html = renderPdfHtml(document.pages, document.options);
    await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await window.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true);
    return window.webContents.printToPDF({
      pageSize: 'A4',
      landscape: false,
      displayHeaderFooter: false,
      printBackground: true,
      preferCSSPageSize: true,
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
    });
  }

  private ensureWindow(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;
    const created = new BrowserWindow({
      width: 794,
      height: 1123,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    created.on('closed', () => {
      if (this.window === created) this.window = null;
    });
    this.window = created;
    return created;
  }
}

export async function writePdfAtomic(buffer: Buffer, outDir: string, title: string): Promise<string> {
  await fs.promises.mkdir(outDir, { recursive: true });
  const file = path.join(outDir, `源程序_${sanitize(title)}.pdf`);
  const temporary = path.join(outDir, `.${path.basename(file)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    await fs.promises.writeFile(temporary, buffer, { mode: 0o600 });
    try {
      await fs.promises.rename(temporary, file);
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : '';
      if (code !== 'EEXIST' && code !== 'EPERM') throw error;
      await fs.promises.unlink(file).catch((unlinkError: NodeJS.ErrnoException) => {
        if (unlinkError.code !== 'ENOENT') throw unlinkError;
      });
      await fs.promises.rename(temporary, file);
    }
    return file;
  } catch (error) {
    await fs.promises.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

function sanitize(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '未命名';
}
