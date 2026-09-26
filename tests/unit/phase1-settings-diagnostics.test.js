'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { SettingsStore } = require('../../src/core/settings-store');
const { ensureStorage } = require('../../src/core/storage');
const { createDiagnosticsReport, ensureDiagnosticsFolder } = require('../../src/services/diagnostics/diagnostics-service');

test('P1-12 settings persistence stores only approved non-secret keys outside the app package', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-settings-'));
  const file = path.join(root, 'Config', 'settings.json');
  const store = new SettingsStore(file, { clock: () => new Date('2026-09-26T00:00:00.000Z') });
  const saved = store.save({ storagePath: path.join(root, 'Storage'), loggingLevel: 'debug', portalPassword: 'do-not-store', token: 'nope' });
  assert.equal(saved.loggingLevel, 'DEBUG');
  assert.equal(saved.portalPassword, undefined);
  assert.equal(saved.token, undefined);
  const reloaded = new SettingsStore(file).load();
  assert.equal(reloaded.storagePath, path.join(root, 'Storage'));
  assert.equal(reloaded.loggingLevel, 'DEBUG');
});

test('P1-13 diagnostics generation reports runtime and storage health without environment variables or secrets', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-diag-'));
  const storage = path.join(root, 'Storage');
  ensureStorage(storage);
  const report = createDiagnosticsReport({
    storageRoot: storage,
    appInfo: { version: '5.0.0-rc.2', packaged: false, environment: 'test', electronVersion: '31.x' },
    billSessionId: 'bill-session-1',
    applicationState: { currentBill: { billSessionId: 'bill-session-1' } },
    python: { spawnSync: () => ({ status: 0, stdout: 'Python 3.11.2\n' }) },
    clock: () => new Date('2026-09-26T00:00:00.000Z')
  });
  assert.equal(report.storage.status, 'READY');
  assert.equal(report.currentBillSession, 'bill-session-1');
  assert.equal(report.python.available, true);
  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /password|cookie|token|SECRET_ENV/i);
});

test('P1-14 diagnostics folder is deterministic under Storage/Audit and can be created repeatedly', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-diag-folder-'));
  const storage = path.join(root, 'Storage');
  ensureStorage(storage);
  const first = ensureDiagnosticsFolder(storage);
  const second = ensureDiagnosticsFolder(storage);
  assert.equal(first, path.join(storage, 'Audit', 'Diagnostics'));
  assert.equal(first, second);
  assert.equal(fs.statSync(first).isDirectory(), true);
});
