'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CANONICAL_STORAGE_FOLDERS = Object.freeze([
  'Source_Bills',
  'Final_Bills',
  'Audit',
  'Failures',
  'Temp',
  'Config'
]);

// Existing runtime folders remain supported for the already-implemented case,
// custom-code, validation, inbox, and completed-bill services. Phase 1 adds the
// canonical folders without removing or renaming historical data locations.
const COMPATIBILITY_STORAGE_FOLDERS = Object.freeze([
  'Supporting_Sections',
  'Logs',
  'Failed',
  'Reports',
  'Custom_Codes',
  'Bills',
  'Inbox',
  'Inbox/Initial',
  'Inbox/Final',
  'Cases'
]);

const STORAGE_FOLDERS = Object.freeze([...CANONICAL_STORAGE_FOLDERS, ...COMPATIBILITY_STORAGE_FOLDERS]);

const STORAGE_STATUS = Object.freeze({
  READY: 'READY',
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  READ_ONLY: 'READ_ONLY',
  ACCESS_ERROR: 'ACCESS_ERROR',
  ERROR: 'ERROR'
});

function isInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveDefaultStoragePath({ appDataPath, documentsPath }) {
  if (appDataPath) return path.join(path.resolve(appDataPath), 'CGHS-Billing-Suite', 'Storage');
  if (documentsPath) return path.join(path.resolve(documentsPath), 'CGHS Billing Suite VNEXT', 'Storage');
  throw new Error('Either appDataPath or documentsPath is required to resolve default Storage');
}

function resolveStoragePath({ configuredPath, appDataPath, documentsPath, appDir }) {
  const root = configuredPath
    ? path.resolve(configuredPath)
    : resolveDefaultStoragePath({ appDataPath, documentsPath });
  if (!path.isAbsolute(root)) throw new Error('Storage path must resolve to an absolute path');
  if (appDir && isInside(root, appDir)) throw new Error('Storage path must be outside the application package');
  return root;
}

function folderState(storagePath) {
  return Object.fromEntries(STORAGE_FOLDERS.map((name) => [name, fs.existsSync(path.join(storagePath, name))]));
}

function probeReadWrite(storagePath) {
  const probe = path.join(storagePath, `.write-probe-${process.pid}-${Date.now()}`);
  fs.writeFileSync(probe, 'ok', { flag: 'wx', mode: 0o600 });
  const readBack = fs.readFileSync(probe, 'utf8');
  fs.unlinkSync(probe);
  if (readBack !== 'ok') throw new Error('Storage read/write probe mismatch');
}

function checkStorageHealth(storagePath, options = {}) {
  const info = {
    path: storagePath,
    status: STORAGE_STATUS.NOT_INITIALIZED,
    writable: false,
    readable: false,
    folders: {},
    canonicalFolders: Object.fromEntries(CANONICAL_STORAGE_FOLDERS.map((name) => [name, false])),
    checked_at: (options.clock || (() => new Date()))().toISOString(),
    error: null
  };

  try {
    if (!storagePath || !path.isAbsolute(storagePath)) {
      return Object.freeze({ ...info, status: STORAGE_STATUS.ERROR, error: 'Storage path must be absolute' });
    }
    if (!fs.existsSync(storagePath)) return Object.freeze(info);
    const stat = fs.statSync(storagePath);
    if (!stat.isDirectory()) {
      return Object.freeze({ ...info, status: STORAGE_STATUS.ACCESS_ERROR, error: 'Storage path exists but is not a directory' });
    }
    info.readable = true;
    info.folders = folderState(storagePath);
    info.canonicalFolders = Object.fromEntries(CANONICAL_STORAGE_FOLDERS.map((name) => [name, info.folders[name] === true]));
    const missingCanonical = Object.values(info.canonicalFolders).some((exists) => !exists);
    if (missingCanonical) return Object.freeze(info);
    try {
      probeReadWrite(storagePath);
      info.writable = true;
      info.status = STORAGE_STATUS.READY;
    } catch (error) {
      info.status = STORAGE_STATUS.READ_ONLY;
      info.error = error.message;
    }
    return Object.freeze(info);
  } catch (error) {
    return Object.freeze({ ...info, status: STORAGE_STATUS.ACCESS_ERROR, error: error.message });
  }
}

function ensureStorage(storagePath) {
  try {
    fs.mkdirSync(storagePath, { recursive: true });
    for (const folder of STORAGE_FOLDERS) fs.mkdirSync(path.join(storagePath, folder), { recursive: true });
    probeReadWrite(storagePath);
    return getStorageInfo(storagePath);
  } catch (error) {
    const status = checkStorageHealth(storagePath);
    const wrapped = new Error(`Storage is not ready: ${error.message}`);
    wrapped.storageStatus = status;
    throw wrapped;
  }
}

function getStorageInfo(storagePath) {
  const health = checkStorageHealth(storagePath);
  return Object.freeze({
    path: storagePath,
    status: health.status,
    writable: health.writable,
    readable: health.readable,
    folders: health.folders,
    canonicalFolders: health.canonicalFolders,
    checked_at: health.checked_at,
    error: health.error
  });
}

function atomicWriteFile(file, content, options = {}) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const tempRoot = options.tempDirectory || directory;
  fs.mkdirSync(tempRoot, { recursive: true });
  const temp = path.join(tempRoot, `${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(String(content));
  const fd = fs.openSync(temp, 'wx', options.mode || 0o600);
  try {
    fs.writeSync(fd, buffer);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
  return file;
}

module.exports = {
  CANONICAL_STORAGE_FOLDERS,
  COMPATIBILITY_STORAGE_FOLDERS,
  STORAGE_FOLDERS,
  STORAGE_STATUS,
  atomicWriteFile,
  checkStorageHealth,
  ensureStorage,
  getStorageInfo,
  isInside,
  resolveDefaultStoragePath,
  resolveStoragePath
};
