'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CANONICAL_STORAGE_FOLDERS,
  OPERATION_STATUS,
  STORAGE_STATUS,
  StorageService,
  checkStorageHealth,
  ensureStorage,
  resolveStoragePath,
  sha256File
} = require('../../src/core/storage');
const { SettingsStore } = require('../../src/core/settings-store');
const { createApplicationStateStore } = require('../../src/core/application-state-store');
const { OPERATIONS, validateOperationRequest } = require('../../src/desktop/ipc-contract');
const { createIpcDispatcher } = require('../../src/desktop/phase1-ipc');

function tempRoot(name = 'phase2-storage-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function service(root, options = {}) {
  let n = 0;
  return new StorageService({ root, idFactory: () => options.ids?.[n++] || `id-${n}`, clock: options.clock || (() => new Date('2026-09-27T00:00:00.000Z')) });
}

function samplePdf(root, name = 'bill.pdf', content = 'PDF sample') {
  const file = path.join(root, name);
  fs.writeFileSync(file, content);
  return file;
}

test('P2-01 storage root resolution uses application data and rejects app package paths', () => {
  const root = tempRoot('phase2-resolve-');
  const appDataPath = path.join(root, 'AppData');
  const documentsPath = path.join(root, 'Documents');
  const appDir = path.join(root, 'App');
  fs.mkdirSync(appDir);
  assert.equal(resolveStoragePath({ appDataPath, documentsPath, appDir }), path.join(appDataPath, 'CGHS-Billing-Suite', 'Storage'));
  assert.throws(() => resolveStoragePath({ configuredPath: path.join(appDir, 'Storage'), appDataPath, documentsPath, appDir }), /outside/);
});

test('P2-02 directory creation includes every canonical folder and compatibility folders remain intact', () => {
  const root = path.join(tempRoot('phase2-dirs-'), 'Storage');
  const s = service(root);
  const status = s.initialize();
  assert.equal(status.status, STORAGE_STATUS.READY);
  for (const folder of CANONICAL_STORAGE_FOLDERS) assert.equal(fs.statSync(path.join(root, folder)).isDirectory(), true);
  assert.equal(fs.statSync(path.join(root, 'Cases')).isDirectory(), true);
  assert.equal(fs.statSync(path.join(root, 'Inbox', 'Initial')).isDirectory(), true);
});

test('P2-03 storage health requires real read/write and temp create/remove verification', () => {
  const root = path.join(tempRoot('phase2-health-'), 'Storage');
  assert.equal(checkStorageHealth(root).status, STORAGE_STATUS.NOT_INITIALIZED);
  const s = service(root);
  s.initialize();
  const health = s.healthCheck();
  assert.equal(health.status, STORAGE_STATUS.READY);
  assert.equal(health.writeProbe, true);
  assert.equal(health.tempCreateRemove, true);
  assert.equal(fs.readdirSync(path.join(root, 'Temp')).filter((name) => name.includes('probe')).length, 0);
});

test('P2-04 manifest is created with schema, root, directory map, and no secrets', () => {
  const root = path.join(tempRoot('phase2-manifest-'), 'Storage');
  const s = service(root);
  s.initialize();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'Config', 'storage-manifest.json'), 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.storageRoot, root);
  assert.equal(manifest.directories.Source_Bills, true);
  assert.doesNotMatch(JSON.stringify(manifest), /password|token|cookie|secret/i);
});

test('P2-05 manifest reload is idempotent and updates validation without replacing createdAt', () => {
  const root = path.join(tempRoot('phase2-manifest-reload-'), 'Storage');
  const s1 = service(root);
  s1.initialize();
  const first = JSON.parse(fs.readFileSync(path.join(root, 'Config', 'storage-manifest.json'), 'utf8'));
  const s2 = new StorageService({ root, clock: () => new Date('2026-09-27T00:01:00.000Z') });
  s2.initialize();
  const second = JSON.parse(fs.readFileSync(path.join(root, 'Config', 'storage-manifest.json'), 'utf8'));
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.lastValidatedAt, '2026-09-27T00:01:00.000Z');
});

test('P2-06 settings persist under Storage/Config with approved non-secret keys only', () => {
  const root = path.join(tempRoot('phase2-settings-'), 'Storage');
  const s = service(root);
  s.initialize();
  const store = new SettingsStore(s.getSettingsPath(), { clock: () => new Date('2026-09-27T00:00:00.000Z') });
  const saved = store.save({ storagePath: root, loggingLevel: 'debug', diagnosticsEnabled: true, password: 'never', token: 'never' });
  assert.equal(saved.loggingLevel, 'DEBUG');
  assert.equal(saved.password, undefined);
  assert.equal(new SettingsStore(s.getSettingsPath()).load().storagePath, root);
});

