import assert from 'node:assert/strict';
import { DEFAULT_EXCLUDES } from '@codedoc/core';
import {
  BUILT_IN_SCAN_EXCLUDE_RULE_HELP,
  getBuiltInScanExcludeRuleHelp,
} from '../src/renderer/src/scan-exclude-rule-help.ts';

const helpRules = Object.keys(BUILT_IN_SCAN_EXCLUDE_RULE_HELP);

assert.equal(helpRules.length, 20, '20 条内置规则都应提供说明');
assert.deepEqual(helpRules, DEFAULT_EXCLUDES, '说明顺序和规则名称应与内置规则完全一致');

for (const rule of DEFAULT_EXCLUDES) {
  const help = getBuiltInScanExcludeRuleHelp(rule);
  assert.ok(help, `${rule} 应提供内置说明`);
  assert.ok(help.detail.trim().length > 0, `${rule} 应说明排除内容`);
  assert.ok(help.reason.trim().length > 0, `${rule} 应说明默认排除原因`);
}

assert.equal(getBuiltInScanExcludeRuleHelp('custom-generated'), null, '用户规则不应套用内置说明');

console.log('✅ scan exclude rule help 全部通过');
