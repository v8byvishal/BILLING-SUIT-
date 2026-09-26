'use strict';

const fs = require('node:fs');
const path = require('node:path');

const STORAGE_FOLDERS = Object.freeze([
  'Source_Bills',
  'Final_Bills',
  'Supporting_Sections',
  'Logs',
  'Failed',
  'Reports',
  'Custom_Codes',
  'Audit',
  'Bills'
]);

function isInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveStoragePath({ configuredPath, documentsPath, appDir }) {
  const root = configuredPath
    ? path.resolve(configuredPath)
    : path.join(path.resolve(documentsPath), 'CGHS Billing Suite VNEXT', 'Storage');
  if (!path.isAbsolute(root)) throw new Error('Storage path must resolve to an absolute path');
  if (isInside(root, appDir)) throw new Error('Storage path must be outside the application package');
  return root;
}

function ensureStorage(storagePath) {
  fs.mkdirSync(storagePath, { recursive: true });
  for (const folder of STORAGE_FOLDERS) fs.mkdirSync(path.join(storagePath, folder), { recursive: true });

  const probe = path.join(storagePath, `.write-probe-${process.pid}-${Date.now()}`);
  try {
    fs.writeFileSync(probe, 'ok', { flag: 'wx' });
    fs.unlinkSync(probe);
  } catch (error) {
    try { fs.rmSync(probe, { force: true }); } catch (_) { /* best effort */ }
    throw new Error(`Storage is not writable: ${error.message}`);
  }

  return getStorageInfo(storagePath);
}

function getStorageInfo(storagePath) {
  const folders = Object.fromEntries(STORAGE_FOLDERS.map((name) => [name, fs.existsSync(path.join(storagePath, name))]));
  return Object.freeze({ path: storagePath, writable: true, folders });
}

module.exports = { STORAGE_FOLDERS, ensureStorage, getStorageInfo, isInside, resolveStoragePath };
