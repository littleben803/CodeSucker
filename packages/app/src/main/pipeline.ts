import { app, dialog, ipcMain, shell, type IpcMainInvokeEvent, type WebContents } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CONFIG_SCHEMA_VERSION, DEFAULT_EXCLUDES, DEFAULT_EXTENSIONS, RULES_VERSION,
  discoverAsync, processFilesAsync, renderTxtAsync, sortFiles,
} from '@codedoc/core';
import type {
  CleanedFile, CleanOptions, FileCandidate, FileEntry, PipelineProgress, ProjectConfig,
} from '@codedoc/core';
import { JobController, type JobHandle, type JobKind } from './job-controller';
import { assertExportableSelection } from './export-guard';
import { validateDroppedDirectory } from './drop-path';
import {
  boundedConfigRecord, parseExportRequest, parseJobId, parsePdfPreviewRequest, parseProcessRequest, parseScanRequest,
  type ExportPayload, type JobRequest, type ProcessPayload, type ScanRequest,
} from './ipc-validation';
import {
  captureProjectRoot, resolveProjectConfigFile, resolveProjectFile, resolveRecentExportFile, validateProjectRoot,
  type ProjectRootSnapshot,
} from './project-file';
import { recommendedWorkerCount, WorkerPool } from './worker-pool';
import { ScanSessionGuard } from './scan-session';
import {
  loadScanExcludeSnapshot, registerScanExcludesIpc, SCAN_EXCLUDES_CONFIG_NAME,
} from './scan-excludes-config';
import {
  registerRecentProjectsIpc, touchRecentProject, type RecentProjectPatch,
} from './recent-projects';
import { PdfRenderer, pdfDocumentKey, writePdfAtomic, type PdfDocument } from './pdf-renderer';
import type {
  PipelineWorkerRequest, PipelineWorkerResult, PreviewResult, RenderWorkerRequest,
} from './workers/protocol';

interface ScanSnapshot {
  rootSnapshot: ProjectRootSnapshot;
  byRel: Map<string, FileEntry>;
}

/** 当前扫描会话只保存文件元数据，不保存原始源码。 */
const scanSessions = new ScanSessionGuard<ScanSnapshot>();
let lastExportFile: string | null = null;
const jobs = new JobController();
const pdfRenderer = new PdfRenderer();

interface PdfDocumentSnapshot extends PdfDocument {
  key: string;
  root: string;
  scanSessionId: string;
}

const pdfDocuments = new Map<string, PdfDocumentSnapshot>();

function rememberPdfDocument(snapshot: PdfDocumentSnapshot): void {
  pdfDocuments.set(snapshot.key, snapshot);
  while (pdfDocuments.size > 3) pdfDocuments.delete(pdfDocuments.keys().next().value as string);
}

function pdfDocumentFor(pages: PdfDocument['pages'], title: string, owner?: string): PdfDocument {
  return { pages, options: { title, owner: owner?.trim() ?? '', fontName: 'SimSun', fontSizePt: 10.5 } };
}

interface PipelineResources {
  workerCount: number;
  pipeline: WorkerPool<PipelineWorkerRequest, PipelineWorkerResult>;
  render: WorkerPool<RenderWorkerRequest, string>;
}

let resources: PipelineResources | null = null;

function getResources(): PipelineResources {
  if (resources) return resources;
  const workerCount = recommendedWorkerCount();
  resources = {
    workerCount,
    pipeline: new WorkerPool(path.join(__dirname, 'pipeline-worker.js'), workerCount),
    render: new WorkerPool(path.join(__dirname, 'render-worker.js'), 1),
  };
  return resources;
}

export async function shutdownPipeline(): Promise<void> {
  jobs.cancelAll();
  scanSessions.invalidate();
  lastExportFile = null;
  const current = resources;
  resources = null;
  pdfDocuments.clear();
  if (current) await Promise.all([current.pipeline.close(), current.render.close(), pdfRenderer.close()]);
  else await pdfRenderer.close();
}

