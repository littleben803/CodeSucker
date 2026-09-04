import releaseConfig from '../../../../ops/app-release/release.config.json';

export type UpdateChannel = 'stable' | 'beta';
export type UpdatePlatform = 'mac';
export type UpdateArch = 'arm64' | 'x64';
export type UpdateProvider = 'oss' | 'github';

export interface GenericUpdateFeedConfiguration {
  provider: 'generic';
  url: string;
}

export interface GitHubUpdateFeedConfiguration {
  provider: 'github';
  owner: string;
  repo: string;
  tagNamePrefix: string;
  channel: 'latest' | 'beta';
}

export type UpdateFeedConfiguration = GenericUpdateFeedConfiguration | GitHubUpdateFeedConfiguration;

export type UpdatePhase =
  | 'disabled'
  | 'idle'
  | 'checking'
  | 'available'
  | 'up-to-date'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateProgress {
  percent: number;
  bytesPerSecond: number;
  transferred: number;
  total: number;
}

export type UpdateErrorCode =
  | 'check-failed'
  | 'download-failed'
  | 'download-network-failed'
  | 'download-integrity-failed'
  | 'download-signature-failed'
  | 'download-storage-failed'
  | 'update-service-failed'
  | 'pipeline-busy'
  | 'unsupported';

export interface UpdateState {
  phase: UpdatePhase;
  supported: boolean;
  channel: UpdateChannel;
  currentVersion: string;
  targetVersion?: string;
  releaseDate?: string;
  progress?: UpdateProgress;
  message: string;
  errorCode?: UpdateErrorCode;
}

export function isDownloadUpdateError(errorCode: UpdateErrorCode | undefined): boolean {
  return errorCode?.startsWith('download-') === true || errorCode === 'update-service-failed';
}

export function safeUpdateError(
  error: unknown,
  operation: 'check' | 'download',
): Pick<UpdateState, 'phase' | 'message' | 'errorCode'> {
  const errno = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code ?? '')
    : '';
  const description = `${error instanceof Error ? `${error.name} ${error.message}` : String(error)} ${errno}`.toLowerCase();

  if (operation === 'check') {
    const networkFailure = /net::err_|\betimedout\b|\beconnreset\b|\beconnrefused\b|\benotfound\b|\beai_again\b|network|timeout/.test(description);
    return {
      phase: 'error',
      errorCode: 'check-failed',
      message: networkFailure ? '无法连接更新服务，请检查网络后重试。' : '检查更新失败，请稍后重试。',
    };
  }

  if (/sha-?512|checksum|digest|integrity|hash mismatch|blockmap|differential/.test(description)) {
    return {
      phase: 'error',
      errorCode: 'download-integrity-failed',
      message: '更新包完整性校验失败，请重新下载。',
    };
  }
  if (/signature|code ?sign|codesign|not signed|could not be verified/.test(description)) {
    return {
      phase: 'error',
      errorCode: 'download-signature-failed',
      message: '更新包签名验证失败，请暂时不要安装并联系维护人员。',
    };
  }
  if (/\benospc\b|no space|\beacces\b|\beperm\b|permission denied|read-only/.test(description)) {
    return {
      phase: 'error',
      errorCode: 'download-storage-failed',
      message: '无法保存更新包，请检查磁盘空间和文件权限后重试。',
    };
  }
  if (/squirrel|shipit|proxy server|127\.0\.0\.1|\beaddrinuse\b/.test(description)) {
    return {
      phase: 'error',
      errorCode: 'update-service-failed',
      message: '更新服务启动失败，请重新打开应用后重试。',
    };
  }
  if (/net::err_|\betimedout\b|\beconnreset\b|\beconnrefused\b|\benotfound\b|\beai_again\b|network|timeout/.test(description)) {
    return {
      phase: 'error',
      errorCode: 'download-network-failed',
      message: '更新包下载失败，请检查网络后重试。',
    };
  }
  return {
    phase: 'error',
    errorCode: 'download-failed',
    message: '更新失败，请重新打开应用后重试。',
  };
}

export function hasAvailableUpdate(state: UpdateState | null): boolean {
  return Boolean(state?.supported && state.targetVersion && state.phase !== 'up-to-date');
}

export const UPDATE_PROVIDER = releaseConfig.activeProvider as UpdateProvider;
export const UPDATE_BASE_URL = releaseConfig.providers.oss.updateBaseUrl;

export function supportsAppUpdates(platform: NodeJS.Platform): boolean {
  return platform === 'darwin';
}

export function updatePlatform(platform: NodeJS.Platform): UpdatePlatform | null {
  return supportsAppUpdates(platform) ? 'mac' : null;
}

export function updateArch(arch: string): UpdateArch | null {
  if (arch === 'arm64' || arch === 'x64') return arch;
  return null;
}

export function updateFeedUrl(channel: UpdateChannel, platform: NodeJS.Platform, arch: string): string | null {
  const targetPlatform = updatePlatform(platform);
  const targetArch = updateArch(arch);
  if (!targetPlatform || !targetArch) return null;
  return `${UPDATE_BASE_URL}/${channel}/${targetPlatform}/${targetArch}`;
}

export function updateFeedConfiguration(
  channel: UpdateChannel,
  platform: NodeJS.Platform,
  arch: string,
  provider: UpdateProvider = UPDATE_PROVIDER,
): UpdateFeedConfiguration | null {
  if (!supportsAppUpdates(platform) || !updateArch(arch)) return null;
  if (provider === 'oss') {
    const url = updateFeedUrl(channel, platform, arch);
    if (!url || !releaseConfig.providers.oss.enabled) return null;
    return { provider: 'generic', url };
  }
  const github = releaseConfig.providers.github;
  if (!github.enabled || !github.implemented || !github.appUpdateEnabled) return null;
  return {
    provider: 'github',
    owner: github.owner,
    repo: github.repo,
    tagNamePrefix: github.tagPrefix,
    channel: channel === 'beta' ? 'beta' : 'latest',
  };
}

export function updateChannelFromArgs(args: readonly string[], appVersion = ''): UpdateChannel {
  const value = args.find((arg) => arg.startsWith('--update-channel='))?.split('=', 2)[1];
  if (value !== undefined) return value === 'beta' ? 'beta' : 'stable';
  return /-beta(?:[.-]|$)/i.test(appVersion) ? 'beta' : 'stable';
}