test('P2-07 phase1 settings migration is idempotent and never overwrites phase2 config', () => {
  const temp = tempRoot('phase2-migrate-');
  const root = path.join(temp, 'Storage');
  const legacy = path.join(temp, 'phase1-settings.json');
  fs.writeFileSync(legacy, JSON.stringify({ storagePath: root, loggingLevel: 'warn', diagnosticsEnabled: true, portalPassword: 'no' }));
  const s = service(root);
  s.initialize({ legacySettingsPath: legacy });
  const migrated = JSON.parse(fs.readFileSync(s.getSettingsPath(), 'utf8'));
  assert.equal(migrated.loggingLevel, 'WARN');
  assert.equal(migrated.portalPassword, undefined);
  fs.writeFileSync(s.getSettingsPath(), JSON.stringify({ schema_version: 1, storagePath: root, loggingLevel: 'ERROR', diagnosticsEnabled: false }));
  s.migrateLegacySettings(legacy);
  assert.equal(JSON.parse(fs.readFileSync(s.getSettingsPath(), 'utf8')).loggingLevel, 'ERROR');
});

test('P2-08 source bill import writes metadata and does not fabricate extracted business fields', () => {
  const root = path.join(tempRoot('phase2-source-meta-'), 'Storage');
  const s = service(root, { ids: ['fixed-session'] });
  s.initialize();
  const file = samplePdf(tempRoot('phase2-input-'), 'source.pdf', 'abc');
  const result = s.importSourceBill(file);
  assert.equal(result.status, 'IMPORTED');
  assert.equal(result.metadata.billSessionId, 'bill-session-fixed-session');
  assert.equal(result.metadata.originalFileName, 'source.pdf');
  assert.equal(result.metadata.mimeType, 'application/pdf');
  assert.equal(result.metadata.patientName, undefined);
  assert.equal(result.metadata.billNumber, undefined);
  assert.equal(result.metadata.pages, undefined);
});

test('P2-09 source bill SHA-256 and size are calculated from the stored imported file', () => {
  const root = path.join(tempRoot('phase2-sha-'), 'Storage');
  const s = service(root);
  s.initialize();
  const file = samplePdf(tempRoot('phase2-input-sha-'), 'source.pdf', 'hash-me');
  const result = s.importSourceBill(file);
  assert.equal(result.metadata.sha256, sha256File(result.paths.sourceFile));
  assert.equal(result.metadata.fileSize, fs.statSync(result.paths.sourceFile).size);
});

test('P2-10 duplicate source detection uses SHA-256 and does not create a second bill session', () => {
  const root = path.join(tempRoot('phase2-dupe-'), 'Storage');
  const s = service(root, { ids: ['one', 'two'] });
  s.initialize();
  const dir = tempRoot('phase2-dupe-input-');
  const first = samplePdf(dir, 'a.pdf', 'same');
  const second = samplePdf(dir, 'renamed.pdf', 'same');
  const imported = s.importSourceBill(first);
  const dupe = s.importSourceBill(second);
  assert.equal(dupe.status, OPERATION_STATUS.DUPLICATE_SOURCE_BILL);
  assert.equal(dupe.billSessionId, imported.billSessionId);
  assert.equal(s.listBillSessions().length, 1);
});

test('P2-11 source bill metadata survives StorageService restart', () => {
  const root = path.join(tempRoot('phase2-source-restart-'), 'Storage');
  const s1 = service(root);
  s1.initialize();
  const imported = s1.importSourceBill(samplePdf(tempRoot('phase2-source-restart-input-'), 'bill.pdf', 'persist'));
  const s2 = service(root);
  s2.initialize();
  const record = s2.getSourceBillRecord(imported.billSessionId, { verifyHash: true });
  assert.equal(record.status, OPERATION_STATUS.SUCCESS);
  assert.equal(record.metadata.sha256, imported.metadata.sha256);
});

