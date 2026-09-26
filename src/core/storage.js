'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const STORAGE_SCHEMA_VERSION = 1;
const STORAGE_MANIFEST_FILE = path.join('Config', 'storage-manifest.json');
const SETTINGS_FILE = path.join('Config', 'application-settings.json');
const SOURCE_INDEX_FILE = path.join('Config', 'source-bills-index.json');
const BILL_SESSION_DIR = path.join('Config', 'bill-sessions');

const CANONICAL_STORAGE_FOLDERS = Object.freeze([
  'Source_Bills',
  'Final_Bills',
  'Audit',
  'Failures',
  'Temp',
  'Config'
]);

// Existing runtime folders remain supported for the already-implemented case,
// custom-code, validation, inbox, and completed-bill services. Phase 2 keeps
// these compatibility folders until the consuming services are migrated and
// regression-tested in later controlled phases.
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
const STORAGE_FOLDER_SET = new Set(STORAGE_FOLDERS);

const STORAGE_STATUS = Object.freeze({
  NOT_INITIALIZED: 'NOT_INITIALIZED',
  INITIALIZING: 'INITIALIZING',
  READY: 'READY',
  READ_ONLY: 'READ_ONLY',
  ACCESS_ERROR: 'ACCESS_ERROR',
  CORRUPT: 'CORRUPT',
  ERROR: 'ERROR'
});

const OPERATION_STATUS = Object.freeze({
  SUCCESS: 'SUCCESS',
  DUPLICATE: 'DUPLICATE',
  DUPLICATE_SOURCE_BILL: 'DUPLICATE_SOURCE_BILL',
  NOT_FOUND: 'NOT_FOUND',
  INVALID: 'INVALID',
  CORRUPT: 'CORRUPT',
  READ_ONLY: 'READ_ONLY',
  ACCESS_ERROR: 'ACCESS_ERROR',
  IO_ERROR: 'IO_ERROR'
});

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

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

function iso(clock) {
  return (clock || (() => new Date()))().toISOString();
}

function sanitizeRecord(value) {
  if (value == null) return null;
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (/password|credential|cookie|token|secret|api[_-]?key|auth/i.test(key)) return '[REDACTED]';
      if (typeof item === 'function') return undefined;
      return item;
    }));
  } catch (_) {
    return String(value);
  }
}

function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function folderState(storagePath) {
  return Object.fromEntries(STORAGE_FOLDERS.map((name) => [name, fs.existsSync(path.join(storagePath, name))]));
}

function createProbePath(storagePath) {
  const tempDir = path.join(storagePath, 'Temp');
  if (fs.existsSync(tempDir) && fs.statSync(tempDir).isDirectory()) {
    return path.join(tempDir, `cghs-probe-${crypto.randomUUID()}.tmp`);
  }
  return path.join(storagePath, `.write-probe-${process.pid}-${Date.now()}-${crypto.randomUUID()}`);
}

function probeReadWrite(storagePath) {
  const probe = createProbePath(storagePath);
  fs.writeFileSync(probe, 'ok', { flag: 'wx', mode: 0o600 });
  const readBack = fs.readFileSync(probe, 'utf8');
  fs.unlinkSync(probe);
  if (readBack !== 'ok') throw new Error('Storage read/write probe mismatch');
}

function atomicWriteFile(file, content, options = {}) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const tempRoot = options.tempDirectory || directory;
  fs.mkdirSync(tempRoot, { recursive: true });
  const temp = path.join(tempRoot, `cghs-json-${path.basename(file)}-${crypto.randomUUID()}.tmp`);
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

function checkStorageHealth(storagePath, options = {}) {
  const clock = options.clock || (() => new Date());
  const info = {
    path: storagePath,
    status: STORAGE_STATUS.NOT_INITIALIZED,
    writable: false,
    readable: false,
    writeProbe: false,
    tempCreateRemove: false,
    folders: {},
    canonicalFolders: Object.fromEntries(CANONICAL_STORAGE_FOLDERS.map((name) => [name, false])),
    checked_at: iso(clock),
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
    fs.readdirSync(storagePath);
    info.readable = true;
    info.folders = folderState(storagePath);
    info.canonicalFolders = Object.fromEntries(CANONICAL_STORAGE_FOLDERS.map((name) => [name, info.folders[name] === true]));
    const missingCanonical = Object.values(info.canonicalFolders).some((exists) => !exists);
    if (missingCanonical) return Object.freeze(info);
    try {
      probeReadWrite(storagePath);
      info.writable = true;
      info.writeProbe = true;
      info.tempCreateRemove = true;
      info.status = STORAGE_STATUS.READY;
    } catch (error) {
      info.status = STORAGE_STATUS.READ_ONLY;
      info.error = error.message;
    }
    if (fs.existsSync(path.join(storagePath, STORAGE_MANIFEST_FILE))) {
      try { JSON.parse(fs.readFileSync(path.join(storagePath, STORAGE_MANIFEST_FILE), 'utf8')); }
      catch (error) { info.status = STORAGE_STATUS.CORRUPT; info.error = `Storage manifest is corrupt: ${error.message}`; }
    }
    return Object.freeze(info);
  } catch (error) {
    return Object.freeze({ ...info, status: STORAGE_STATUS.ACCESS_ERROR, error: error.message });
  }
}

