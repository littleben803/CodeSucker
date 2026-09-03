#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readTargetRecord } from '../ops/app-release/release-records.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const APP_ROOT = join(REPO_ROOT, 'packages', 'app');
const APP_PACKAGE_PATH = join(APP_ROOT, 'package.json');
const ELECTRON_PACKAGE_PATH = join(REPO_ROOT, 'node_modules', 'electron', 'package.json');
const ELECTRON_CHECKSUMS_PATH = join(REPO_ROOT, 'node_modules', 'electron', 'checksums.json');
const RELEASE_ROOT = join(REPO_ROOT, 'ops', 'app-release');
const DEFAULT_NOTARY_PROFILE = 'ideabox-notary';
const APP_SLUG = 'codedoc';
const APP_NAME = 'CodeDoc';
const BUNDLE_ID = 'com.ideaboxapps.codedoc';
const CODEDOC_ELECTRON_CACHE = process.platform === 'darwin'
  ? join(homedir(), 'Library', 'Caches', 'CodeDoc', 'electron')
  : join(homedir(), '.cache', 'codedoc', 'electron');
const BUILDER_BINARIES_BASE_URL = 'https://github.com/electron-userland/electron-builder-binaries/releases/download';
const RELEASE_BUILD_INPUTS = Object.freeze([
  'package.json',
  'package-lock.json',
  'packages/app',
  'packages/core',
  'LICENSE',
  'NOTICE',
  'THIRD_PARTY_NOTICES.txt',
]);

export const TARGETS = Object.freeze({
  'mac-arm64': Object.freeze({
    id: 'mac-arm64', label: 'macOS arm64', platform: 'mac', arch: 'arm64', distributionMode: 'app-update',
  }),
  'mac-x64': Object.freeze({
    id: 'mac-x64', label: 'macOS x64', platform: 'mac', arch: 'x64', distributionMode: 'app-update',
  }),
  'win-x64': Object.freeze({
    id: 'win-x64', label: 'Windows x64（内部下载、无需签名）', platform: 'win', arch: 'x64', distributionMode: 'internal-download',
  }),
});

const ALL_TARGET_IDS = Object.keys(TARGETS);

function usage() {
  return `Usage:
  npm run package:release
  npm run package:release -- --channel beta --targets all --yes
  npm run package:release -- --channel stable --targets mac-arm64,mac-x64 --yes
  npm run package:release -- --dry-run [--channel beta|stable] [--targets <list>]

Options:
  --channel <beta|stable>       Release channel. Prompted when omitted.
  --targets <all|list>          Comma-separated target ids; defaults to all three.
  --notary-profile <name>       notarytool Keychain profile; defaults to ideabox-notary.
  --yes                         Skip the final local y/n confirmation.
  --dry-run                     Print the plan without building or writing archives.
  --help                        Show this help.

This command never uploads artifacts, publishes update metadata, commits, tags, or pushes Git.`;
}

