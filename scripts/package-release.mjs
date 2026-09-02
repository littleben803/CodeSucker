#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import {
  access,
  copyFile,
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const APP_ROOT = join(REPO_ROOT, 'packages', 'app');
const APP_PACKAGE_PATH = join(APP_ROOT, 'package.json');
const DEFAULT_WEBSITE_ROOT = resolve(REPO_ROOT, '..', 'IdeaBoxWebsite');
const DEFAULT_NOTARY_PROFILE = 'ideabox-notary';
const APP_SLUG = 'codedoc';
const APP_NAME = 'CodeDoc';
const BUNDLE_ID = 'com.ideaboxapps.codedoc';

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
  --website-root <directory>    IdeaBoxWebsite checkout; defaults to the sibling repository.
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
    websiteRoot: DEFAULT_WEBSITE_ROOT,
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
    else if (['--channel', '--targets', '--website-root', '--notary-profile'].includes(argument)) {
      const value = valueAfter(argv, index, argument);
      if (argument === '--channel') options.channel = value;
      else if (argument === '--targets') options.targets = value;
      else if (argument === '--website-root') options.websiteRoot = resolve(value);
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

async function assertArchiveTargetsAbsent(websiteRoot, channel, version, targetIds) {
  for (const targetId of targetIds) {
    const target = TARGETS[targetId];
    const archiveDirectory = join(
      websiteRoot, 'ops', 'app-release', '.release-work', APP_SLUG, channel,
      target.platform, target.arch, version,
    );
    const recordPath = join(
      websiteRoot, 'ops', 'app-release', 'releases', APP_SLUG, channel, version,
      `${target.platform}-${target.arch}.prepared.json`,
    );
    if (await pathExists(archiveDirectory) || await pathExists(recordPath)) {
      throw new Error(`拒绝覆盖已有归档或发布记录：${targetId} ${version}`);
    }
  }
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

async function archiveTarget({ websiteRoot, target, version, channel, commit, result, sessionDirectory, buildCommand }) {
  const prepareScript = join(websiteRoot, 'ops', 'app-release', 'prepare-release.mjs');
  const sourceManifest = join(sessionDirectory, `${target.id}-release-manifest.json`);
  const manifest = createReleaseManifest({
    target, version, channel, commit, repositoryPath: REPO_ROOT, result,
  });
  await writeFile(sourceManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  const archiveDirectory = join(
    websiteRoot, 'ops', 'app-release', '.release-work', APP_SLUG, channel,
    target.platform, target.arch, version,
  );
  runCapture(process.execPath, [prepareScript, 'stage', '--manifest', sourceManifest, '--output-dir', archiveDirectory], {
    cwd: websiteRoot,
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
  runCapture(process.execPath, [prepareScript, 'record', '--manifest', stagedManifest], { cwd: websiteRoot });
  return archiveDirectory;
}

function builderCommand(target, outputDirectory) {
  const executable = join(REPO_ROOT, 'node_modules', '.bin', 'electron-builder');
  if (target.platform === 'mac') {
    return {
      executable,
      args: [
        '--mac', 'dmg', 'zip', `--${target.arch}`, '--publish', 'never',
        '--config.mac.forceCodeSigning=true', `--config.directories.output=${outputDirectory}`,
      ],
    };
  }
  return {
    executable,
    args: ['--win', 'nsis', '--x64', '--publish', 'never', `--config.directories.output=${outputDirectory}`],
  };
}

async function buildTarget({ target, version, channel, commit, websiteRoot, notaryProfile, sessionDirectory }) {
  const targetDirectory = join(sessionDirectory, target.id);
  const outputDirectory = join(targetDirectory, 'output');
  await mkdir(outputDirectory, { recursive: true });
  let previousNotaryIds = new Set();
  if (target.platform === 'mac') {
    previousNotaryIds = new Set((await notaryHistory(notaryProfile)).map((entry) => entry.id));
  }
  const command = builderCommand(target, outputDirectory);
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
    websiteRoot,
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

function formatPlan({ version, channel, targetIds, websiteRoot, commit }) {
  return [
    '',
    'CodeDoc 本地发布打包计划',
    `版本：${version}`,
    `通道：${channel}`,
    `源码：${commit}`,
    `目标：${targetIds.map((id) => TARGETS[id].label).join('、')}`,
    `归档仓库：${websiteRoot}`,
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
  const plan = { version, channel, targetIds, websiteRoot: options.websiteRoot, commit };
  if (!await confirmBuild(options, plan)) {
    process.stdout.write(options.dryRun ? 'DRY RUN：未构建、未写入归档。\n' : '已取消，未执行打包。\n');
    return;
  }

  const prepareScript = join(options.websiteRoot, 'ops', 'app-release', 'prepare-release.mjs');
  const registry = join(options.websiteRoot, 'ops', 'app-release', 'apps.json');
  await access(prepareScript);
  await access(registry);
  assertCleanRepository(REPO_ROOT, 'CodeSucker');
  assertCleanRepository(options.websiteRoot, 'IdeaBoxWebsite');
  await assertArchiveTargetsAbsent(options.websiteRoot, channel, version, targetIds);
  if (targetIds.some((id) => TARGETS[id].platform === 'mac')) {
    assertMacReleaseEnvironment(options.notaryProfile);
  }

  const sessionDirectory = await mkdtemp(join(tmpdir(), `codedoc-package-${version}-`));
  process.stdout.write(`[package] 临时构建目录：${sessionDirectory}\n`);
  await runLogged('npm', ['run', 'verify'], {
    cwd: REPO_ROOT,
    logPath: join(sessionDirectory, 'npm-verify.log'),
  });

  const archives = [];
  for (const targetId of targetIds) {
    archives.push(await buildTarget({
      target: TARGETS[targetId],
      version,
      channel,
      commit,
      websiteRoot: options.websiteRoot,
      notaryProfile: options.notaryProfile,
      sessionDirectory,
    }));
  }
  process.stdout.write('\n[package] 全部本地目标已完成。未上传服务器或 OSS。\n');
  for (const archive of archives) process.stdout.write(`- ${archive}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`ERROR: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
