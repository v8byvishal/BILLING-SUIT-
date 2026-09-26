'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadConfig } = require('../../src/core/config');

test('configuration loads defaults and feature flags', () => {
  const config = loadConfig({ appDir: path.resolve(__dirname, '..', '..') });
  assert.equal(config.environment, 'production');
  assert.equal(config.logging.level, 'INFO');
  assert.equal(config.features.billWorkflow, false);
});

test('configuration rejects relative external Storage paths', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'vnext-config-'));
  const file = path.join(temp, 'config.json');
  fs.writeFileSync(file, JSON.stringify({ storagePath: './unsafe', logging: { level: 'INFO' } }));
  assert.throws(() => loadConfig({ appDir: temp, configFile: file }), /must be absolute/);
});