const recentFile = () => path.join(app.getPath('userData'), 'recent.json');
const scanExcludesFile = () => path.join(app.getPath('userData'), SCAN_EXCLUDES_CONFIG_NAME);

interface VersionMeta {
  appVersion: string;
  configSchemaVersion: number;
  rulesVersion: string;
}

interface JobProgress extends PipelineProgress {
  jobId: string;
  jobKind: JobKind;
  workerCount: number;
}

interface LanguageStat {
  lang: string;
  extensions: string[];
  files: number;
  rawLines: number;
  bytes: number;
}

function versionMeta(): VersionMeta {
  return {
    appVersion: app.getVersion(),
    configSchemaVersion: CONFIG_SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
  };
}

function createProgressReporter(job: JobHandle, sender: WebContents, workerCount: number) {
  let lastSentAt = 0;
  let lastStage: PipelineProgress['stage'] | null = null;
  return (progress: PipelineProgress) => {
    if (!job.isCurrent() || sender.isDestroyed()) return;
    const now = Date.now();
    const stageChanged = progress.stage !== lastStage;
    const completed = progress.total > 0 && progress.completed >= progress.total;
    if (!stageChanged && !completed && now - lastSentAt < 80) return;
    lastSentAt = now;
    lastStage = progress.stage;
    const event: JobProgress = {
      ...progress,
      jobId: job.id,
      jobKind: job.kind,
      workerCount,
    };
    sender.send('project:progress', event);
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function loadProjectConfig(root: string): { config: Record<string, unknown> | null; warning: string | null } {
  const configFile = path.join(root, '.codedoc.json');
  if (!fs.existsSync(configFile)) return { config: null, warning: null };

  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (!isRecord(parsed)) return { config: null, warning: '项目配置格式无效，已忽略 .codedoc.json' };

    const schema = parsed.schemaVersion;
    if (schema === undefined) {
      return { config: parsed, warning: `检测到旧版项目配置，将在下次保存时升级到 schema ${CONFIG_SCHEMA_VERSION}` };
    }
    if (!Number.isInteger(schema) || (schema as number) < 1) {
      return { config: null, warning: '项目配置 schemaVersion 无效，已忽略该配置' };
    }
    if ((schema as number) > CONFIG_SCHEMA_VERSION) {
      return {
        config: null,
        warning: `项目配置来自更新版本（schema ${schema}），当前仅支持 ${CONFIG_SCHEMA_VERSION}，请升级 CodeDoc`,
      };
    }
    return { config: parsed, warning: null };
  } catch {
    return { config: null, warning: '项目配置无法解析，已忽略 .codedoc.json' };
  }
}

function touchRecent(patch: RecentProjectPatch) {
  try { touchRecentProject(recentFile(), patch); } catch { /* 最近记录失败不得中断扫描或导出。 */ }
}

function buildConfig(payload: ProcessPayload): ProjectConfig {
  return {
    root: payload.root,
    title: payload.title,
    owner: payload.owner,
    foundedDate: payload.foundedDate,
    extensions: DEFAULT_EXTENSIONS,
    excludes: DEFAULT_EXCLUDES,
    sortMode: 'manual',
    clean: payload.clean,
    linesPerPage: 60,
    maxPages: 60,
  };
}

function requireCurrentScan(root: string, scanSessionId: string) {
  const scan = scanSessions.require(scanSessionId, root);
  validateProjectRoot(scan.rootSnapshot, root);
  return scan;
}

function orderedEntries(payload: ProcessPayload): FileEntry[] {
  const scan = requireCurrentScan(payload.root, payload.scanSessionId);
  return payload.orderedRelPaths
    .map((relativePath) => scan.byRel.get(relativePath))
    .filter((entry): entry is FileEntry => !!entry);
}

function summarizeLanguages(files: FileEntry[]): LanguageStat[] {
  const grouped = new Map<string, { extensions: Set<string>; files: number; rawLines: number; bytes: number }>();
  for (const file of files) {
    const item = grouped.get(file.lang) ?? { extensions: new Set(), files: 0, rawLines: 0, bytes: 0 };
    item.extensions.add(file.ext || 'OTHER');
    item.files++;
    item.rawLines += file.rawLines;
    item.bytes += file.sizeBytes;
    grouped.set(file.lang || 'OTHER', item);
  }
  return [...grouped.entries()]
    .map(([lang, item]) => ({
      lang,
      extensions: [...item.extensions].sort(),
      files: item.files,
      rawLines: item.rawLines,
      bytes: item.bytes,
    }))
    .sort((a, b) => b.rawLines - a.rawLines || b.files - a.files || a.lang.localeCompare(b.lang));
}

async function scanWithWorkers(
  request: ScanRequest,
  sender: WebContents,
) {
  const job = jobs.start(request.jobId, 'scan');
  // begin 必须早于任何异步扫描工作：从这一刻起旧处理、分页与导出会话均失效。
  const normalizedRoot = path.resolve(request.root);
  scanSessions.begin(request.scanSessionId, normalizedRoot);
  lastExportFile = null;
  pdfDocuments.clear();
  pdfRenderer.clearCache();
  const workerResources = getResources();
  const report = createProgressReporter(job, sender, workerResources.workerCount);
  // 每次扫描只读取一次规则快照，运行中的设置修改留到下次扫描生效。
  const excludeRules = loadScanExcludeSnapshot(scanExcludesFile());
  try {
    const rootSnapshot = captureProjectRoot(request.root);
    const result = await discoverAsync(request.root, DEFAULT_EXTENSIONS, excludeRules, {
      concurrency: workerResources.workerCount * 2,
      signal: job.signal,
      onProgress: report,
      scanFile: async (candidate: FileCandidate, signal) => {
        const scanned = await workerResources.pipeline.run({ type: 'scan', candidate }, signal);
        return scanned as FileEntry | null;
      },
    });
    job.assertCurrent();
    validateProjectRoot(rootSnapshot, request.root);
    scanSessions.commit(request.scanSessionId, normalizedRoot, {
      rootSnapshot,
      byRel: new Map(result.files.map((file) => [file.relPath, file])),
    });
    const entryOrder = sortFiles(result.files, 'entry').map((file) => file.relPath);
    const mtimeOrder = sortFiles(result.files, 'mtime').map((file) => file.relPath);
    if (result.files.length > 0) touchRecent({ name: path.basename(request.root), root: request.root });
    const saved = loadProjectConfig(request.root);
    const langCounts: Record<string, number> = {};
    for (const file of result.files) langCounts[file.lang] = (langCounts[file.lang] ?? 0) + 1;
    return {
      jobId: job.id,
      scanSessionId: request.scanSessionId,
      root: rootSnapshot.inputPath,
      pathSeparator: path.sep === '\\' ? '\\' : '/',
      files: result.files,
      errors: result.errors,
      workerCount: workerResources.workerCount,
      langCounts,
      languageStats: summarizeLanguages(result.files),
      entryOrder,
      mtimeOrder,
      savedConfig: saved.config,
      savedConfigWarning: saved.warning,
    };
  } finally {
    jobs.finish(job.id);
  }
}

async function processWithWorkers(
  entries: FileEntry[],
  payload: ProcessPayload,
  job: JobHandle,
  sender: WebContents,
) {
  const workerResources = getResources();
  const report = createProgressReporter(job, sender, workerResources.workerCount);
  return processFilesAsync(entries, buildConfig(payload), {
    concurrency: workerResources.workerCount * 2,
    signal: job.signal,
    onProgress: report,
    cleanEntry: async (entry, config, signal) => {
      const result = await workerResources.pipeline.run({ type: 'clean', entry, clean: config.clean }, signal);
      return result as CleanedFile;
    },
  });
}

async function previewWithWorker(entry: FileEntry | undefined, clean: CleanOptions, job: JobHandle) {
  if (!entry) return null;
  try {
    const result = await getResources().pipeline.run({ type: 'preview', entry, clean }, job.signal);
    job.assertCurrent();
    return result as PreviewResult;
  } catch (error) {
    if (job.signal.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    return null;
  }
}

export function registerPipelineIpc(isTrustedSender: (sender: WebContents) => boolean) {
  const trustedIpc = {
    handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) {
      ipcMain.handle(channel, (event, ...args) => {
        if (!isTrustedSender(event.sender)) throw new Error('拒绝来自非主窗口的请求');
        return listener(event, ...args);
      });
    },
  };
  const senderOf = (event: unknown) => (event as IpcMainInvokeEvent).sender;

  trustedIpc.handle('dialog:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  trustedIpc.handle('dialog:pickOutDir', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  trustedIpc.handle('path:validateDroppedDirectory', (_event, inputPath) => validateDroppedDirectory(inputPath));

  trustedIpc.handle('project:revealFile', (_event, root, relPath) => {
    shell.showItemInFolder(resolveProjectFile(scanSessions.peek()?.rootSnapshot ?? null, root, relPath));
  });

  trustedIpc.handle('project:revealLatestExport', () => {
    shell.showItemInFolder(resolveRecentExportFile(lastExportFile));
  });

  registerRecentProjectsIpc(trustedIpc, recentFile);
  registerScanExcludesIpc(trustedIpc, scanExcludesFile);
  trustedIpc.handle('project:cancel', (_event, jobId) => jobs.cancel(parseJobId(jobId)));

  trustedIpc.handle('project:scan', (event, request) => scanWithWorkers(parseScanRequest(request), senderOf(event)));

  trustedIpc.handle('project:process', async (event, input) => {
    const request = parseProcessRequest(input);
    const job = jobs.start(request.jobId, 'process');
    try {
      const entries = orderedEntries(request.payload);
      const [result, preview] = await Promise.all([
        processWithWorkers(entries, request.payload, job, senderOf(event)),
        previewWithWorker(entries[0], request.payload.clean, job),
      ]);
      job.assertCurrent();
      requireCurrentScan(request.payload.root, request.payload.scanSessionId);
      const audit = result.errors.length > 0
        ? [{
            status: 'warn' as const,
            name: `${result.errors.length} 个文件处理失败，已跳过`,
            detail: result.errors[0].message,
            location: { file: result.errors[0].file },
            evidence: result.errors.slice(0, 5).map((error) => ({
              location: { file: error.file },
              detail: error.message,
            })),
          }, ...result.auditItems]
        : result.auditItems;
      const pdfDocument = pdfDocumentFor(result.selection.pages, request.payload.title, request.payload.owner);
      const documentKey = pdfDocumentKey(pdfDocument);
      rememberPdfDocument({
        ...pdfDocument,
        key: documentKey,
        root: request.payload.root,
        scanSessionId: request.payload.scanSessionId,
      });
      return {
        jobId: job.id,
        scanSessionId: request.payload.scanSessionId,
        meta: versionMeta(),
        stats: result.stats,
        selection: {
          ...result.selection,
          pages: result.selection.pages.map((page) => ({ ...page })),
        },
        audit,
        errors: result.errors,
        perFile: result.cleaned.map((file) => ({
          relPath: file.entry.relPath,
          name: file.entry.name,
          lines: file.lines.length,
          removedComments: file.removedComments,
          removedBlanks: file.removedBlanks,
          masked: file.maskedCount,
        })),
        preview,
        documentKey,
      };
    } finally {
      jobs.finish(job.id);
    }
  });

  trustedIpc.handle('project:previewPdf', async (_event, input) => {
    const request = parsePdfPreviewRequest(input);
    const document = pdfDocuments.get(request.documentKey);
    if (!document || document.scanSessionId !== request.scanSessionId) throw new Error('PDF 预览已失效，请重新生成分页');
    requireCurrentScan(document.root, document.scanSessionId);
    const data = await pdfRenderer.render(document.key, document);
    return { documentKey: document.key, data: new Uint8Array(data) };
  });

  trustedIpc.handle('project:export', async (event, input) => {
    const request: JobRequest<ExportPayload> = parseExportRequest(input);
    const job = jobs.start(request.jobId, 'export');
    lastExportFile = null;
    const workerResources = getResources();
    const report = createProgressReporter(job, senderOf(event), workerResources.workerCount);
    try {
      const entries = orderedEntries(request.payload);
      const result = await processWithWorkers(entries, request.payload, job, senderOf(event));
      requireCurrentScan(request.payload.root, request.payload.scanSessionId);
      const pages = result.selection.pages;
      assertExportableSelection(result.selection);
      const renderOptions = {
        title: request.payload.title,
        owner: request.payload.owner,
        fontName: 'SimSun',
        fontSizePt: 10.5,
        outDir: request.payload.outDir,
      };
      const pdfDocument = pdfDocumentFor(pages, request.payload.title, request.payload.owner);
      const documentKey = pdfDocumentKey(pdfDocument);
      if (request.payload.formats.pdf && request.payload.pdfPreviewKey !== documentKey) {
        throw new Error('源码或排版已发生变化，请返回上一步重新确认 PDF 预览');
      }
      const formatCount = Number(request.payload.formats.pdf)
        + Number(request.payload.formats.docx) + Number(request.payload.formats.txt);
      let rendered = 0;
      report({ stage: 'rendering', completed: 0, total: formatCount });
      const output: {
        pdf?: string;
        docx?: string;
        txt?: string;
        size: number;
        pages: number;
        lines: number;
        appVersion: string;
        rulesVersion: string;
        errors: typeof result.errors;
      } = {
        size: 0,
        pages: pages.length,
        lines: result.selection.pickedLines,
        appVersion: app.getVersion(),
        rulesVersion: RULES_VERSION,
        errors: result.errors,
      };

      if (request.payload.formats.pdf) {
        const pdf = await pdfRenderer.render(documentKey, pdfDocument);
        job.assertCurrent();
        output.pdf = await writePdfAtomic(pdf, renderOptions.outDir, renderOptions.title);
        job.assertCurrent();
        output.size = (await fs.promises.stat(output.pdf)).size;
        report({ stage: 'rendering', completed: ++rendered, total: formatCount });
      }

      if (request.payload.formats.docx) {
        output.docx = await workerResources.render.run({ pages, options: renderOptions }, job.signal);
        job.assertCurrent();
        if (!output.pdf) output.size = (await fs.promises.stat(output.docx)).size;
        report({ stage: 'rendering', completed: ++rendered, total: formatCount });
      }
      if (request.payload.formats.txt) {
        output.txt = await renderTxtAsync(pages, renderOptions);
        job.assertCurrent();
        if (!output.pdf && !output.docx) output.size = (await fs.promises.stat(output.txt)).size;
        report({ stage: 'rendering', completed: ++rendered, total: formatCount });
      }

      job.assertCurrent();
      requireCurrentScan(request.payload.root, request.payload.scanSessionId);
      const exportedFile = output.pdf ?? output.docx ?? output.txt;
      if (!exportedFile) throw new Error('请至少选择一种输出格式');
      lastExportFile = fs.realpathSync.native(exportedFile);
      touchRecent({
        name: path.basename(request.payload.root),
        root: request.payload.root,
        lastGenerated: new Date().toISOString().slice(0, 10),
        pages: pages.length,
        ok: !result.auditItems.some((item) => item.status === 'fail'),
      });
      return { ...output, scanSessionId: request.payload.scanSessionId };
    } finally {
      jobs.finish(job.id);
    }
  });

  trustedIpc.handle('project:saveConfig', (_event, root, config) => {
    const values = boundedConfigRecord(config);
    const persisted = {
      ...values,
      schemaVersion: CONFIG_SCHEMA_VERSION,
      appVersion: app.getVersion(),
      rulesVersion: RULES_VERSION,
    };
    const configFile = resolveProjectConfigFile(scanSessions.peek()?.rootSnapshot ?? null, root);
    fs.writeFileSync(configFile, `${JSON.stringify(persisted, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    return true;
  });
}
