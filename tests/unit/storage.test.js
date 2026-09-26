'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { STORAGE_FOLDERS, ensureStorage, isInside, resolveStoragePath } = require('../../src/core/storage');

test('external Storage resolves outside app package and creates every required folder', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vnext-storage-test-'));
  const appDir = path.join(root, 'application');
  const documentsPath = path.join(root, 'documents');
  fs.mkdirSync(appDir);
  const storagePath = resolveStoragePath({ documentsPath, appDir });
  const info = ensureStorage(storagePath);

  assert.equal(isInside(storagePath, appDir), false);
  assert.equal(info.writable, true);
  for (const folder of STORAGE_FOLDERS) {
    assert.equal(info.folders[folder], true);
    assert.equal(fs.statSync(path.join(storagePath, folder)).isDirectory(), true);
  }
});

test('Storage inside the application package is rejected', () => {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vnext-app-test-'));
  assert.throws(() => resolveStoragePath({ configuredPath: path.join(appDir, 'storage'), documentsPath: os.tmpdir(), appDir }), /outside/);
});
