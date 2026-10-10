import assert from 'node:assert/strict';
import { parseCustomExtensions } from '../src/renderer/src/custom-extensions.ts';

assert.deepEqual(parseCustomExtensions('.ui, .pro'), ['ui', 'pro']);
assert.deepEqual(parseCustomExtensions('UI； pro ui'), ['ui', 'pro']);
assert.deepEqual(parseCustomExtensions(''), []);
assert.throws(() => parseCustomExtensions('../secret'), /格式无效/);
assert.throws(
  () => parseCustomExtensions(Array.from({ length: 101 }, (_, index) => `x${index}`).join(',')),
  /最多添加/,
);

console.log('✅ 自定义扫描后缀校验全部通过');