test('P2-12 bill session registry persists across restart', () => {
  const root = path.join(tempRoot('phase2-session-restart-'), 'Storage');
  const s1 = service(root);
  s1.initialize();
  const imported = s1.importSourceBill(samplePdf(tempRoot('phase2-session-input-'), 'bill.pdf', 'session'));
  s1.updateBillSession(imported.billSessionId, { status: 'PLAN_READY', enhancementPlanPath: '/external/plan.json' });
  const s2 = service(root);
  s2.initialize();
  const session = s2.readBillSession(imported.billSessionId).session;
  assert.equal(session.status, 'PLAN_READY');
  assert.equal(session.sourceBillId, imported.sourceBillId);
});

test('P2-13 active session reset clears memory but does not delete persisted source/session data', () => {
  const root = path.join(tempRoot('phase2-reset-'), 'Storage');
  const s = service(root);
  s.initialize();
  const imported = s.importSourceBill(samplePdf(tempRoot('phase2-reset-input-'), 'bill.pdf', 'reset'));
  const appState = createApplicationStateStore({ idFactory: () => 'ui', clock: () => new Date('2026-09-27T00:00:00.000Z') });
  appState.startBillSession({ billSessionId: imported.billSessionId, source: imported.metadata });
  appState.resetCurrentBill();
  assert.equal(appState.snapshot().currentBill.status, 'NONE');
  assert.equal(fs.existsSync(imported.paths.sourceFile), true);
  assert.equal(s.readBillSession(imported.billSessionId).status, OPERATION_STATUS.SUCCESS);
});

test('P2-14 audit records persist across restart and are not generated by status reads', () => {
  const root = path.join(tempRoot('phase2-audit-'), 'Storage');
  const s1 = service(root);
  s1.initialize();
  s1.appendAudit({ billSessionId: 'bill-session-1', operation: 'TEST_AUDIT', stage: 'UNIT', status: 'SUCCESS' });
  const before = s1.listAuditRecords().length;
  s1.getStatus();
  const afterStatus = s1.listAuditRecords().length;
  const s2 = service(root);
  s2.initialize();
  assert.equal(before, afterStatus);
  assert.equal(s2.listAuditRecords().some((record) => record.operation === 'TEST_AUDIT'), true);
});

test('P2-15 failure records persist with sanitized messages', () => {
  const root = path.join(tempRoot('phase2-failure-'), 'Storage');
  const s = service(root);
  s.initialize();
  s.appendFailure({ billSessionId: 'bill-session-1', code: 'X', message: 'password=abc token=xyz', recoverable: true });
  const restarted = service(root);
  restarted.initialize();
  const failure = restarted.listFailures()[0];
  assert.equal(failure.code, 'X');
  assert.doesNotMatch(failure.message, /abc|xyz/);
});

test('P2-16 temp file creation is unique and confined to Storage/Temp', () => {
  const root = path.join(tempRoot('phase2-temp-'), 'Storage');
  const s = service(root, { ids: ['a', 'b'] });
  s.initialize();
  const a = s.createTempPath();
  const b = s.createTempPath();
  assert.notEqual(a, b);
  assert.equal(a.startsWith(path.join(root, 'Temp')), true);
});

test('P2-17 startup cleanup removes stale app temp artifacts only', () => {
  const root = path.join(tempRoot('phase2-stale-'), 'Storage');
  const s = service(root);
  s.initialize();
  const temp = path.join(root, 'Temp', 'cghs-temp-old.tmp');
  const userFile = path.join(root, 'Temp', 'operator-note.txt');
  fs.writeFileSync(temp, 'old');
  fs.writeFileSync(userFile, 'keep');
  const oldTime = new Date('2026-09-25T00:00:00.000Z');
  fs.utimesSync(temp, oldTime, oldTime);
  const cleaned = s.cleanupStaleTemp({ olderThanMs: 60 * 60 * 1000, nowMs: new Date('2026-09-27T00:00:00.000Z').getTime() });
  assert.equal(cleaned.removed, 1);
  assert.equal(fs.existsSync(temp), false);
  assert.equal(fs.existsSync(userFile), true);
});

test('P2-18 atomic JSON writes persist complete JSON and leave no application temp artifact behind', () => {
  const root = path.join(tempRoot('phase2-atomic-'), 'Storage');
  const s = service(root);
  s.initialize();
  s.writeJson(path.join('Config', 'atomic.json'), { ok: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'Config', 'atomic.json'), 'utf8')), { ok: true });
  assert.equal(fs.readdirSync(path.join(root, 'Temp')).filter((name) => name.startsWith('cghs-json')).length, 0);
});