class StorageService {
  constructor(options = {}) {
    this.root = options.root || options.storagePath || null;
    this.configuredPath = options.configuredPath || this.root || null;
    this.appDataPath = options.appDataPath || null;
    this.documentsPath = options.documentsPath || null;
    this.appDir = options.appDir || null;
    this.clock = options.clock || (() => new Date());
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    this.status = STORAGE_STATUS.NOT_INITIALIZED;
    this.manifestStatus = STORAGE_STATUS.NOT_INITIALIZED;
    this.recoverySummary = {
      checkedAt: null,
      staleTempFiles: 0,
      repairedMetadata: 0,
      detectedCorruption: 0,
      warnings: []
    };
  }

  now() { return iso(this.clock); }

  resolveRoot() {
    if (!this.root) {
      this.root = resolveStoragePath({
        configuredPath: this.configuredPath,
        appDataPath: this.appDataPath,
        documentsPath: this.documentsPath,
        appDir: this.appDir
      });
    }
    return this.root;
  }

  assertRoot() {
    const root = this.resolveRoot();
    if (!path.isAbsolute(root)) throw new Error('Storage root must be absolute');
    if (this.appDir && isInside(root, this.appDir)) throw new Error('Storage root must be outside the application package');
    return root;
  }

  getFolderPath(folderKey) {
    if (!STORAGE_FOLDER_SET.has(folderKey)) throw new Error(`Unsupported Storage folder: ${folderKey}`);
    return path.join(this.assertRoot(), folderKey);
  }

  resolveManagedPath(file) {
    const root = this.assertRoot();
    const resolved = path.isAbsolute(file) ? path.resolve(file) : path.join(root, file);
    if (!isInside(resolved, root)) throw new Error('Storage path must remain inside the configured Storage root');
    return resolved;
  }

  ensureDirectories() {
    const root = this.assertRoot();
    fs.mkdirSync(root, { recursive: true });
    for (const folder of STORAGE_FOLDERS) fs.mkdirSync(path.join(root, folder), { recursive: true });
    fs.mkdirSync(path.join(root, BILL_SESSION_DIR), { recursive: true });
    return folderState(root);
  }

  initialize(options = {}) {
    this.status = STORAGE_STATUS.INITIALIZING;
    try {
      this.ensureDirectories();
      this.recoverySummary = this.runStartupRecovery(options.recovery || {});
      const manifestResult = this.ensureManifest();
      this.manifestStatus = manifestResult.status === OPERATION_STATUS.CORRUPT ? STORAGE_STATUS.CORRUPT : STORAGE_STATUS.READY;
      if (options.legacySettingsPath) this.migrateLegacySettings(options.legacySettingsPath);
      const health = this.healthCheck();
      this.status = this.manifestStatus === STORAGE_STATUS.CORRUPT ? STORAGE_STATUS.CORRUPT : health.status;
      return this.getStatus({ includeUsage: options.includeUsage === true });
    } catch (error) {
      const health = checkStorageHealth(this.root || this.configuredPath || '', { clock: this.clock });
      this.status = health.status === STORAGE_STATUS.NOT_INITIALIZED ? STORAGE_STATUS.ACCESS_ERROR : health.status;
      return { ...health, status: this.status, manifestStatus: this.manifestStatus, recovery: clone(this.recoverySummary), error: error.message };
    }
  }

  healthCheck() {
    return checkStorageHealth(this.assertRoot(), { clock: this.clock });
  }

  getManifestPath() { return this.resolveManagedPath(STORAGE_MANIFEST_FILE); }
  getSettingsPath() { return this.resolveManagedPath(SETTINGS_FILE); }
  getSourceIndexPath() { return this.resolveManagedPath(SOURCE_INDEX_FILE); }
  getBillSessionPath(billSessionId) { return this.resolveManagedPath(path.join(BILL_SESSION_DIR, `${safeName(billSessionId)}.json`)); }

  createManifest() {
    const root = this.assertRoot();
    const timestamp = this.now();
    return {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      product: 'CGHS Billing Suite',
      createdAt: timestamp,
      lastValidatedAt: timestamp,
      storageRoot: root,
      directories: Object.fromEntries(CANONICAL_STORAGE_FOLDERS.map((folder) => [folder, fs.existsSync(path.join(root, folder))]))
    };
  }