function valueAfter(argv, index, argument) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${argument} 缺少值`);
  return value;
}

export function parsePackageArgs(argv) {
  const options = {
    channel: undefined,
    targets: undefined,
    notaryProfile: DEFAULT_NOTARY_PROFILE,
    yes: false,
    dryRun: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--yes') options.yes = true;
    else if (argument === '--dry-run') options.dryRun = true;
    else if (argument === '--help' || argument === '-h') options.help = true;
    else if (['--channel', '--targets', '--notary-profile'].includes(argument)) {
      const value = valueAfter(argv, index, argument);
      if (argument === '--channel') options.channel = value;
      else if (argument === '--targets') options.targets = value;
      else options.notaryProfile = value;
      index += 1;
    } else {
      throw new Error(`不支持的参数：${argument}`);
    }
  }
  if (options.channel && !['beta', 'stable'].includes(options.channel)) {
    throw new Error('--channel 只能是 beta 或 stable');
  }
  if (!/^[A-Za-z0-9._-]+$/.test(options.notaryProfile)) {
    throw new Error('--notary-profile 包含不支持的字符');
  }
  return options;
}

export function defaultChannelForVersion(version) {
  return /-beta(?:[.-]|$)/i.test(version) ? 'beta' : 'stable';
}

export function validateChannelVersion(channel, version) {
  const stable = /^\d+\.\d+\.\d+(?:\+[0-9A-Za-z.-]+)?$/;
  const beta = /^\d+\.\d+\.\d+-beta(?:\.[0-9A-Za-z-]+)+(?:\+[0-9A-Za-z.-]+)?$/i;
  if (channel === 'stable' && !stable.test(version)) {
    throw new Error(`Stable 通道要求正式 SemVer，当前版本是 ${version}`);
  }
  if (channel === 'beta' && !beta.test(version)) {
    throw new Error(`Beta 通道要求形如 1.2.3-beta.1 的版本，当前版本是 ${version}`);
  }
  return version;
}

export function parseTargetSelection(value = 'all') {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'all') return [...ALL_TARGET_IDS];
  const ids = [...new Set(normalized.split(',').map((entry) => entry.trim()).filter(Boolean))];
  if (ids.length === 0) return [...ALL_TARGET_IDS];
  const unknown = ids.filter((id) => !TARGETS[id]);
  if (unknown.length > 0) throw new Error(`未知构建目标：${unknown.join(', ')}`);
  return ids;
}

export function electronArtifactName(target, electronVersion) {
  const platform = target.platform === 'mac' ? 'darwin' : target.platform === 'win' ? 'win32' : null;
  if (!platform) throw new Error(`不支持的 Electron 目标平台：${target.platform}`);
  return `electron-v${electronVersion}-${platform}-${target.arch}.zip`;
}

export function electronDownloadUrl(target, electronVersion) {
  const artifactName = electronArtifactName(target, electronVersion);
  return `https://github.com/electron/electron/releases/download/v${electronVersion}/${artifactName}`;
}

function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function curlDownloadCommand(url, outputPath) {
  return [
    'curl', '--fail', '--location', '--progress-bar', '--create-dirs',
    '--output', shellQuote(outputPath), shellQuote(url),
  ].join(' ');
}

export function electronDownloadCommand(target, electronVersion, cacheDirectory = CODEDOC_ELECTRON_CACHE) {
  const artifactName = electronArtifactName(target, electronVersion);
  const outputPath = join(cacheDirectory, artifactName);
  return curlDownloadCommand(electronDownloadUrl(target, electronVersion), outputPath);
}

function defaultElectronBuilderCacheRoot() {
  const configured = process.env.ELECTRON_BUILDER_CACHE?.trim();
  if (configured && isAbsolute(configured)) return configured;
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Caches', 'electron-builder');
  if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    return join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache');
  }
  return join(homedir(), '.cache', 'electron-builder');
}

export function windowsBuilderToolsetSpecs(cacheRoot = defaultElectronBuilderCacheRoot()) {
  const definition = {
    label: 'NSIS 3.12 统一工具包',
    releaseName: 'nsis@1.2.1',
    artifactName: 'nsis-bundle-3.12.tar.gz',
    expectedSha256: '56997fdefe25e7928a1a68b4583d08b240b66cf660234053b20131a74cc082f4',
  };
  return [{
    ...definition,
    url: `${BUILDER_BINARIES_BASE_URL}/${definition.releaseName}/${definition.artifactName}`,
    outputPath: join(cacheRoot, definition.releaseName, definition.artifactName),
  }];
}

function defaultElectronCacheRoots() {
  const roots = [CODEDOC_ELECTRON_CACHE];
  if (process.platform === 'darwin') roots.push(join(homedir(), 'Library', 'Caches', 'electron'));
  else if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
    roots.push(join(process.env.LOCALAPPDATA, 'electron', 'Cache'));
  } else roots.push(join(homedir(), '.cache', 'electron'));
  return [...new Set(roots)];
}

async function findFilesNamed(root, fileName, maximumDepth = 3, depth = 0) {
  let entries;
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
  const matches = [];
  for (const entry of entries) {
    const entryPath = join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) matches.push(entryPath);
    else if (entry.isDirectory() && depth < maximumDepth) {
      matches.push(...await findFilesNamed(entryPath, fileName, maximumDepth, depth + 1));
    }
  }
  return matches;
}

export async function findVerifiedElectronArtifact({ artifactName, expectedSha256, cacheRoots }) {
  const invalid = [];
  for (const cacheRoot of cacheRoots) {
    const candidates = await findFilesNamed(cacheRoot, artifactName);
    for (const candidate of candidates) {
      const candidateStat = await lstat(candidate);
      if (!candidateStat.isFile() || candidateStat.isSymbolicLink()) {
        invalid.push({ path: candidate, reason: '不是普通文件' });
        continue;
      }
      const actualSha256 = await sha256(candidate);
      if (actualSha256 === expectedSha256) return { path: candidate, invalid };
      invalid.push({ path: candidate, reason: `SHA-256 不匹配（实际 ${actualSha256}）` });
    }
  }
  return { path: null, invalid };
}

