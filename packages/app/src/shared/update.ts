export type UpdateChannel = 'stable' | 'beta';
export type UpdatePlatform = 'mac' | 'win';
export type UpdateArch = 'arm64' | 'x64';

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

export const UPDATE_BASE_URL = 'https://download.ideaboxapps.com/codedoc';

export function updatePlatform(platform: NodeJS.Platform): UpdatePlatform | null {
  if (platform === 'darwin') return 'mac';
  if (platform === 'win32') return 'win';
  return null;
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

export function updateChannelFromArgs(args: readonly string[]): UpdateChannel {
  const value = args.find((arg) => arg.startsWith('--update-channel='))?.split('=', 2)[1];
  return value === 'beta' ? 'beta' : 'stable';
}