test('P2-19 corrupted JSON is detected, preserved, and not replaced with empty data', () => {
  const root = path.join(tempRoot('phase2-corrupt-'), 'Storage');
  const s = service(root);
  s.initialize();
  const file = path.join(root, 'Source_Bills', 'bad-session', 'metadata.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json');
  const record = s.getSourceBillRecord('bad-session');
  assert.equal(record.status, OPERATION_STATUS.CORRUPT);
  assert.equal(fs.existsSync(record.paths.corrupt), true);
  assert.equal(fs.readFileSync(file, 'utf8'), '{not json');
});

test('P2-20 missing stored source PDF is reported without deleting metadata', () => {
  const root = path.join(tempRoot('phase2-missing-'), 'Storage');
  const s = service(root);
  s.initialize();
  const imported = s.importSourceBill(samplePdf(tempRoot('phase2-missing-input-'), 'bill.pdf', 'missing'));
  fs.unlinkSync(imported.paths.sourceFile);
  const record = s.getSourceBillRecord(imported.billSessionId);
  assert.equal(record.status, 'MISSING');
  assert.equal(fs.existsSync(imported.paths.metadata), true);
});

test('P2-21 safe folder opening validates allowlisted keys', async () => {
  const root = path.join(tempRoot('phase2-open-'), 'Storage');
  const s = service(root);
  s.initialize();
  const opened = await s.openFolder('Source_Bills', (folder) => `opened:${folder}`);
  assert.equal(opened.path, path.join(root, 'Source_Bills'));
  assert.throws(() => s.openFolder('../../etc'), /Unsupported Storage folder/);
});

test('P2-22 invalid IPC storage operation is rejected before dispatch', async () => {
  assert.throws(() => validateOperationRequest({ operation: 'storage.openShell', payload: { command: 'calc' } }), /Unsupported IPC operation/);
  const dispatch = createIpcDispatcher({ [OPERATIONS.STORAGE_OPEN_FOLDER]: () => ({ ok: true }) });
  await assert.rejects(() => dispatch({ operation: 'storage.openShell', payload: {} }), /Unsupported IPC operation/);
});

test('P2-23 storage unavailable handling reports ACCESS_ERROR and ensureStorage fails safely', () => {
  const root = tempRoot('phase2-unavailable-');
  const notDirectory = path.join(root, 'Storage');
  fs.writeFileSync(notDirectory, 'not a directory');
  const s = service(notDirectory);
  const status = s.initialize();
  assert.equal(status.status, STORAGE_STATUS.ACCESS_ERROR);
  assert.throws(() => ensureStorage(notDirectory), /Storage is not ready/);
});

test('P2-24 configured external Storage inside packaged app directory is refused', () => {
  const root = tempRoot('phase2-appdir-');
  const appDir = path.join(root, 'App');
  fs.mkdirSync(appDir);
  assert.throws(() => new StorageService({ configuredPath: path.join(appDir, 'Storage'), appDir, appDataPath: path.join(root, 'Data') }).resolveRoot(), /outside/);
});

test('P2-25 corrupted settings are reported and preserved instead of silently reset', () => {
  const root = path.join(tempRoot('phase2-settings-corrupt-'), 'Storage');
  const s = service(root);
  s.initialize();
  fs.writeFileSync(s.getSettingsPath(), '{bad settings');
  const loaded = new SettingsStore(s.getSettingsPath()).load();
  assert.equal(loaded.status, 'CORRUPT');
  assert.equal(fs.existsSync(loaded.recoveryPath), true);
  assert.equal(fs.readFileSync(s.getSettingsPath(), 'utf8'), '{bad settings');
});

test('P2-26 final bill placeholder and real final-bill storage mechanism use Final_Bills without fabricating output', () => {
  const root = path.join(tempRoot('phase2-final-'), 'Storage');
  const s = service(root);
  s.initialize();
  const placeholder = s.ensureFinalBillPlaceholder('bill-session-final');
  assert.equal(placeholder.metadata.status, 'NOT_GENERATED');
  assert.equal(placeholder.metadata.path, null);
  const finalPdf = samplePdf(tempRoot('phase2-final-input-'), 'final.pdf', 'real final bytes');
  const stored = s.storeFinalBillFile('bill-session-final', finalPdf, { originalFileName: 'final.pdf', overwrite: true });
  assert.equal(stored.status, OPERATION_STATUS.SUCCESS);
  assert.equal(stored.metadata.sha256, sha256File(stored.paths.finalBill));
  assert.equal(fs.existsSync(path.join(root, 'Final_Bills', 'bill-session-final', 'final-bill.pdf')), true);
});