function red(message) {
  return process.stderr.isTTY ? `\u001b[31m${message}\u001b[0m` : message;
}

export async function resolveElectronDistributions(targetIds) {
  const electronPackage = JSON.parse(await readFile(ELECTRON_PACKAGE_PATH, 'utf8'));
  const checksums = JSON.parse(await readFile(ELECTRON_CHECKSUMS_PATH, 'utf8'));
  const electronVersion = electronPackage.version;
  if (typeof electronVersion !== 'string' || !electronVersion) throw new Error('无法读取 Electron 版本');
  const cacheRoots = defaultElectronCacheRoots();
  const distributions = new Map();
  const missing = [];

  for (const targetId of targetIds) {
    const target = TARGETS[targetId];
    const artifactName = electronArtifactName(target, electronVersion);
    const expectedSha256 = checksums[artifactName];
    if (typeof expectedSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error(`Electron 官方校验清单缺少 ${artifactName}`);
    }
    const result = await findVerifiedElectronArtifact({ artifactName, expectedSha256, cacheRoots });
    if (result.path) {
      distributions.set(targetId, result.path);
      process.stdout.write(`[package] Electron 本地缓存校验通过：${target.label} -> ${result.path}\n`);
    } else {
      missing.push({ target, artifactName, expectedSha256, invalid: result.invalid });
    }
  }

  if (missing.length > 0) {
    const lines = ['缺少打包所需的已校验 Electron 本地缓存，尚未开始构建。'];
    for (const item of missing) {
      lines.push('', `${item.target.label}：${item.artifactName}`);
      for (const invalidEntry of item.invalid) {
        lines.push(`已拒绝缓存：${invalidEntry.path}（${invalidEntry.reason}）`);
      }
      lines.push(`期望 SHA-256：${item.expectedSha256}`);
      lines.push('请执行：');
      lines.push(electronDownloadCommand(item.target, electronVersion));
    }
    lines.push('', '下载完成后重新执行 npm run package:release；脚本会先校验 SHA-256，再开始打包。');
    process.stderr.write(`${red(lines.join('\n'))}\n`);
    throw new Error('Electron 本地缓存不完整');
  }
  return distributions;
}

export async function verifyWindowsBuilderToolsets(targetIds) {
  if (!targetIds.some((targetId) => TARGETS[targetId].platform === 'win')) return [];
  const specs = windowsBuilderToolsetSpecs();
  const missing = [];
  for (const spec of specs) {
    const result = await findVerifiedElectronArtifact({
      artifactName: spec.artifactName,
      expectedSha256: spec.expectedSha256,
      cacheRoots: [dirname(spec.outputPath)],
    });
    if (result.path) {
      process.stdout.write(`[package] Windows 工具缓存校验通过：${spec.label} -> ${result.path}\n`);
    } else {
      missing.push({ ...spec, invalid: result.invalid });
    }
  }
  if (missing.length > 0) {
    const lines = ['缺少 Windows NSIS 打包工具缓存，尚未开始构建。'];
    for (const item of missing) {
      lines.push('', `${item.label}：${item.artifactName}`);
      for (const invalidEntry of item.invalid) {
        lines.push(`已拒绝缓存：${invalidEntry.path}（${invalidEntry.reason}）`);
      }
      lines.push(`期望 SHA-256：${item.expectedSha256}`);
      lines.push('请执行：');
      lines.push(curlDownloadCommand(item.url, item.outputPath));
    }
    lines.push('', '下载完成后重新执行 npm run package:release；Electron Builder 将从本地归档安全解压。');
    process.stderr.write(`${red(lines.join('\n'))}\n`);
    throw new Error('Windows NSIS 工具缓存不完整');
  }
  return specs;
}

