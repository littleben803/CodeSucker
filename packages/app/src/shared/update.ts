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

export interface UpdateState {
  phase: UpdatePhase;
  supported: boolean;
  channel: UpdateChannel;
  currentVersion: string;
  targetVersion?: string;
  releaseDate?: string;
  progress?: UpdateProgress;
  message: string;
  errorCode?: 'check-failed' | 'download-failed' | 'pipeline-busy' | 'unsupported';
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
