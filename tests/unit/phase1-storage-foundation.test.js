'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  CANONICAL_STORAGE_FOLDERS,
  STORAGE_STATUS,
  atomicWriteFile,
  checkStorageHealth,
  ensureStorage,
  resolveDefaultStoragePath,
  resolveStoragePath
} = require('../../src/core/storage');

test('P1-01 canonical Storage folders are created and health reports READY only after read/write probe', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-storage-'));
  const storage = path.join(root, 'Storage');
  assert.equal(checkStorageHealth(storage).status, STORAGE_STATUS.NOT_INITIALIZED);
  const info = ensureStorage(storage);
  assert.equal(info.status, STORAGE_STATUS.READY);
  assert.equal(info.writable, true);
  for (const folder of CANONICAL_STORAGE_FOLDERS) {
    assert.equal(info.canonicalFolders[folder], true);
    assert.equal(fs.statSync(path.join(storage, folder)).isDirectory(), true);
  }
});

test('P1-02 Storage path resolution defaults to application data when available and rejects app package paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-paths-'));
  const appDataPath = path.join(root, 'AppData');
  const documentsPath = path.join(root, 'Documents');
  const appDir = path.join(root, 'Application');
  fs.mkdirSync(appDir);
  assert.equal(resolveDefaultStoragePath({ appDataPath, documentsPath }), path.join(appDataPath, 'CGHS-Billing-Suite', 'Storage'));
  assert.equal(resolveStoragePath({ appDataPath, documentsPath, appDir }), path.join(appDataPath, 'CGHS-Billing-Suite', 'Storage'));
  assert.throws(() => resolveStoragePath({ configuredPath: path.join(appDir, 'Storage'), appDataPath, documentsPath, appDir }), /outside/);
});

test('P1-03 Storage restart persistence preserves existing files and atomic writes do not leave partial final files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-storage-persist-'));
  const storage = path.join(root, 'Storage');
  ensureStorage(storage);
  const marker = path.join(storage, 'Config', 'operator-settings.json');
  atomicWriteFile(marker, '{"ok":true}\n', { tempDirectory: path.join(storage, 'Temp') });
  ensureStorage(storage);
  assert.equal(fs.readFileSync(marker, 'utf8'), '{"ok":true}\n');
  assert.equal(fs.readdirSync(path.join(storage, 'Temp')).filter((name) => name.endsWith('.tmp')).length, 0);
});

test('P1-04 Storage health distinguishes access errors from READY', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase1-storage-error-'));
  const notDirectory = path.join(root, 'Storage');
  fs.writeFileSync(notDirectory, 'not a directory');
  const health = checkStorageHealth(notDirectory);
  assert.equal(health.status, STORAGE_STATUS.ACCESS_ERROR);
  assert.equal(health.writable, false);
});
