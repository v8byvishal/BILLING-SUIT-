'use strict';

const fs = require('node:fs');
const path = require('node:path');

const RANK = Object.freeze({ DEBUG: 10, INFO: 20, WARN: 30, ERROR: 40 });

function safeContext(context) {
  if (context == null) return undefined;
  if (context instanceof Error) return { name: context.name, message: context.message, stack: context.stack };
  if (typeof context === 'object') {
    try { return JSON.parse(JSON.stringify(context)); } catch (_) { return { value: String(context) }; }
  }
  return { value: String(context) };
}

function createLogger({ logsDir, level = 'INFO', source = 'application', clock = () => new Date() }) {
  const threshold = RANK[level];
  if (!threshold) throw new Error(`Unsupported log level: ${level}`);
  fs.mkdirSync(logsDir, { recursive: true });
  const logFile = path.join(logsDir, `vnext-${clock().toISOString().slice(0, 10)}.log`);

  function write(severity, message, context) {
    if (RANK[severity] < threshold) return;
    const entry = {
      timestamp: clock().toISOString(),
      severity,
      source,
      message: String(message)
    };
    const extra = safeContext(context);
    if (extra !== undefined) entry.context = extra;
    fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, 'utf8');
  }

  return Object.freeze({
    file: logFile,
    debug: (message, context) => write('DEBUG', message, context),
    info: (message, context) => write('INFO', message, context),
    warn: (message, context) => write('WARN', message, context),
    error: (message, context) => write('ERROR', message, context)
  });
}

module.exports = { createLogger };