  ensureManifest() {
    const file = this.getManifestPath();
    if (!fs.existsSync(file)) {
      const manifest = this.createManifest();
      this.writeJson(file, manifest);
      return { status: OPERATION_STATUS.SUCCESS, manifest, created: true };
    }
    const loaded = this.readJson(file, { preserveCorrupt: true });
    if (loaded.status === OPERATION_STATUS.CORRUPT) {
      this.recoverySummary.detectedCorruption += 1;
      this.recoverySummary.warnings.push(`Storage manifest is corrupt: ${loaded.error}`);
      return loaded;
    }
    const manifest = { ...loaded.value, schemaVersion: loaded.value.schemaVersion || STORAGE_SCHEMA_VERSION, lastValidatedAt: this.now(), storageRoot: this.assertRoot() };
    manifest.directories = Object.fromEntries(CANONICAL_STORAGE_FOLDERS.map((folder) => [folder, fs.existsSync(path.join(this.assertRoot(), folder))]));
    this.writeJson(file, manifest);
    return { status: OPERATION_STATUS.SUCCESS, manifest, created: false };
  }

  getStatus(options = {}) {
    const health = this.healthCheck();
    const manifest = this.readJson(this.getManifestPath(), { fallback: null, preserveCorrupt: true });
    const status = manifest.status === OPERATION_STATUS.CORRUPT ? STORAGE_STATUS.CORRUPT : (this.status === STORAGE_STATUS.INITIALIZING ? STORAGE_STATUS.INITIALIZING : health.status);
    return Object.freeze({
      path: this.assertRoot(),
      status,
      healthStatus: health.status,
      writable: health.writable,
      readable: health.readable,
      writeProbe: health.writeProbe,
      tempCreateRemove: health.tempCreateRemove,
      folders: health.folders,
      canonicalFolders: health.canonicalFolders,
      manifestStatus: manifest.status === OPERATION_STATUS.CORRUPT ? STORAGE_STATUS.CORRUPT : (manifest.value ? STORAGE_STATUS.READY : STORAGE_STATUS.NOT_INITIALIZED),
      manifest: manifest.value || null,
      checked_at: health.checked_at,
      recovery: clone(this.recoverySummary),
      usage: options.includeUsage ? this.getUsageSummary() : null,
      error: manifest.status === OPERATION_STATUS.CORRUPT ? manifest.error : health.error
    });
  }

