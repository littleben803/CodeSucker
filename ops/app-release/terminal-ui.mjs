const RESET = '\u001b[0m';
const COLORS = Object.freeze({ green: '\u001b[32m', yellow: '\u001b[33m', red: '\u001b[31m', cyan: '\u001b[36m' });

export function terminalSupportsColor(stream = process.stdout, env = process.env) {
  if ('NO_COLOR' in env || env.TERM === 'dumb' || env.FORCE_COLOR === '0') return false;
  if (env.FORCE_COLOR) return true;
  return Boolean(stream.isTTY);
}

export function colorizeStatus(message, enabled) {
  if (!enabled) return message;
  let color;
  if (/(?:\bSUCCESS\b|\bPASS(?:ED)?\b|成功|已完成|校验通过)/i.test(message)) color = COLORS.green;
  else if (/(?:\bFAIL(?:ED)?\b|\bERROR\b|失败|错误)/i.test(message)) color = COLORS.red;
  else if (/(?:\bWARN(?:ING)?\b|警告|注意)/i.test(message)) color = COLORS.yellow;
  else if (/(?:\bSTART\b|\bACTIVE\b|开始|正在)/i.test(message)) color = COLORS.cyan;
  return color ? `${color}${message}${RESET}` : message;
}

export function createTerminalUi({ stdout = process.stdout, stderr = process.stderr, env = process.env } = {}) {
  const write = (stream, message) => stream.write(`${colorizeStatus(String(message), terminalSupportsColor(stream, env))}\n`);
  return {
    line: (message = '') => stdout.write(`${message}\n`),
    status: (message) => write(stdout, message),
    timestamp: (message) => write(stdout, `[${new Date().toISOString()}] ${message}`),
    success: (message) => write(stdout, `SUCCESS: ${message}`),
    warning: (message) => write(stderr, `WARNING: ${message}`),
    error: (error) => write(stderr, `ERROR: ${error instanceof Error ? error.message : String(error)}`),
  };
}
