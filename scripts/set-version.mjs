import { assertVersionConsistency, ensureChangelogVersion, setAllVersions } from './version-utils.mjs';

const version = process.argv[2];
if (!version) {
  console.error('用法：npm run version:set -- <semver>，例如 0.2.0-beta.1');
  process.exit(1);
}

try {
  setAllVersions(version);
  const checked = assertVersionConsistency();
  const changelog = ensureChangelogVersion(checked);
  console.log(`✓ 已将根包、app、core 与 package-lock 统一为 ${checked}`);
  console.log(changelog.added
    ? `✓ 已在 CHANGELOG.md 顶部创建 ${checked} 版本模板（${changelog.date}）`
    : `✓ CHANGELOG.md 已存在 ${checked} 版本记录，未重复写入`);
  console.log('下一步：填写 CHANGELOG.md，然后运行 npm run verify。');
} catch (error) {
  console.error(`✗ 设置版本失败：${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
