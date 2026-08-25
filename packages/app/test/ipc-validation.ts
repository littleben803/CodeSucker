import assert from 'node:assert/strict';
import * as path from 'node:path';
import {
  boundedConfigRecord, parseExportRequest, parseJobId, parseProcessRequest, parseScanRequest,
} from '../src/main/ipc-validation.ts';

const root = path.resolve('/tmp/codesucker-ipc-project');
const clean = {
  removeComments: true,
  removeBlankLines: true,
  maskSensitive: true,
  wrapLongLines: true,
  maxLineWidth: 78,
  tabWidth: 4,
};
const payload = {
  root,
  scanSessionId: 'session-123',
  orderedRelPaths: ['src/main.ts', 'src/app.ts'],
  title: '测试软件 V1.0',
  owner: '测试主体',
  clean,
};

assert.deepEqual(parseScanRequest({ jobId: 'scan-123', scanSessionId: 'session-123', root }), {
  jobId: 'scan-123', scanSessionId: 'session-123', root,
});
assert.equal(parseProcessRequest({ jobId: 'process-123', payload }).payload.title, payload.title);
assert.equal(parseExportRequest({
  jobId: 'export-123',
  payload: { ...payload, outDir: path.join(root, 'out'), formats: { docx: true, txt: false } },
}).payload.formats.docx, true);
assert.equal(parseJobId('scan-123'), 'scan-123');

for (const invalid of [null, {}, { jobId: '../bad', scanSessionId: 'session', root }]) {
  assert.throws(() => parseScanRequest(invalid));
}
assert.throws(() => parseScanRequest({ jobId: 'scan-1', scanSessionId: 'session-1', root: 'relative' }), /项目目录/);
assert.throws(() => parseProcessRequest({ jobId: 'process-1', payload: { ...payload, orderedRelPaths: ['../secret'] } }), /相对路径/);
assert.throws(() => parseProcessRequest({ jobId: 'process-1', payload: { ...payload, orderedRelPaths: ['src/a.ts', 'src/a.ts'] } }), /重复/);
assert.equal(parseProcessRequest({ jobId: 'process-1', payload: { ...payload, title: '' } }).payload.title, '');
assert.throws(() => parseProcessRequest({ jobId: 'process-1', payload: { ...payload, clean: { ...clean, tabWidth: 8 } } }), /清洗参数/);
assert.throws(() => parseExportRequest({
  jobId: 'export-1', payload: {
    ...payload, title: '', outDir: path.join(root, 'out'), formats: { docx: true, txt: false },
  },
}), /不能为空/);
assert.throws(() => parseExportRequest({
  jobId: 'export-1', payload: { ...payload, outDir: path.join(root, 'out'), formats: { docx: false, txt: false } },
}), /至少选择/);
assert.throws(() => boundedConfigRecord({ value: 'x'.repeat(1024 * 1024) }), /过大/);
const circular: Record<string, unknown> = {};
circular.self = circular;
assert.throws(() => boundedConfigRecord(circular), /无法序列化/);

console.log('✅ IPC request validation 全部通过');
