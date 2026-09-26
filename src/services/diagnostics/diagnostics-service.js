'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { StorageService, checkStorageHealth } = require('../../core/storage');

function detectPython(options = {}) {
  const runner = options.spawnSync || spawnSync;
  const candidates = options.candidates || (process.platform === 'win32' ? ['python'] : ['python3', 'python']);
  for (const command of candidates) {
    const result = runner(command, ['--version'], { encoding: 'utf8', timeout: 3000 });
    if (!result.error && result.status === 0) {
      return { available: true, command, version: String(result.stdout || result.stderr || '').trim() };
    }
  }
  return { available: false, command: null, version: null };
}

function ensureDiagnosticsFolder(storageRoot) {
  if (!storageRoot || !path.isAbsolute(storageRoot)) return null;
  const folder = path.join(storageRoot, 'Audit', 'Diagnostics');
  fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function createDiagnosticsReport(context = {}) {
  const storageService = context.storageService || null;
  const storageRoot = context.storageRoot || storageService?.resolveRoot?.() || null;
  const appInfo = context.appInfo || {};
  const storageStatus = storageService
    ? storageService.getStatus({ includeUsage: context.includeUsage !== false })
    : (storageRoot ? { ...checkStorageHealth(storageRoot), manifestStatus: null, manifest: null, recovery: null, usage: null } : { status: 'NOT_INITIALIZED', path: null, writable: false, readable: false });
  const sourceRecords = storageService ? storageService.listSourceBills({ verifyHash: false }) : [];
  const sessions = storageService ? storageService.listBillSessions() : [];
  const auditRecords = storageService ? storageService.listAuditRecords({ limit: 1 }) : [];
  const failures = storageService ? storageService.listFailures({ limit: 1 }) : [];
  return {
    schema_version: 2,
    generated_at: (context.clock || (() => new Date()))().toISOString(),
    app: {
      name: appInfo.name || 'CGHS Billing Suite VNEXT',
      version: appInfo.version || null,
      packaged: appInfo.packaged === true,
      environment: appInfo.environment || process.env.VNEXT_ENV || 'production'
    },
    runtime: {
      electron: appInfo.electronVersion || process.versions.electron || null,
      node: process.version,
      chrome: process.versions.chrome || null,
      platform: process.platform,
      arch: process.arch,
      testMode: process.env.VNEXT_SMOKE_TEST === '1' || process.env.NODE_ENV === 'test'
    },
    python: detectPython(context.python || {}),
    storage: {
      root: storageRoot,
      status: storageStatus.status,
      healthStatus: storageStatus.healthStatus || storageStatus.status,
      manifestStatus: storageStatus.manifestStatus || null,
      writable: storageStatus.writable === true,
      readable: storageStatus.readable === true,
      writeProbe: storageStatus.writeProbe === true,
      tempCreateRemove: storageStatus.tempCreateRemove === true,
      error: storageStatus.error || null,
      canonicalFolders: storageStatus.canonicalFolders || {},
      recovery: storageStatus.recovery || null,
      usage: storageStatus.usage || null,
      recordCounts: {
        sourceBills: sourceRecords.length,
        billSessions: sessions.length,
        auditFilesPresent: auditRecords.length > 0,
        failuresPresent: failures.length > 0
      }
    },
    currentBillSession: context.billSessionId || null,
    applicationState: context.applicationState || null,
    portal: { status: 'NOT VERIFIED' }
  };
}

function writeDiagnosticsReport(storageRoot, report, options = {}) {
  const folder = ensureDiagnosticsFolder(storageRoot);
  if (!folder) throw new Error('Diagnostics folder requires an absolute Storage root');
  const file = path.join(folder, `diagnostics-${(options.timestamp || new Date().toISOString()).replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  return file;
}

module.exports = { createDiagnosticsReport, detectPython, ensureDiagnosticsFolder, writeDiagnosticsReport };
