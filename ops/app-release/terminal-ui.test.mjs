import assert from 'node:assert/strict';
import test from 'node:test';
import { colorizeStatus, createTerminalUi, terminalSupportsColor } from './terminal-ui.mjs';

function capture(isTTY = true) {
  let value = '';
  return { stream: { isTTY, write: (text) => { value += text; } }, read: () => value };
}

test('terminal colors status levels consistently', () => {
  assert.match(colorizeStatus('SUCCESS: done', true), /\u001b\[32m/);
  assert.match(colorizeStatus('ERROR: failed', true), /\u001b\[31m/);
  assert.match(colorizeStatus('WARNING: review', true), /\u001b\[33m/);
  assert.match(colorizeStatus('START: upload', true), /\u001b\[36m/);
});

test('terminal output stays plain for pipes and NO_COLOR', () => {
  assert.equal(terminalSupportsColor({ isTTY: false }, {}), false);
  assert.equal(terminalSupportsColor({ isTTY: true }, { NO_COLOR: '' }), false);
  assert.equal(colorizeStatus('SUCCESS: done', false), 'SUCCESS: done');
});

test('terminal UI routes warnings and errors to stderr', () => {
  const stdout = capture(false);
  const stderr = capture(false);
  const ui = createTerminalUi({ stdout: stdout.stream, stderr: stderr.stream, env: { FORCE_COLOR: '1' } });
  ui.success('published');
  ui.warning('review');
  ui.error(new Error('broken'));
  assert.match(stdout.read(), /\u001b\[32mSUCCESS: published/);
  assert.match(stderr.read(), /\u001b\[33mWARNING: review/);
  assert.match(stderr.read(), /\u001b\[31mERROR: broken/);
});
