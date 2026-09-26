'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createLogger } = require('../../src/core/logger');

test('logger initializes and writes structured severity, source, message, and context', () => {
  const logsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vnext-log-test-'));
  const now = new Date('2026-09-26T10:00:00.000Z');
  const logger = createLogger({ logsDir, level: 'DEBUG', source: 'unit-test', clock: () => now });
  logger.info('foundation ready', { safe: true });
  const entry = JSON.parse(fs.readFileSync(logger.file, 'utf8').trim());
  assert.deepEqual(entry, {
    timestamp: now.toISOString(), severity: 'INFO', source: 'unit-test', message: 'foundation ready', context: { safe: true }
  });
});
