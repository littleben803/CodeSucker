import * as path from 'node:path';
import type { CleanOptions } from '@codedoc/core';

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_PATH_LENGTH = 4096;
const MAX_TEXT_LENGTH = 512;
const MAX_ORDERED_FILES = 100_000;
const MAX_CONFIG_BYTES = 1024 * 1024;

export interface ScanRequest {
  jobId: string;
  scanSessionId: string;
  root: string;
}

export interface ProcessPayload {
  root: string;
  scanSessionId: string;
  orderedRelPaths: string[];
  title: string;
  owner?: string;
  foundedDate?: string;
  clean: CleanOptions;
}

export interface JobRequest<T> {
  jobId: string;
  payload: T;
}

export interface ExportPayload extends ProcessPayload {
  outDir: string;
  formats: { pdf: boolean; docx: boolean; txt: boolean };
  pdfPreviewKey?: string;
}

export interface PdfPreviewRequest {
  documentKey: string;
  scanSessionId: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function identifier(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_IDENTIFIER_LENGTH
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)) throw new Error(`${label} 无效`);
  return value;
}

function absolutePath(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_PATH_LENGTH
    || value.includes('\0') || !path.isAbsolute(value)) throw new Error(`${label} 无效`);
  return path.resolve(value);
}

function optionalText(value: unknown, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH || value.includes('\0')) {
    throw new Error(`${label} 无效`);
  }
  return value;
}

function requiredText(value: unknown, label: string): string {
  const text = optionalText(value, label);
  if (text === undefined || text.trim().length === 0) throw new Error(`${label} 不能为空`);
  return text;
}

function presentText(value: unknown, label: string): string {
  const text = optionalText(value, label);
  if (text === undefined) throw new Error(`${label} 无效`);
  return text;
}

function relativePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_ORDERED_FILES) throw new Error('文件顺序列表无效');
  const result = value.map((item) => {
    if (typeof item !== 'string' || item.length === 0 || item.length > MAX_PATH_LENGTH || item.includes('\0')
      || path.isAbsolute(item) || path.posix.isAbsolute(item) || path.win32.isAbsolute(item)
      || /^[A-Za-z]:/.test(item) || item.split(/[\\/]+/).includes('..')) {
      throw new Error('文件顺序必须只包含项目内相对路径');
    }
    return item;
  });
  if (new Set(result).size !== result.length) throw new Error('文件顺序不能包含重复路径');
  return result;
}

function cleanOptions(value: unknown): CleanOptions {
  if (!isRecord(value)
    || typeof value.removeComments !== 'boolean'
    || typeof value.removeBlankLines !== 'boolean'
    || typeof value.maskSensitive !== 'boolean'
    || typeof value.wrapLongLines !== 'boolean'
    || value.maxLineWidth !== 78
    || value.tabWidth !== 4) throw new Error('清洗参数无效');
  return {
    removeComments: value.removeComments,
    removeBlankLines: value.removeBlankLines,
    maskSensitive: value.maskSensitive,
    wrapLongLines: value.wrapLongLines,
    maxLineWidth: 78,
    tabWidth: 4,
  };
}

function processPayload(value: unknown, requireDocumentMetadata = false): ProcessPayload {
  if (!isRecord(value)) throw new Error('处理请求无效');
  const foundedDate = optionalText(value.foundedDate, '成立日期');
  if (foundedDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(foundedDate)) throw new Error('成立日期无效');
  return {
    root: absolutePath(value.root, '项目目录'),
    scanSessionId: identifier(value.scanSessionId, 'scanSessionId'),
    orderedRelPaths: relativePaths(value.orderedRelPaths),
    // 实时清洗预览允许文档信息暂时为空；只有导出必须具备有效页眉与页脚信息。
    title: requireDocumentMetadata ? requiredText(value.title, '软件全称') : presentText(value.title, '软件全称'),
    owner: requireDocumentMetadata ? requiredText(value.owner, '著作权人名称') : optionalText(value.owner, '著作权人名称'),
    foundedDate,
    clean: cleanOptions(value.clean),
  };
}

export function parseScanRequest(value: unknown): ScanRequest {
  if (!isRecord(value)) throw new Error('扫描请求无效');
  return {
    jobId: identifier(value.jobId, 'jobId'),
    scanSessionId: identifier(value.scanSessionId, 'scanSessionId'),
    root: absolutePath(value.root, '项目目录'),
  };
}

export function parseProcessRequest(value: unknown): JobRequest<ProcessPayload> {
  if (!isRecord(value)) throw new Error('处理请求无效');
  return { jobId: identifier(value.jobId, 'jobId'), payload: processPayload(value.payload) };
}

export function parseExportRequest(value: unknown): JobRequest<ExportPayload> {
  if (!isRecord(value) || !isRecord(value.payload)) throw new Error('导出请求无效');
  const payload = processPayload(value.payload, true);
  const formats = value.payload.formats;
  if (!isRecord(formats) || typeof formats.pdf !== 'boolean'
    || typeof formats.docx !== 'boolean' || typeof formats.txt !== 'boolean'
    || (!formats.pdf && !formats.docx && !formats.txt)) throw new Error('请至少选择一种输出格式');
  const pdfPreviewKey = value.payload.pdfPreviewKey;
  if (formats.pdf && (typeof pdfPreviewKey !== 'string' || !/^[a-f0-9]{64}$/.test(pdfPreviewKey))) {
    throw new Error('请先完成最终 PDF 预览');
  }
  return {
    jobId: identifier(value.jobId, 'jobId'),
    payload: {
      ...payload,
      outDir: absolutePath(value.payload.outDir, '输出目录'),
      formats: { pdf: formats.pdf, docx: formats.docx, txt: formats.txt },
      pdfPreviewKey: formats.pdf ? pdfPreviewKey as string : undefined,
    },
  };
}

export function parsePdfPreviewRequest(value: unknown): PdfPreviewRequest {
  if (!isRecord(value) || typeof value.documentKey !== 'string' || !/^[a-f0-9]{64}$/.test(value.documentKey)) {
    throw new Error('PDF 预览请求无效');
  }
  return {
    documentKey: value.documentKey,
    scanSessionId: identifier(value.scanSessionId, 'scanSessionId'),
  };
}

export function parseJobId(value: unknown): string {
  return identifier(value, 'jobId');
}

export function boundedConfigRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error('项目配置无效');
  let json: string;
  try { json = JSON.stringify(value); } catch { throw new Error('项目配置无法序列化'); }
  if (Buffer.byteLength(json, 'utf8') > MAX_CONFIG_BYTES) throw new Error('项目配置过大');
  return value;
}
