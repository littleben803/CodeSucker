import { ipcMain, type WebContents } from 'electron';
import {
  autoUpdater, type AppUpdater, type ProgressInfo, type UpdateInfo,
} from 'electron-updater';
import {
  updateChannelFromArgs, updateFeedUrl, type UpdateChannel, type UpdateState,
} from '../shared/update';

type StateListener = (state: UpdateState) => void;

export interface UpdateServiceOptions {
  appVersion: string;
  isPackaged: boolean;
  platform?: NodeJS.Platform;
  arch?: string;
  argv?: readonly string[];
  updater?: AppUpdater;
  canInstall: () => boolean;
  broadcast: StateListener;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value * 10) / 10));
}

function safeUpdateError(error: unknown, operation: 'check' | 'download'): Pick<UpdateState, 'phase' | 'message' | 'errorCode'> {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (message.includes('net::') || message.includes('timeout') || message.includes('network')) {
    return {
      phase: 'error',
      errorCode: operation === 'check' ? 'check-failed' : 'download-failed',
      message: '网络连接失败，请稍后重试。',
    };
  }
  return {
    phase: 'error',
    errorCode: operation === 'check' ? 'check-failed' : 'download-failed',
    message: operation === 'check' ? '检查更新失败，请稍后重试。' : '下载更新失败，请稍后重试。',
  };
}

export class UpdateService {
  private readonly updater: AppUpdater;
  private readonly options: UpdateServiceOptions;
  private readonly channel: UpdateChannel;
  private readonly feedUrl: string | null;
  private automaticCheckScheduled = false;
  private currentOperation: 'check' | 'download' | null = null;
  private state: UpdateState;

  constructor(options: UpdateServiceOptions) {
    this.options = options;
    this.updater = options.updater ?? autoUpdater;
    this.channel = updateChannelFromArgs(options.argv ?? process.argv);
    this.feedUrl = updateFeedUrl(this.channel, options.platform ?? process.platform, options.arch ?? process.arch);
    const supported = options.isPackaged && this.feedUrl !== null;
    this.state = {
      phase: supported ? 'idle' : 'disabled',
      supported,
      channel: this.channel,
      currentVersion: options.appVersion,
      message: supported ? '已准备好检查更新。' : '仅 macOS 与 Windows 正式安装版支持应用内更新。',
    };

    if (!supported || !this.feedUrl) return;
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.autoRunAppAfterInstall = true;
    this.updater.allowPrerelease = this.channel === 'beta';
    this.updater.allowDowngrade = false;
    this.updater.logger = null;
    this.updater.setFeedURL({ provider: 'generic', url: this.feedUrl });
    this.registerUpdaterEvents();
  }

  getState(): UpdateState {
    return structuredClone(this.state);
  }

  async check(): Promise<UpdateState> {
    if (!this.state.supported) return this.getState();
    if (this.currentOperation) return this.getState();
    this.currentOperation = 'check';
    this.setState({
      phase: 'checking', message: '正在检查更新…', progress: undefined, errorCode: undefined,
    });
    try {
      await this.updater.checkForUpdates();
    } catch (error) {
      this.setState(safeUpdateError(error, 'check'));
    } finally {
      this.currentOperation = null;
    }
    return this.getState();
  }

  async download(): Promise<UpdateState> {
    const canRetry = this.state.phase === 'error'
      && this.state.errorCode === 'download-failed'
      && Boolean(this.state.targetVersion);
    if ((this.state.phase !== 'available' && !canRetry) || this.currentOperation) return this.getState();
    this.currentOperation = 'download';
    this.setState({ phase: 'downloading', message: '正在下载更新…', errorCode: undefined });
    try {
      await this.updater.downloadUpdate();
    } catch (error) {
      this.setState(safeUpdateError(error, 'download'));
    } finally {
      this.currentOperation = null;
    }
    return this.getState();
  }

  install(): UpdateState {
    if (this.state.phase !== 'downloaded') return this.getState();
    if (!this.options.canInstall()) {
      this.setState({
        phase: 'downloaded',
        errorCode: 'pipeline-busy',
        message: '请先等待当前扫描、处理或导出任务结束，再重启安装。',
      });
      return this.getState();
    }
    this.setState({ phase: 'installing', message: '正在退出并安装更新…', errorCode: undefined });
    this.updater.quitAndInstall(false, true);
    return this.getState();
  }

  scheduleAutomaticCheck(delayMs = 12_000, jitterMs = 6_000): void {
    if (!this.state.supported || this.automaticCheckScheduled) return;
    this.automaticCheckScheduled = true;
    const jitter = jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0;
    setTimeout(() => { void this.check(); }, delayMs + jitter).unref();
  }

  private registerUpdaterEvents(): void {
    this.updater.on('checking-for-update', () => {
      this.setState({ phase: 'checking', message: '正在检查更新…', errorCode: undefined });
    });
    this.updater.on('update-available', (info: UpdateInfo) => {
      this.setState({
        phase: 'available',
        targetVersion: info.version,
        releaseDate: info.releaseDate,
        progress: undefined,
        errorCode: undefined,
        message: `发现新版本 v${info.version}。`,
      });
    });
    this.updater.on('update-not-available', () => {
      this.setState({
        phase: 'up-to-date',
        targetVersion: undefined,
        releaseDate: undefined,
        progress: undefined,
        errorCode: undefined,
        message: '当前已是最新版本。',
      });
    });
    this.updater.on('download-progress', (progress: ProgressInfo) => {
      const percent = clampPercent(progress.percent);
      this.setState({
        phase: 'downloading',
        progress: {
          percent,
          bytesPerSecond: progress.bytesPerSecond,
          transferred: progress.transferred,
          total: progress.total,
        },
        message: `正在下载更新… ${percent}%`,
      });
    });
    this.updater.on('update-downloaded', (info: UpdateInfo) => {
      this.setState({
        phase: 'downloaded',
        targetVersion: info.version,
        releaseDate: info.releaseDate,
        progress: this.state.progress ? { ...this.state.progress, percent: 100 } : undefined,
        errorCode: undefined,
        message: `v${info.version} 已下载，可重启安装。`,
      });
    });
    this.updater.on('error', (error: Error) => {
      this.setState(safeUpdateError(error, this.currentOperation === 'download' ? 'download' : 'check'));
    });
  }

  private setState(patch: Partial<UpdateState>): void {
    this.state = { ...this.state, ...patch };
    this.options.broadcast(this.getState());
  }
}

export function registerUpdateIpc(
  service: UpdateService,
  isTrustedSender: (sender: WebContents) => boolean,
): void {
  const handle = (channel: string, action: () => unknown) => {
    ipcMain.handle(channel, (event) => {
      if (!isTrustedSender(event.sender)) throw new Error('拒绝来自非主窗口的请求');
      return action();
    });
  };
  handle('update:getState', () => service.getState());
  handle('update:check', () => service.check());
  handle('update:download', () => service.download());
  handle('update:install', () => service.install());
}