  writeFile(file, content, options = {}) {
    const target = this.resolveManagedPath(file);
    if (options.atomic === false) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, { mode: options.mode || 0o600 });
      return target;
    }
    return atomicWriteFile(target, content, { tempDirectory: this.getFolderPath('Temp'), mode: options.mode || 0o600 });
  }

  readFile(file, options = {}) {
    const target = this.resolveManagedPath(file);
    if (!fs.existsSync(target)) {
      if (Object.prototype.hasOwnProperty.call(options, 'fallback')) return options.fallback;
      const error = new Error(`Storage file not found: ${path.relative(this.assertRoot(), target)}`);
      error.status = OPERATION_STATUS.NOT_FOUND;
      throw error;
    }
    return fs.readFileSync(target, options.encoding || null);
  }

  writeJson(file, value, options = {}) {
    return this.writeFile(file, `${JSON.stringify(sanitizeRecord(value), null, 2)}\n`, options);
  }

  readJson(file, options = {}) {
    const target = this.resolveManagedPath(file);
    if (!fs.existsSync(target)) return { status: OPERATION_STATUS.NOT_FOUND, value: Object.prototype.hasOwnProperty.call(options, 'fallback') ? options.fallback : null, path: target };
    try {
      return { status: OPERATION_STATUS.SUCCESS, value: JSON.parse(fs.readFileSync(target, 'utf8')), path: target };
    } catch (error) {
      let preservedPath = null;
      if (options.preserveCorrupt !== false) preservedPath = this.preserveCorruptArtifact(target);
      return { status: OPERATION_STATUS.CORRUPT, value: Object.prototype.hasOwnProperty.call(options, 'fallback') ? options.fallback : null, path: target, preservedPath, error: error.message };
    }
  }

  preserveCorruptArtifact(file) {
    try {
      const marker = `${file}.corrupt-${this.now().replace(/[:.]/g, '-')}`;
      if (!fs.existsSync(marker)) fs.copyFileSync(file, marker);
      return marker;
    } catch (_) {
      return null;
    }
  }

  copyFile(source, destination, options = {}) {
    const target = this.resolveManagedPath(destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = this.createTempPath({ prefix: options.prefix || 'copy', extension: path.extname(target) || '.tmp' });
    fs.copyFileSync(source, temp);
    if (options.sha256 && sha256File(temp) !== options.sha256) {
      this.deleteTempFile(temp);
      throw new Error('Copied file SHA-256 does not match expected value');
    }
    if (options.size != null && fs.statSync(temp).size !== options.size) {
      this.deleteTempFile(temp);
      throw new Error('Copied file size does not match expected value');
    }
    if (fs.existsSync(target) && options.overwrite !== true) {
      this.deleteTempFile(temp);
      const error = new Error('Target Storage file already exists');
      error.status = OPERATION_STATUS.DUPLICATE;
      throw error;
    }
    fs.renameSync(temp, target);
    return target;
  }

  moveFile(source, destination, options = {}) {
    const target = this.resolveManagedPath(destination);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target) && options.overwrite !== true) {
      const error = new Error('Target Storage file already exists');
      error.status = OPERATION_STATUS.DUPLICATE;
      throw error;
    }
    fs.renameSync(source, target);
    return target;
  }

  createTempPath(options = {}) {
    const extension = options.extension || '.tmp';
    const prefix = String(options.prefix || 'temp').replace(/[^a-z0-9_-]/gi, '-');
    return path.join(this.getFolderPath('Temp'), `cghs-${prefix}-${safeName(this.idFactory())}${extension.startsWith('.') ? extension : `.${extension}`}`);
  }

  deleteTempFile(file) {
    const target = path.resolve(file);
    const tempRoot = this.getFolderPath('Temp');
    if (!isInside(target, tempRoot)) throw new Error('Refusing to delete a temp file outside Storage/Temp');
    const name = path.basename(target);
    if (!isApplicationTempName(name)) throw new Error('Refusing to delete a non-application temp file');
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return { status: OPERATION_STATUS.SUCCESS, path: target };
  }

  cleanupStaleTemp(options = {}) {
    const tempRoot = this.getFolderPath('Temp');
    const olderThanMs = options.olderThanMs ?? 24 * 60 * 60 * 1000;
    const nowMs = options.nowMs ?? this.clock().getTime();
    let removed = 0;
    const warnings = [];
    for (const name of fs.existsSync(tempRoot) ? fs.readdirSync(tempRoot) : []) {
      const file = path.join(tempRoot, name);
      try {
        if (!fs.statSync(file).isFile()) continue;
        if (!isApplicationTempName(name)) continue;
        const stat = fs.statSync(file);
        if (nowMs - stat.mtimeMs < olderThanMs) continue;
        fs.unlinkSync(file);
        removed += 1;
      } catch (error) {
        warnings.push(`Temp cleanup skipped ${name}: ${error.message}`);
      }
    }
    return { removed, warnings };
  }

  runStartupRecovery(options = {}) {
    const summary = { checkedAt: this.now(), staleTempFiles: 0, repairedMetadata: 0, detectedCorruption: 0, warnings: [] };
    try {
      const cleanup = this.cleanupStaleTemp({ olderThanMs: options.staleTempMs ?? 24 * 60 * 60 * 1000 });
      summary.staleTempFiles = cleanup.removed;
      summary.warnings.push(...cleanup.warnings);
    } catch (error) {
      summary.warnings.push(`Temp recovery failed: ${error.message}`);
    }
    for (const file of this.metadataFilesForRecovery()) {
      const result = this.readJson(file, { fallback: null, preserveCorrupt: true });
      if (result.status === OPERATION_STATUS.CORRUPT) {
        summary.detectedCorruption += 1;
        summary.warnings.push(`Corrupt JSON preserved: ${path.relative(this.assertRoot(), file)}`);
      }
    }
    return summary;
  }

  metadataFilesForRecovery() {
    const files = [this.getManifestPath(), this.getSourceIndexPath(), this.getSettingsPath()];
    const sessions = path.join(this.assertRoot(), BILL_SESSION_DIR);
    if (fs.existsSync(sessions)) for (const name of fs.readdirSync(sessions)) if (name.endsWith('.json')) files.push(path.join(sessions, name));
    const sourceRoot = this.getFolderPath('Source_Bills');
    if (fs.existsSync(sourceRoot)) {
      for (const id of fs.readdirSync(sourceRoot)) {
        const candidate = path.join(sourceRoot, id, 'metadata.json');
        if (fs.existsSync(candidate)) files.push(candidate);
      }
    }
    return files.filter((file, index, array) => array.indexOf(file) === index && fs.existsSync(file));
  }

  migrateLegacySettings(legacyFile) {
    const target = this.getSettingsPath();
    if (!legacyFile || !fs.existsSync(legacyFile) || fs.existsSync(target)) return { status: OPERATION_STATUS.NOT_FOUND, migrated: false };
    try {
      const raw = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
      const migrated = {
        schema_version: STORAGE_SCHEMA_VERSION,
        storagePath: raw.storagePath || this.assertRoot(),
        loggingLevel: String(raw.loggingLevel || 'INFO').toUpperCase(),
        diagnosticsEnabled: raw.diagnosticsEnabled !== false,
        migratedFrom: 'phase1-settings',
        migratedAt: this.now()
      };
      this.writeJson(target, migrated);
      this.recoverySummary.repairedMetadata += 1;
      return { status: OPERATION_STATUS.SUCCESS, migrated: true, path: target };
    } catch (error) {
      this.recoverySummary.detectedCorruption += 1;
      this.recoverySummary.warnings.push(`Legacy settings migration failed: ${error.message}`);
      return { status: OPERATION_STATUS.CORRUPT, migrated: false, error: error.message };
    }
  }

  loadSourceIndex() {
    const file = this.getSourceIndexPath();
    const loaded = this.readJson(file, { fallback: null, preserveCorrupt: true });
    if (loaded.status === OPERATION_STATUS.SUCCESS) return loaded.value;
    if (loaded.status === OPERATION_STATUS.CORRUPT) return { schemaVersion: STORAGE_SCHEMA_VERSION, bySha256: {}, corrupt: true, error: loaded.error };
    const index = this.rebuildSourceIndex();
    this.writeJson(file, index);
    return index;
  }

  rebuildSourceIndex() {
    const bySha256 = {};
    for (const record of this.listSourceBills({ verifyHash: false })) {
      if (record.metadata?.sha256 && record.status !== OPERATION_STATUS.CORRUPT) bySha256[record.metadata.sha256] = record.metadata.billSessionId;
    }
    return { schemaVersion: STORAGE_SCHEMA_VERSION, updatedAt: this.now(), bySha256 };
  }

  saveSourceIndex(index) {
    const next = { schemaVersion: STORAGE_SCHEMA_VERSION, updatedAt: this.now(), bySha256: { ...(index.bySha256 || {}) } };
    this.writeJson(this.getSourceIndexPath(), next);
    return next;
  }

  importSourceBill(sourceFile, options = {}) {
    const started = Date.now();
    const originalFileName = options.originalFileName || path.basename(sourceFile);
    try {
      if (!fs.existsSync(sourceFile)) return { status: OPERATION_STATUS.NOT_FOUND, code: 'SOURCE_NOT_FOUND', message: 'Source PDF does not exist' };
      const sourceStat = fs.statSync(sourceFile);
      if (!sourceStat.isFile()) return { status: OPERATION_STATUS.INVALID, code: 'SOURCE_NOT_FILE', message: 'Source path is not a file' };
      const index = this.loadSourceIndex();
      const sourceHash = sha256File(sourceFile);
      const existingId = index.bySha256?.[sourceHash];
      if (existingId) {
        const existing = this.getSourceBillRecord(existingId, { verifyHash: true });
        if (existing.status === OPERATION_STATUS.SUCCESS) {
          this.appendAudit({ billSessionId: existingId, operation: 'SOURCE_BILL_IMPORT', stage: 'STORAGE', status: OPERATION_STATUS.DUPLICATE_SOURCE_BILL, durationMs: Date.now() - started, sourceRef: { originalFileName, sha256: sourceHash } });
          return { status: OPERATION_STATUS.DUPLICATE_SOURCE_BILL, duplicate: true, billSessionId: existingId, metadata: existing.metadata, paths: existing.paths };
        }
        return { status: existing.status, duplicate: true, billSessionId: existingId, metadata: existing.metadata || null, paths: existing.paths || null, message: existing.error || 'Existing source record is unavailable' };
      }

      const billSessionId = options.billSessionId || `bill-session-${this.idFactory()}`;
      const sourceBillId = billSessionId;
      const directory = this.resolveManagedPath(path.join('Source_Bills', safeName(billSessionId)));
      if (fs.existsSync(directory)) return { status: OPERATION_STATUS.DUPLICATE, code: 'BILL_SESSION_EXISTS', billSessionId, message: 'Bill session directory already exists' };
      fs.mkdirSync(directory, { recursive: true });
      const temp = this.createTempPath({ prefix: 'source-bill', extension: '.pdf' });
      fs.copyFileSync(sourceFile, temp);
      const fileSize = fs.statSync(temp).size;
      const copiedHash = sha256File(temp);
      if (copiedHash !== sourceHash || fileSize !== sourceStat.size) {
        this.deleteTempFile(temp);
        return { status: OPERATION_STATUS.IO_ERROR, code: 'SOURCE_COPY_INTEGRITY_FAILED', message: 'Source copy failed integrity verification' };
      }
      const storedFileName = 'source.pdf';
      const storedPath = path.join(directory, storedFileName);
      fs.renameSync(temp, storedPath);
      const metadata = {
        schemaVersion: STORAGE_SCHEMA_VERSION,
        billSessionId,
        sourceBillId,
        originalFileName,
        storedFileName,
        importedAt: this.now(),
        fileSize,
        sha256: copiedHash,
        mimeType: 'application/pdf',
        status: 'IMPORTED'
      };
      this.writeJson(path.join(directory, 'metadata.json'), metadata);
      index.bySha256 = index.bySha256 || {};
      index.bySha256[copiedHash] = billSessionId;
      this.saveSourceIndex(index);
      this.writeBillSession({ billSessionId, sourceBillId, status: 'SOURCE_IMPORTED', sourcePath: storedPath, finalBillPath: null, enhancementPlanPath: null });
      this.ensureFinalBillPlaceholder(billSessionId);
      this.appendAudit({ billSessionId, operation: 'SOURCE_BILL_IMPORT', stage: 'STORAGE', status: OPERATION_STATUS.SUCCESS, durationMs: Date.now() - started, sourceRef: { originalFileName, sha256: copiedHash, storedPath } });
      return { status: 'IMPORTED', billSessionId, sourceBillId, metadata, paths: { directory, sourceFile: storedPath, metadata: path.join(directory, 'metadata.json') } };
    } catch (error) {
      const failure = this.appendFailure({ billSessionId: options.billSessionId || null, stage: 'STORAGE', code: error.code || OPERATION_STATUS.IO_ERROR, message: error.message, recoverable: true });
      return { status: OPERATION_STATUS.IO_ERROR, code: error.code || OPERATION_STATUS.IO_ERROR, message: error.message, failure };
    }
  }

  getSourceBillDirectory(billSessionId) {
    return this.resolveManagedPath(path.join('Source_Bills', safeName(billSessionId)));
  }

  getSourceBillRecord(billSessionId, options = {}) {
    const directory = this.getSourceBillDirectory(billSessionId);
    const metadataFile = path.join(directory, 'metadata.json');
    const loaded = this.readJson(metadataFile, { fallback: null, preserveCorrupt: true });
    if (loaded.status === OPERATION_STATUS.NOT_FOUND) return { status: OPERATION_STATUS.NOT_FOUND, billSessionId, paths: { directory, metadata: metadataFile } };
    if (loaded.status === OPERATION_STATUS.CORRUPT) return { status: OPERATION_STATUS.CORRUPT, billSessionId, paths: { directory, metadata: metadataFile, corrupt: loaded.preservedPath }, error: loaded.error };
    const metadata = loaded.value;
    const sourceFile = path.join(directory, metadata.storedFileName || 'source.pdf');
    if (!fs.existsSync(sourceFile)) return { status: 'MISSING', metadata: { ...metadata, status: 'MISSING' }, paths: { directory, sourceFile, metadata: metadataFile }, error: 'Stored source PDF is missing' };
    const stat = fs.statSync(sourceFile);
    if (stat.size !== metadata.fileSize) return { status: 'CORRUPTED', metadata: { ...metadata, status: 'CORRUPTED' }, paths: { directory, sourceFile, metadata: metadataFile }, error: 'Stored source PDF size does not match metadata' };
    if (options.verifyHash && sha256File(sourceFile) !== metadata.sha256) return { status: 'CORRUPTED', metadata: { ...metadata, status: 'CORRUPTED' }, paths: { directory, sourceFile, metadata: metadataFile }, error: 'Stored source PDF hash does not match metadata' };
    return { status: OPERATION_STATUS.SUCCESS, metadata, paths: { directory, sourceFile, metadata: metadataFile } };
  }

  writeParseResult(billSessionId, parseResult) {
    const directory = this.getSourceBillDirectory(billSessionId);
    fs.mkdirSync(directory, { recursive: true });
    const file = path.join(directory, 'parse-result.json');
    this.writeJson(file, parseResult);
    return { status: OPERATION_STATUS.SUCCESS, path: file, result: parseResult };
  }

  readParseResult(billSessionId) {
    const file = path.join(this.getSourceBillDirectory(billSessionId), 'parse-result.json');
    const loaded = this.readJson(file, { fallback: null, preserveCorrupt: true });
    if (loaded.status !== OPERATION_STATUS.SUCCESS) return loaded;
    return { status: OPERATION_STATUS.SUCCESS, path: loaded.path, result: loaded.value };
  }

  listSourceBills(options = {}) {
    const root = this.getFolderPath('Source_Bills');
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => this.getSourceBillRecord(entry.name, options))
      .map((record) => {
        const billSessionId = record.metadata?.billSessionId || record.billSessionId || path.basename(record.paths?.directory || '');
        const parse = billSessionId ? this.readParseResult(billSessionId) : null;
        return { ...record, billSessionId, parseResult: parse?.status === OPERATION_STATUS.SUCCESS ? { status: parse.result.status, pageCount: parse.result.pageCount, candidateCount: parse.result.candidateCount, runId: parse.result.runId, parserVersion: parse.result.parserVersion } : null };
      })
      .sort((a, b) => String(b.metadata?.importedAt || '').localeCompare(String(a.metadata?.importedAt || '')));
  }

  writeBillSession(input) {
    const existing = this.readJson(this.getBillSessionPath(input.billSessionId), { fallback: null, preserveCorrupt: true });
    if (existing.status === OPERATION_STATUS.CORRUPT) return existing;
    const now = this.now();
    const value = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      billSessionId: input.billSessionId,
      sourceBillId: input.sourceBillId || existing.value?.sourceBillId || null,
      createdAt: existing.value?.createdAt || input.createdAt || now,
      updatedAt: now,
      status: input.status || existing.value?.status || 'UNKNOWN',
      sourcePath: input.sourcePath ?? existing.value?.sourcePath ?? null,
      enhancementPlanPath: input.enhancementPlanPath ?? existing.value?.enhancementPlanPath ?? null,
      finalBillPath: input.finalBillPath ?? existing.value?.finalBillPath ?? null
    };
    this.writeJson(this.getBillSessionPath(input.billSessionId), value);
    return { status: OPERATION_STATUS.SUCCESS, session: value, path: this.getBillSessionPath(input.billSessionId) };
  }

  updateBillSession(billSessionId, patch) {
    return this.writeBillSession({ ...patch, billSessionId });
  }

  readBillSession(billSessionId) {
    const loaded = this.readJson(this.getBillSessionPath(billSessionId), { fallback: null, preserveCorrupt: true });
    if (loaded.status !== OPERATION_STATUS.SUCCESS) return loaded;
    return { status: OPERATION_STATUS.SUCCESS, session: loaded.value, path: loaded.path };
  }

  listBillSessions() {
    const dir = this.resolveManagedPath(BILL_SESSION_DIR);
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => this.readJson(path.join(dir, name), { fallback: null, preserveCorrupt: true }))
      .map((entry) => entry.status === OPERATION_STATUS.SUCCESS ? { status: OPERATION_STATUS.SUCCESS, session: entry.value, path: entry.path } : entry)
      .sort((a, b) => String(b.session?.updatedAt || '').localeCompare(String(a.session?.updatedAt || '')));
  }

  ensureFinalBillPlaceholder(billSessionId) {
    const dir = this.resolveManagedPath(path.join('Final_Bills', safeName(billSessionId)));
    fs.mkdirSync(dir, { recursive: true });
    const metadataFile = path.join(dir, 'metadata.json');
    if (fs.existsSync(metadataFile)) return { status: OPERATION_STATUS.DUPLICATE, path: metadataFile };
    const metadata = { schemaVersion: STORAGE_SCHEMA_VERSION, billSessionId, status: 'NOT_GENERATED', createdAt: this.now(), path: null, sha256: null };
    this.writeJson(metadataFile, metadata);
    return { status: OPERATION_STATUS.SUCCESS, metadata, path: metadataFile };
  }

  storeFinalBillFile(billSessionId, sourceFile, options = {}) {
    if (!billSessionId) return { status: OPERATION_STATUS.INVALID, message: 'billSessionId is required' };
    if (!fs.existsSync(sourceFile)) return { status: OPERATION_STATUS.NOT_FOUND, message: 'Final bill source file does not exist' };
    const dir = this.resolveManagedPath(path.join('Final_Bills', safeName(billSessionId)));
    fs.mkdirSync(dir, { recursive: true });
    const finalPath = path.join(dir, options.storedFileName || 'final-bill.pdf');
    const stat = fs.statSync(sourceFile);
    const expectedHash = sha256File(sourceFile);
    this.copyFile(sourceFile, path.relative(this.assertRoot(), finalPath), { sha256: expectedHash, size: stat.size, overwrite: options.overwrite === true, prefix: 'final-bill' });
    const metadata = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      billSessionId,
      status: 'IMPORTED',
      createdAt: this.now(),
      originalFileName: options.originalFileName || path.basename(sourceFile),
      storedFileName: path.basename(finalPath),
      path: finalPath,
      fileSize: stat.size,
      sha256: expectedHash,
      mimeType: 'application/pdf'
    };
    this.writeJson(path.join(dir, 'metadata.json'), metadata);
    this.updateBillSession(billSessionId, { finalBillPath: finalPath, status: options.sessionStatus || 'FINAL_BILL_IMPORTED' });
    this.appendAudit({ billSessionId, operation: 'FINAL_BILL_IMPORT', stage: 'STORAGE', status: OPERATION_STATUS.SUCCESS, sourceRef: { finalPath, sha256: expectedHash } });
    return { status: OPERATION_STATUS.SUCCESS, metadata, paths: { directory: dir, finalBill: finalPath, metadata: path.join(dir, 'metadata.json') } };
  }

  appendAudit(input = {}) {
    const record = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      runId: input.runId || `run-${this.idFactory()}`,
      billSessionId: input.billSessionId || null,
      timestamp: input.timestamp || this.now(),
      operation: input.operation || 'UNKNOWN_OPERATION',
      stage: input.stage || 'APPLICATION',
      status: input.status || OPERATION_STATUS.SUCCESS,
      durationMs: input.durationMs ?? 0,
      sourceRef: sanitizeRecord(input.sourceRef || null),
      errorCode: input.errorCode || null
    };
    const date = record.timestamp.slice(0, 10);
    const file = path.join(this.getFolderPath('Audit'), `audit-${date}.jsonl`);
    fs.appendFileSync(file, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    return record;
  }

  listAuditRecords(options = {}) {
    const dir = this.getFolderPath('Audit');
    const limit = options.limit || 100;
    if (!fs.existsSync(dir)) return [];
    const records = [];
    for (const name of fs.readdirSync(dir).filter((item) => item.endsWith('.jsonl')).sort().reverse()) {
      const file = path.join(dir, name);
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        try { records.push(JSON.parse(line)); }
        catch (_) { records.push({ schemaVersion: STORAGE_SCHEMA_VERSION, timestamp: null, operation: 'AUDIT_READ', stage: 'STORAGE', status: OPERATION_STATUS.CORRUPT, errorCode: 'AUDIT_JSON_CORRUPT' }); }
      }
      if (records.length >= limit) break;
    }
    return records.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''))).slice(0, limit);
  }

  appendFailure(input = {}) {
    const failureId = input.failureId || `failure-${this.idFactory()}`;
    const record = {
      schemaVersion: STORAGE_SCHEMA_VERSION,
      failureId,
      runId: input.runId || `run-${this.idFactory()}`,
      billSessionId: input.billSessionId || null,
      timestamp: input.timestamp || this.now(),
      stage: input.stage || 'APPLICATION',
      code: input.code || OPERATION_STATUS.IO_ERROR,
      message: sanitizeFailureMessage(input.message || 'Operation failed'),
      recoverable: input.recoverable !== false,
      diagnosticPath: input.diagnosticPath || null
    };
    this.writeJson(path.join('Failures', `${safeName(failureId)}.json`), record);
    return record;
  }

  listFailures(options = {}) {
    const dir = this.getFolderPath('Failures');
    const limit = options.limit || 100;
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => this.readJson(path.join(dir, name), { fallback: null, preserveCorrupt: true }))
      .map((entry) => entry.status === OPERATION_STATUS.SUCCESS ? entry.value : { status: OPERATION_STATUS.CORRUPT, path: entry.path, error: entry.error })
      .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
      .slice(0, limit);
  }

  openFolder(folderKey, opener) {
    const folder = this.getFolderPath(folderKey);
    fs.mkdirSync(folder, { recursive: true });
    if (typeof opener === 'function') return Promise.resolve(opener(folder)).then((result) => ({ path: folder, result }));
    return { path: folder };
  }

  getUsageSummary() {
    const root = this.assertRoot();
    const categories = {};
    let totalFiles = 0;
    let totalBytes = 0;
    for (const folder of CANONICAL_STORAGE_FOLDERS) {
      const summary = summarizeDirectory(path.join(root, folder));
      categories[folder] = summary;
      totalFiles += summary.fileCount;
      totalBytes += summary.bytes;
    }
    return { checkedAt: this.now(), fileCount: totalFiles, bytes: totalBytes, categories };
  }
}