function runCapture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? REPO_ROOT,
    env: options.env ?? process.env,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw new Error(`无法执行 ${command}: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(`${command} ${args.join(' ')} 执行失败${detail ? `：${detail}` : ''}`);
  }
  return { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

async function runLogged(command, args, { cwd = REPO_ROOT, env = process.env, logPath, quiet = false } = {}) {
  await mkdir(dirname(logPath), { recursive: true });
  const log = createWriteStream(logPath, { flags: 'a', mode: 0o644 });
  log.write(`$ ${command} ${args.join(' ')}\n`);
  try {
    await new Promise((resolvePromise, reject) => {
      const child = spawn(command, args, { cwd, env });
      const forward = (chunk, destination) => {
        log.write(chunk);
        if (!quiet) destination.write(chunk);
      };
      child.stdout.on('data', (chunk) => forward(chunk, process.stdout));
      child.stderr.on('data', (chunk) => forward(chunk, process.stderr));
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolvePromise();
        else reject(new Error(`${command} ${args.join(' ')} 退出码 ${code}`));
      });
    });
  } finally {
    await new Promise((resolvePromise) => log.end(resolvePromise));
  }
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readPackageVersion() {
  const packageJson = JSON.parse(await readFile(APP_PACKAGE_PATH, 'utf8'));
  if (typeof packageJson.version !== 'string') throw new Error('packages/app/package.json 缺少版本号');
  return packageJson.version;
}

function gitCommit() {
  return runCapture('git', ['rev-parse', 'HEAD']).stdout.trim();
}

function assertCleanRepository(repositoryRoot, label) {
  const status = runCapture('git', ['status', '--porcelain'], { cwd: repositoryRoot }).stdout;
  if (status.trim()) {
    throw new Error(`${label} 工作区不是干净状态。请先检查、提交当前改动，再生成可追溯安装包。`);
  }
}

export function classifyArchivePresence(archiveExists, recordExists) {
  if (!archiveExists && !recordExists) return 'pending';
  if (archiveExists && recordExists) return 'completed-candidate';
  return 'inconsistent';
}

function targetArchivePaths(releaseRoot, channel, version, target) {
  const archiveDirectory = join(
    releaseRoot, '.release-work', APP_SLUG, channel,
    target.platform, target.arch, version,
  );
  return {
    archiveDirectory,
    manifestPath: join(archiveDirectory, 'release-manifest.json'),
    recordPath: join(releaseRoot, 'releases', APP_SLUG, channel, version, 'prepared.json'),
  };
}

function assertReusableBuildInputs(sourceCommit, currentCommit) {
  const ancestry = spawnSync('git', ['merge-base', '--is-ancestor', sourceCommit, currentCommit], { cwd: REPO_ROOT });
  if (ancestry.status !== 0) {
    throw new Error(`已有归档源码 ${sourceCommit} 不是当前源码 ${currentCommit} 的祖先，不能自动复用`);
  }
  const changed = runCapture(
    'git', ['diff', '--name-only', `${sourceCommit}..${currentCommit}`, '--', ...RELEASE_BUILD_INPUTS],
  ).stdout.trim();
  if (changed) {
    throw new Error(`已有归档之后产品构建输入发生变化，不能复用：${changed.split('\n').join(', ')}`);
  }
}

export async function resolveResumableTargets({ releaseRoot, channel, version, targetIds, currentCommit }) {
  const prepareScript = join(releaseRoot, 'prepare-release.mjs');
  const pendingTargetIds = [];
  const completed = [];
  for (const targetId of targetIds) {
    const target = TARGETS[targetId];
    const paths = targetArchivePaths(releaseRoot, channel, version, target);
    const record = await readTargetRecord(paths.recordPath, {
      appSlug: APP_SLUG,
      version,
      channel,
      platform: target.platform,
      arch: target.arch,
    }, 'prepared-release');
    const state = classifyArchivePresence(
      await pathExists(paths.archiveDirectory),
      record !== null,
    );
    if (state === 'pending') {
      pendingTargetIds.push(targetId);
      continue;
    }
    if (state === 'inconsistent') {
      throw new Error(`已有目标状态不完整，拒绝覆盖：${targetId} ${version}（归档与 prepared 记录必须同时存在）`);
    }

    const manifest = JSON.parse(await readFile(paths.manifestPath, 'utf8'));
    const identityMatches = record.recordType === 'prepared-release'
      && record.appSlug === APP_SLUG
      && record.version === version
      && record.channel === channel
      && record.target?.platform === target.platform
      && record.target?.arch === target.arch;
    if (!identityMatches) throw new Error(`已有 prepared 记录身份不匹配：${targetId} ${version}`);
    if (!record.source?.commit || manifest.source?.commit !== record.source.commit) {
      throw new Error(`已有归档与 prepared 记录的源码 Commit 不一致：${targetId} ${version}`);
    }
    runCapture(process.execPath, [prepareScript, 'checklist', '--manifest', paths.manifestPath], { cwd: REPO_ROOT });
    assertReusableBuildInputs(record.source.commit, currentCommit);
    completed.push({ targetId, sourceCommit: record.source.commit, archiveDirectory: paths.archiveDirectory });
    process.stdout.write(
      `[package] 已有归档复核通过，跳过 ${target.label}：${paths.archiveDirectory}\n`,
    );
  }
  return { pendingTargetIds, completed };
}

function assertMacReleaseEnvironment(notaryProfile) {
  if (process.platform !== 'darwin') throw new Error('macOS 安装包必须在 macOS 主机上构建');
  const identities = runCapture('security', ['find-identity', '-v', '-p', 'codesigning']).stdout;
  if (!identities.includes('Developer ID Application:')) {
    throw new Error('未找到 Developer ID Application 签名身份');
  }
  const gatekeeper = runCapture('spctl', ['--status']).stdout;
  if (!gatekeeper.includes('assessments enabled')) throw new Error('Gatekeeper 未开启，不能生成通过验收的 macOS 归档');
  runCapture('xcrun', ['notarytool', 'history', '--keychain-profile', notaryProfile, '--output-format', 'json']);
}

async function notaryHistory(profile) {
  const output = runCapture(
    'xcrun', ['notarytool', 'history', '--keychain-profile', profile, '--output-format', 'json'],
  ).stdout;
  const parsed = JSON.parse(output);
  return Array.isArray(parsed.history) ? parsed.history : [];
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function topLevelFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile()).map((entry) => join(directory, entry.name));
}

function requireFile(files, name) {
  const result = files.find((file) => basename(file) === name);
  if (!result) throw new Error(`构建结果缺少 ${name}`);
  return result;
}

async function findMacMetadata(files, version, updaterName) {
  for (const file of files.filter((entry) => /(?:^|-)mac\.yml$/.test(basename(entry)))) {
    const text = await readFile(file, 'utf8');
    if (text.includes(`version: ${version}`) && text.includes(updaterName)) return file;
  }
  throw new Error(`没有找到同时引用 ${version} 和 ${updaterName} 的 macOS 更新元数据`);
}

async function verifyMacArtifacts({ target, version, files, outputDirectory, notaryProfile, previousNotaryIds }) {
  const prefix = `${APP_NAME}-${version}-mac-${target.arch}`;
  const dmg = requireFile(files, `${prefix}.dmg`);
  const dmgBlockmap = requireFile(files, `${prefix}.dmg.blockmap`);
  const zip = requireFile(files, `${prefix}.zip`);
  const zipBlockmap = requireFile(files, `${prefix}.zip.blockmap`);
  const metadata = await findMacMetadata(files, version, basename(zip));
  const verificationDirectory = join(outputDirectory, 'verification');
  const extractionDirectory = await mkdtemp(join(tmpdir(), `codedoc-${target.id}-verify-`));
  const verificationLog = join(verificationDirectory, 'mac-distribution.log');
  await runLogged('ditto', ['-x', '-k', zip, extractionDirectory], { logPath: verificationLog, quiet: true });
  const app = join(extractionDirectory, `${APP_NAME}.app`);
  const plist = join(app, 'Contents', 'Info.plist');
  const executable = join(app, 'Contents', 'MacOS', APP_NAME);
  const actualBundleId = runCapture('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist]).stdout.trim();
  const actualVersion = runCapture('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleShortVersionString', plist]).stdout.trim();
  if (actualBundleId !== BUNDLE_ID) throw new Error(`Bundle ID 不一致：${actualBundleId}`);
  if (actualVersion !== version) throw new Error(`应用版本不一致：${actualVersion}`);
  const architectures = runCapture('lipo', ['-archs', executable]).stdout.trim().split(/\s+/);
  const expectedArchitecture = target.arch === 'x64' ? 'x86_64' : 'arm64';
  if (architectures.length !== 1 || architectures[0] !== expectedArchitecture) {
    throw new Error(`${target.label} 可执行文件架构不匹配：${architectures.join(' ')}`);
  }
  await runLogged('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app], {
    logPath: verificationLog, quiet: true,
  });
  await runLogged('xcrun', ['stapler', 'validate', app], { logPath: verificationLog, quiet: true });
  await runLogged('syspolicy_check', ['distribution', app, '--verbose'], { logPath: verificationLog, quiet: true });
  const history = await notaryHistory(notaryProfile);
  const submission = history.find(
    (entry) => !previousNotaryIds.has(entry.id) && String(entry.status).toLowerCase() === 'accepted',
  );
  if (!submission?.id) throw new Error(`${target.label} 未找到本次构建新增的 Accepted 公证记录`);
  return {
    artifacts: [
      { path: dmg, role: 'installer' },
      { path: dmgBlockmap, role: 'blockmap' },
      { path: zip, role: 'updater', referencedByMetadata: true },
      { path: zipBlockmap, role: 'blockmap' },
    ],
    metadata: [{ path: metadata, publishName: 'latest-mac.yml' }],
    verification: {
      releaseBuild: 'passed',
      bundleId: BUNDLE_ID,
      signing: 'passed',
      notarization: 'accepted',
      notarizationSubmissionId: submission.id,
      gatekeeper: 'passed',
    },
    evidence: {
      bundleId: actualBundleId,
      version: actualVersion,
      architectures,
      signing: 'passed',
      notarization: 'accepted',
      notarizationSubmissionId: submission.id,
      stapler: 'passed',
      gatekeeper: 'passed',
      dmgContainerSigning: 'not-verified',
    },
  };
}

async function verifyWindowsArtifacts({ target, version, files, outputDirectory }) {
  const prefix = `${APP_NAME}-${version}-win-${target.arch}`;
  const installer = requireFile(files, `${prefix}.exe`);
  const installerStat = await stat(installer);
  if (installerStat.size < 1024 * 1024) throw new Error('Windows 安装包体积异常，未达到 1 MiB');
  const header = Buffer.alloc(2);
  const installerHandle = await open(installer, 'r');
  try {
    await installerHandle.read(header, 0, header.length, 0);
  } finally {
    await installerHandle.close();
  }
  if (header[0] !== 0x4d || header[1] !== 0x5a) throw new Error('Windows 安装包缺少 MZ/PE 文件头');
  const artifacts = [{ path: installer, role: 'installer' }];
  const blockmapPath = files.find((file) => basename(file) === `${prefix}.exe.blockmap`);
  if (blockmapPath) artifacts.push({ path: blockmapPath, role: 'blockmap' });
  const verificationDirectory = join(outputDirectory, 'verification');
  const verificationLog = join(verificationDirectory, 'windows-package.log');
  await mkdir(verificationDirectory, { recursive: true });
  await writeFile(
    verificationLog,
    [
      `installer=${basename(installer)}`,
      `size=${installerStat.size}`,
      'format=MZ/PE',
      'signing=not-required-internal',
      'application-update=disabled',
      'install-smoke-test=not-run-on-macos',
      '',
    ].join('\n'),
  );
  return {
    artifacts,
    metadata: [],
    verification: { releaseBuild: 'passed', signing: 'not-required-internal' },
    evidence: {
      version,
      size: installerStat.size,
      format: 'MZ/PE',
      signing: 'not-required-internal',
      applicationUpdate: 'disabled',
      installSmokeTest: 'not-run-on-macos',
    },
  };
}

export function createReleaseManifest({ target, version, channel, commit, repositoryPath, result }) {
  return {
    releaseContractVersion: 1,
    appSlug: APP_SLUG,
    version,
    channel,
    target: { platform: target.platform, arch: target.arch },
    source: { repository: 'CodeSucker', repositoryPath, commit },
    verification: result.verification,
    artifacts: result.artifacts,
    metadata: result.metadata,
  };
}

async function writeChecksums(filesDirectory, outputPath) {
  const files = (await topLevelFiles(filesDirectory)).sort((left, right) => basename(left).localeCompare(basename(right)));
  const lines = [];
  for (const file of files) lines.push(`${await sha256(file)}  ${basename(file)}`);
  await writeFile(outputPath, `${lines.join('\n')}\n`);
}

async function archiveTarget({ releaseRoot, target, version, channel, commit, result, sessionDirectory, buildCommand }) {
  const prepareScript = join(releaseRoot, 'prepare-release.mjs');
  const sourceManifest = join(sessionDirectory, `${target.id}-release-manifest.json`);
  const manifest = createReleaseManifest({
    target, version, channel, commit, repositoryPath: REPO_ROOT, result,
  });
  await writeFile(sourceManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  const archiveDirectory = join(
    releaseRoot, '.release-work', APP_SLUG, channel,
    target.platform, target.arch, version,
  );
  runCapture(process.execPath, [prepareScript, 'stage', '--manifest', sourceManifest, '--output-dir', archiveDirectory], {
    cwd: REPO_ROOT,
  });
  const stagedManifest = join(archiveDirectory, 'release-manifest.json');
  const verificationDirectory = join(archiveDirectory, 'verification');
  await mkdir(verificationDirectory, { recursive: true });
  await copyFile(join(sessionDirectory, 'npm-verify.log'), join(verificationDirectory, 'npm-verify.log'));
  await copyFile(join(sessionDirectory, `${target.id}-build.log`), join(verificationDirectory, 'build.log'));
  const targetVerification = join(sessionDirectory, target.id, 'verification');
  if (await pathExists(targetVerification)) {
    for (const file of await topLevelFiles(targetVerification)) {
      await copyFile(file, join(verificationDirectory, basename(file)));
    }
  }
  await writeChecksums(join(archiveDirectory, 'files'), join(archiveDirectory, 'SHA256SUMS.txt'));
  const report = {
    reportVersion: 1,
    generatedAt: new Date().toISOString(),
    appSlug: APP_SLUG,
    version,
    channel,
    target: { id: target.id, platform: target.platform, arch: target.arch },
    distributionMode: target.distributionMode,
    source: { repository: 'CodeSucker', commit },
    buildCommand,
    evidence: result.evidence,
    archiveDirectory,
    cloudUploadPerformed: false,
  };
  await writeFile(join(archiveDirectory, 'build-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  runCapture(process.execPath, [prepareScript, 'record', '--manifest', stagedManifest], { cwd: REPO_ROOT });
  return archiveDirectory;
}

export function builderCommand(target, outputDirectory, electronDist) {
  const executable = join(REPO_ROOT, 'node_modules', '.bin', 'electron-builder');
  if (target.platform === 'mac') {
    return {
      executable,
      args: [
        '--mac', 'dmg', 'zip', `--${target.arch}`, '--publish', 'never',
        '--config.mac.forceCodeSigning=true', `--config.electronDist=${electronDist}`,
        `--config.directories.output=${outputDirectory}`,
      ],
    };
  }
  return {
    executable,
    args: [
      '--win', 'nsis', '--x64', '--publish', 'never', '--config.toolsets.nsis=1.2.1',
      `--config.electronDist=${electronDist}`,
      `--config.directories.output=${outputDirectory}`,
    ],
  };
}

async function buildTarget({ target, version, channel, commit, releaseRoot, notaryProfile, sessionDirectory, electronDist }) {
  const targetDirectory = join(sessionDirectory, target.id);
  const outputDirectory = join(targetDirectory, 'output');
  await mkdir(outputDirectory, { recursive: true });
  let previousNotaryIds = new Set();
  if (target.platform === 'mac') {
    previousNotaryIds = new Set((await notaryHistory(notaryProfile)).map((entry) => entry.id));
  }
  const command = builderCommand(target, outputDirectory, electronDist);
  const buildLog = join(sessionDirectory, `${target.id}-build.log`);
  const environment = {
    ...process.env,
    CSC_IDENTITY_AUTO_DISCOVERY: target.platform === 'mac' ? 'true' : 'false',
    ...(target.platform === 'mac' ? { APPLE_KEYCHAIN_PROFILE: notaryProfile } : {}),
  };
  process.stdout.write(`\n[package] 构建 ${target.label}\n`);
  await runLogged(command.executable, command.args, { cwd: APP_ROOT, env: environment, logPath: buildLog });
  const files = await topLevelFiles(outputDirectory);
  const result = target.platform === 'mac'
    ? await verifyMacArtifacts({ target, version, files, outputDirectory: targetDirectory, notaryProfile, previousNotaryIds })
    : await verifyWindowsArtifacts({ target, version, files, outputDirectory: targetDirectory });
  const archiveDirectory = await archiveTarget({
    releaseRoot,
    target,
    version,
    channel,
    commit,
    result,
    sessionDirectory,
    buildCommand: [command.executable, ...command.args].join(' '),
  });
  process.stdout.write(`[package] 已归档 ${target.label}: ${archiveDirectory}\n`);
  return archiveDirectory;
}

function formatPlan({ version, channel, targetIds, releaseRoot, commit }) {
  return [
    '',
    'CodeDoc 本地发布打包计划',
    `版本：${version}`,
    `通道：${channel}`,
    `源码：${commit}`,
    `目标：${targetIds.map((id) => TARGETS[id].label).join('、')}`,
    `本地归档：${releaseRoot}`,
    '云端操作：无',
    '',
  ].join('\n');
}

export function parseBuildConfirmation(value) {
  const normalized = value.trim().toLowerCase();
  if (normalized === '' || normalized === 'y') return true;
  if (normalized === 'n') return false;
  return undefined;
}

async function resolveInteractiveOptions(options, version) {
  if (options.channel && options.targets) {
    return { channel: options.channel, targetIds: parseTargetSelection(options.targets) };
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const defaultChannel = defaultChannelForVersion(version);
    const channelInput = options.channel ?? await readline.question(
      `发布通道 [beta/stable]（默认 ${defaultChannel}）：`,
    );
    const channel = channelInput.trim().toLowerCase() || defaultChannel;
    if (!['beta', 'stable'].includes(channel)) throw new Error('发布通道只能是 beta 或 stable');
    const targetsInput = options.targets ?? await readline.question(
      '构建目标 [all/mac-arm64,mac-x64,win-x64]（默认 all）：',
    );
    return { channel, targetIds: parseTargetSelection(targetsInput) };
  } finally {
    readline.close();
  }
}

async function confirmBuild(options, plan) {
  process.stdout.write(formatPlan(plan));
  if (options.dryRun) return false;
  if (options.yes) return true;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    while (true) {
      const answer = await readline.question('开始本地打包与归档？[Y/n]：');
      const confirmation = parseBuildConfirmation(answer);
      if (confirmation !== undefined) return confirmation;
      process.stdout.write('请输入 y 或 n；直接回车默认为 y。\n');
    }
  } finally {
    readline.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parsePackageArgs(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const version = await readPackageVersion();
  const { channel, targetIds } = await resolveInteractiveOptions(options, version);
  validateChannelVersion(channel, version);
  const commit = gitCommit();
  const plan = { version, channel, targetIds, releaseRoot: RELEASE_ROOT, commit };
  if (!await confirmBuild(options, plan)) {
    process.stdout.write(options.dryRun ? 'DRY RUN：未构建、未写入归档。\n' : '已取消，未执行打包。\n');
    return;
  }

  const prepareScript = join(RELEASE_ROOT, 'prepare-release.mjs');
  const registry = join(RELEASE_ROOT, 'release.config.json');
  await access(prepareScript);
  await access(registry);
  assertCleanRepository(REPO_ROOT, 'CodeSucker');
  const { pendingTargetIds, completed } = await resolveResumableTargets({
    releaseRoot: RELEASE_ROOT, channel, version, targetIds, currentCommit: commit,
  });
  if (pendingTargetIds.length === 0) {
    process.stdout.write('\n[package] 所选目标均已有通过复核的归档，无需重复构建。\n');
    return;
  }
  const electronDistributions = await resolveElectronDistributions(pendingTargetIds);
  await verifyWindowsBuilderToolsets(pendingTargetIds);
  if (pendingTargetIds.some((id) => TARGETS[id].platform === 'mac')) {
    assertMacReleaseEnvironment(options.notaryProfile);
  }

  const sessionDirectory = await mkdtemp(join(tmpdir(), `codedoc-package-${version}-`));
  process.stdout.write(`[package] 临时构建目录：${sessionDirectory}\n`);
  await runLogged('npm', ['run', 'verify'], {
    cwd: REPO_ROOT,
    logPath: join(sessionDirectory, 'npm-verify.log'),
  });

  const archives = completed.map((entry) => entry.archiveDirectory);
  for (const targetId of pendingTargetIds) {
    archives.push(await buildTarget({
      target: TARGETS[targetId],
      version,
      channel,
      commit,
      releaseRoot: RELEASE_ROOT,
      notaryProfile: options.notaryProfile,
      sessionDirectory,
      electronDist: electronDistributions.get(targetId),
    }));
  }
  process.stdout.write(
    `\n[package] 全部本地目标已完成（复用 ${completed.length}，新建 ${pendingTargetIds.length}）。未上传服务器或 OSS。\n`,
  );
  for (const archive of archives) process.stdout.write(`- ${archive}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
