'use strict';

const path = require('node:path');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { loadConfig } = require('../core/config');
const { createLogger } = require('../core/logger');
const { createAppState } = require('../core/app-state');
const { ensureStorage, resolveStoragePath } = require('../core/storage');
const { ingestBillPdf } = require('../services/bill-ingestion');
const { createBundledRateRepository, evaluateBill } = require('../services/cghs');
const { adaptEnhancementPlan } = require('../adapters/legacy-portal/plan-adapter');
const { LegacyPythonRunner } = require('../adapters/legacy-portal/python-runner');
const { executeEnhancementPlan } = require('../services/portal/portal-execution-service');

const APP_DIR = path.resolve(__dirname, '..', '..');
let mainWindow = null;
let logger = null;
let config = null;
let storageInfo = null;
let rateRepository = null;
let currentEnhancementPlan = null;
const state = createAppState();

function publicConfig() {
  return Object.freeze({
    environment: config.environment,
    loggingLevel: config.logging.level,
    networkProfile: config.networkProfile,
    features: config.features,
    version: app.getVersion()
  });
}

function registerIpc() {
  ipcMain.handle('app:get-status', () => ({ ready: true, state: state.get(), version: app.getVersion() }));
  ipcMain.handle('storage:get-info', () => storageInfo);
  ipcMain.handle('config:get-public', () => publicConfig());
  ipcMain.handle('bill:select-and-parse', async () => {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Select hospital bill PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    state.set('ANALYZING');
    try {
      const bill = await ingestBillPdf(selection.filePaths[0]);
      const enhancementPlan = evaluateBill(bill, rateRepository);
      currentEnhancementPlan = enhancementPlan;
      state.set('BILL_LOADED');
      logger.info('Bill PDF parsed and deterministic plan prepared', {
        pages: bill.parsing_audit.pages_processed,
        sections: bill.parsing_audit.sections_detected.length,
        items: bill.parsing_audit.raw_items_detected,
        excludedSections: bill.parsing_audit.excluded_patient_payable_sections.length,
        planEntries: enhancementPlan.entries.length,
        planWarnings: enhancementPlan.warnings.length
      });
      return { canceled: false, bill, enhancementPlan };
    } catch (error) {
      state.set('ERROR');
      logger.error('Bill PDF parsing failed', error);
      throw new Error(`Bill could not be parsed: ${error.message}`);
    }
  });
  ipcMain.handle('portal:preview', () => {
    if (!currentEnhancementPlan) throw new Error('Parse a bill before preparing portal actions');
    return adaptEnhancementPlan(currentEnhancementPlan);
  });
  ipcMain.handle('portal:execute', async () => {
    if (!currentEnhancementPlan) throw new Error('Parse a bill before portal execution');
    logger.info('User requested legacy portal execution; authenticated Chrome CDP session is required');
    const audit = await executeEnhancementPlan(currentEnhancementPlan, new LegacyPythonRunner());
    logger.info('Portal execution finished', { runId: audit.run_id, status: audit.status, counts: audit.counts });
    return audit;
  });
  ipcMain.handle('app:renderer-ready', () => {
    logger.info('Renderer ready', { state: state.get() });
    if (process.env.VNEXT_SMOKE_TEST === '1') setTimeout(() => app.quit(), 50);
    return { ready: true };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1120,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    show: process.env.VNEXT_SMOKE_TEST !== '1',
    backgroundColor: '#f4f6f8',
    title: 'CGHS Billing Suite VNEXT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.removeMenu();
  mainWindow.loadFile(path.join(APP_DIR, 'src', 'ui', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

function surfaceFatal(error) {
  const message = error instanceof Error ? error.message : String(error);
  try { logger?.error('Fatal application error', error); } catch (_) { /* logging may be unavailable */ }
  console.error('[VNEXT FATAL]', error);
  if (app.isReady() && process.env.VNEXT_SMOKE_TEST !== '1') {
    dialog.showErrorBox('CGHS Billing Suite VNEXT could not start', message);
  }
}

async function bootstrap() {
  try {
    config = loadConfig({ appDir: APP_DIR });
    const storagePath = resolveStoragePath({
      configuredPath: config.storagePath,
      documentsPath: app.getPath('documents'),
      appDir: APP_DIR
    });
    storageInfo = ensureStorage(storagePath);
    logger = createLogger({ logsDir: path.join(storagePath, 'Logs'), level: config.logging.level, source: 'desktop-main' });
    rateRepository = createBundledRateRepository();
    logger.info('Application startup', {
      appDir: APP_DIR,
      storagePath,
      version: app.getVersion(),
      rateRecords: rateRepository.provenance.record_count,
      rateAuthority: rateRepository.provenance.authority_status
    });
    registerIpc();
    createWindow();
  } catch (error) {
    if (!logger) {
      try {
        const fallbackStorage = resolveStoragePath({
          configuredPath: null,
          documentsPath: app.getPath('documents'),
          appDir: APP_DIR
        });
        const fallbackInfo = ensureStorage(fallbackStorage);
        logger = createLogger({ logsDir: path.join(fallbackInfo.path, 'Logs'), level: 'INFO', source: 'desktop-main' });
        logger.error('Application initialization failed', error);
      } catch (_) { /* Storage itself may be unavailable; surfaceFatal still uses stderr/dialog. */ }
    }
    surfaceFatal(error);
    app.exit(1);
  }
}

process.on('uncaughtException', (error) => { surfaceFatal(error); app.exit(1); });
process.on('unhandledRejection', (error) => { surfaceFatal(error); app.exit(1); });

app.whenReady().then(bootstrap);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  try { logger?.info('Application shutdown requested', { state: state.get() }); } catch (_) { /* controlled best effort */ }
});