function sanitizeFailureMessage(message) {
  return String(message).replace(/(password|credential|cookie|token|secret|api[_-]?key|auth)[^\s]*/ig, '$1=[REDACTED]');
}

function safeName(value) {
  return String(value || 'unknown').replace(/[^a-zA-Z0-9._-]/g, '_');
}

function isApplicationTempName(name) {
  return /^cghs-[a-z0-9_-]+-[a-zA-Z0-9._-]+$/i.test(name) || /^\.write-probe-/.test(name);
}

function summarizeDirectory(directory) {
  const summary = { fileCount: 0, bytes: 0 };
  if (!fs.existsSync(directory)) return summary;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const child = summarizeDirectory(file);
      summary.fileCount += child.fileCount;
      summary.bytes += child.bytes;
    } else if (entry.isFile()) {
      const stat = fs.statSync(file);
      summary.fileCount += 1;
      summary.bytes += stat.size;
    }
  }
  return summary;
}

function ensureStorage(storagePath) {
  const service = new StorageService({ root: storagePath });
  const status = service.initialize();
  if (status.status !== STORAGE_STATUS.READY) {
    const wrapped = new Error(`Storage is not ready: ${status.error || status.status}`);
    wrapped.storageStatus = status;
    throw wrapped;
  }
  return getStorageInfo(storagePath);
}

function getStorageInfo(storagePath) {
  const service = new StorageService({ root: storagePath });
  return service.getStatus();
}

module.exports = {
  BILL_SESSION_DIR,
  CANONICAL_STORAGE_FOLDERS,
  COMPATIBILITY_STORAGE_FOLDERS,
  OPERATION_STATUS,
  SETTINGS_FILE,
  SOURCE_INDEX_FILE,
  STORAGE_FOLDERS,
  STORAGE_MANIFEST_FILE,
  STORAGE_SCHEMA_VERSION,
  STORAGE_STATUS,
  StorageService,
  atomicWriteFile,
  checkStorageHealth,
  ensureStorage,
  getStorageInfo,
  isInside,
  resolveDefaultStoragePath,
  resolveStoragePath,
  sanitizeRecord,
  sha256File
};
