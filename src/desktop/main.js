'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { loadConfig } = require('../core/config');
const { ensureUserConfig, CURRENT_SCHEMA_VERSION } = require('../core/user-config');
const { resolveRuntimePaths } = require('../core/runtime-paths');
const { createLogger } = require('../core/logger');
const { createAppState } = require('../core/app-state');
const { ensureStorage, resolveStoragePath } = require('../core/storage');
const { createBundledRateRepository, evaluateBill } = require('../services/cghs');
const { adaptEnhancementPlan } = require('../adapters/legacy-portal/plan-adapter');
const { LegacyPythonRunner } = require('../adapters/legacy-portal/python-runner');
const { executeEnhancementPlan } = require('../services/portal/portal-execution-service');
const { CustomCodeRegistry } = require('../services/custom-codes/custom-code-registry');
const { createReviewQueue } = require('../services/custom-codes/review-queue');
const { CaseStore } = require('../services/cases/case-store');
const { ActiveCaseLock } = require('../services/cases/active-case-lock');
const { InboxScanner } = require('../services/cases/inbox-scanner');
const { InboxWatcher } = require('../services/cases/inbox-watcher');
const { CaseWorkflowService } = require('../services/cases/case-workflow-service');
const { summarizeValidation, validateBill } = require('../services/validation/bill-validator');
const { classifyDiscrepancy, saveValidation } = require('../services/validation/validation-store');
const { ProductionValidationRunService } = require('../services/validation/production-validation-run');

const APP_DIR = path.resolve(__dirname, '..', '..');
let mainWindow = null;
let logger = null;
let config = null;
let storageInfo = null;
let rateRepository = null;
let customCodeRegistry = null;
let currentBill = null;
let currentEnhancementPlan = null;
let currentExecutionAudit = null;
let currentFinalBillPath = null;
let currentCompletedBill = null;
let currentCaseId = null;
let caseStore = null;
let caseLock = null;
let inboxScanner = null;
let inboxWatcher = null;
let caseWorkflow = null;
let currentValidationReport = null;
let productionValidationService = null;
let currentProductionValidationRun = null;
const state = createAppState();

function publicConfig() {
  return Object.freeze({
    environment: config.environment,
    loggingLevel: config.logging.level,
    networkProfile: config.networkProfile,
    features: config.features,
    automaticInboxWatch: config.automaticInboxWatch,
    version: app.getVersion()
  });
}

function rebuildRateRepository() {
  const snapshot = customCodeRegistry.snapshot();
  rateRepository = createBundledRateRepository(customCodeRegistry.activeRateEntries(), { customRegistrySnapshot: snapshot });
  if (caseWorkflow) caseWorkflow.rateRepository = rateRepository;
}

function refreshCurrentPlan() {
  rebuildRateRepository();
  if (currentBill) {
    currentEnhancementPlan = evaluateBill(currentBill, rateRepository);
    customCodeRegistry.recordPlanUsage(currentEnhancementPlan);
    if (currentCaseId) {
      const planPath = caseStore.writeArtifact(currentCaseId, 'enhancement/plan.json', currentEnhancementPlan);
      caseStore.patch(currentCaseId, { enhancement_plan_reference: { path: planPath, plan_version: currentEnhancementPlan.plan_version,
        registry_revision: currentEnhancementPlan.custom_registry?.revision || null, registry_hash: currentEnhancementPlan.custom_registry?.hash || null } }, 'PLAN_REGENERATED', 'Custom registry changed by explicit operator action');
      const manifest = caseStore.load(currentCaseId); const reviews = createReviewQueue(currentEnhancementPlan);
      if (manifest.workflow_status === 'REVIEW_REQUIRED' && !reviews.length) caseStore.transition(currentCaseId, 'PLAN_READY', 'Regenerated plan has no open review records');
    }
  }
  return currentEnhancementPlan;
}

async function processInboxCandidate(kind,file){
  return kind==='initial' ? caseWorkflow.importInitial(file) : caseWorkflow.importFinalAutomatically(file);
}

function registerIpc() {
  ipcMain.handle('app:get-status', () => ({ ready: true, state: state.get(), version: app.getVersion() }));
  ipcMain.handle('storage:get-info', () => storageInfo);
  ipcMain.handle('config:get-public', () => publicConfig());
  ipcMain.handle('cases:list',()=>caseStore.list());
  ipcMain.handle('validation:select-and-run',async()=>{if(!currentBill||!currentEnhancementPlan||!currentCaseId)throw new Error('Open a parsed case before validation');const selection=await dialog.showOpenDialog(mainWindow,{title:'Select reviewed expected-results JSON',properties:['openFile'],filters:[{name:'Expected validation baseline',extensions:['json']}]});if(selection.canceled||!selection.filePaths[0])return{canceled:true};const fixture=JSON.parse(fs.readFileSync(selection.filePaths[0],'utf8'));currentValidationReport=validateBill({fixture,caseId:currentCaseId,runId:`validation-${crypto.randomUUID()}`,bill:currentBill,plan:currentEnhancementPlan});saveValidation(caseStore,currentCaseId,currentValidationReport);const manifest=caseStore.load(currentCaseId);const sourceFile=manifest.initial_pdf_reference.archive_path;if(sourceFile){currentProductionValidationRun=productionValidationService.create({caseId:currentCaseId,sourceFile,sourceHash:manifest.initial_pdf_hash,parserVersion:currentBill.model_version||currentBill.parser_version||'UNKNOWN',plan:currentEnhancementPlan,registry:customCodeRegistry.snapshot()});currentProductionValidationRun=productionValidationService.recordPdfValidation(currentProductionValidationRun,currentValidationReport);}logger.info('Case validation completed',{caseId:currentCaseId,fixtureId:fixture.fixture_id,status:currentValidationReport.status,discrepancies:currentValidationReport.summary.discrepancies});return{canceled:false,report:currentValidationReport,summary:summarizeValidation(currentValidationReport)};});
  ipcMain.handle('production-validation:get',()=>currentProductionValidationRun);
  ipcMain.handle('production-validation:confirm-plan',(_event,input)=>{if(!currentProductionValidationRun)throw new Error('Run PDF validation first');currentProductionValidationRun=productionValidationService.confirmPlan(currentProductionValidationRun,input);return currentProductionValidationRun;});
  ipcMain.handle('production-validation:add-note',(_event,input)=>{if(!currentProductionValidationRun)throw new Error('No production validation run');currentProductionValidationRun=productionValidationService.addNote(currentProductionValidationRun,input);return currentProductionValidationRun;});
  ipcMain.handle('production-validation:preflight',(_event,input)=>{if(!currentProductionValidationRun)throw new Error('No production validation run');const request=adaptEnhancementPlan(currentEnhancementPlan,{registrySnapshot:customCodeRegistry.snapshot()});const held=caseLock.read();return productionValidationService.preflight(currentProductionValidationRun,{...input,activeCaseId:currentCaseId,lockAvailable:!held||held.case_id===currentCaseId,executableCount:request.actions.length,unsafeActionCount:0});});
  ipcMain.handle('validation:classify',(_event,id,decision)=>{if(!currentValidationReport)throw new Error('No validation report is active');currentValidationReport=classifyDiscrepancy(currentValidationReport,id,decision);saveValidation(caseStore,currentCaseId,currentValidationReport);return currentValidationReport;});
  ipcMain.handle('cases:open',(_event,id)=>{const manifest=caseWorkflow.openCase(id);currentCaseId=id;const initialPath=path.join(caseStore.directory(id),'normalized','initial-bill.json');const planPath=path.join(caseStore.directory(id),'enhancement','plan.json');currentBill=fs.existsSync(initialPath)?JSON.parse(fs.readFileSync(initialPath)):null;currentEnhancementPlan=fs.existsSync(planPath)?JSON.parse(fs.readFileSync(planPath)):null;currentValidationReport=null;return{manifest,bill:currentBill,enhancementPlan:currentEnhancementPlan};});
  ipcMain.handle('inbox:scan',async(_event,kind='initial')=>{const files=inboxScanner.scan(kind);const outcomes=[];for(const file of files.filter(x=>x.status==='STABLE'))outcomes.push(await processInboxCandidate(kind,file));return{files,outcomes,cases:caseStore.list()};});
  ipcMain.handle('watcher:status',()=>inboxWatcher.status());
  ipcMain.handle('watcher:start',()=>inboxWatcher.start());
  ipcMain.handle('watcher:pause',()=>inboxWatcher.pause());
  ipcMain.handle('watcher:resume',()=>inboxWatcher.resume());
  ipcMain.handle('watcher:stop',()=>inboxWatcher.stop());
  ipcMain.handle('watcher:scan-now',()=>inboxWatcher.scanNow());
  ipcMain.handle('bill:select-and-parse', async () => {
    const selection = await dialog.showOpenDialog(mainWindow, {
      title: 'Select hospital bill PDF',
      properties: ['openFile'],
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
    });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    state.set('ANALYZING');
    try {
      const filePath = selection.filePaths[0];
      const source = { file_path: filePath, file_name: path.basename(filePath), sha256: crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex') };
      const result = await caseWorkflow.importInitial(source);
      if (result.outcome === 'EXACT_DUPLICATE') return { canceled: false, duplicate: true, case: result.case };
      if (!result.bill || !result.plan) throw new Error(result.reason || result.outcome);
      currentCaseId = result.case.case_id; currentBill = result.bill; currentEnhancementPlan = result.plan;
      currentExecutionAudit = null; currentFinalBillPath = null; currentCompletedBill = null; currentValidationReport = null;
      customCodeRegistry.recordPlanUsage(result.plan); state.set('BILL_LOADED');
      logger.info('Case initial bill parsed and plan persisted', { caseId: currentCaseId, pages: result.bill.parsing_audit.pages_processed, planEntries: result.plan.entries.length, workflowStatus: result.case.workflow_status });
      return { canceled: false, case: result.case, bill: result.bill, enhancementPlan: result.plan };
    } catch (error) {
      state.set('ERROR');
      logger.error('Bill PDF parsing failed', error);
      throw new Error(`Bill could not be parsed: ${error.message}`);
    }
  });
  ipcMain.handle('review:list', () => currentEnhancementPlan ? createReviewQueue(currentEnhancementPlan, currentValidationReport?.discrepancies || []) : []);
  ipcMain.handle('review:record', (_event, decision) => customCodeRegistry.recordReview(decision));
  ipcMain.handle('custom-codes:list', (_event, filters) => ({ records: customCodeRegistry.list(filters), registry: customCodeRegistry.snapshot() }));
  ipcMain.handle('custom-codes:create', (_event, input) => {
    const referenceOnly = createBundledRateRepository();
    const record = customCodeRegistry.create(input, { referenceLookup: (code) => referenceOnly.lookup(code) });
    const enhancementPlan = refreshCurrentPlan();
    return { record, registry: customCodeRegistry.snapshot(), enhancementPlan, reviewQueue: enhancementPlan ? createReviewQueue(enhancementPlan) : [] };
  });
  ipcMain.handle('custom-codes:update', (_event, code, input) => {
    const record = customCodeRegistry.update(code, input); const enhancementPlan = refreshCurrentPlan();
    return { record, registry: customCodeRegistry.snapshot(), enhancementPlan };
  });
  ipcMain.handle('custom-codes:set-active', (_event, code, active, context) => {
    const record = customCodeRegistry.setActive(code, active, context); const enhancementPlan = refreshCurrentPlan();
    return { record, registry: customCodeRegistry.snapshot(), enhancementPlan };
  });
  ipcMain.handle('custom-codes:audit', (_event, code) => customCodeRegistry.audit(code));
  ipcMain.handle('portal:preview', () => {
    if (!currentEnhancementPlan) throw new Error('Parse a bill before preparing portal actions');
    return adaptEnhancementPlan(currentEnhancementPlan, { registrySnapshot: customCodeRegistry.snapshot() });
  });
  ipcMain.handle('portal:execute', async (_event, confirmation) => {
    if (confirmation?.confirmed !== true) throw new Error('EXPLICIT_LIVE_PORTAL_CONFIRMATION_REQUIRED');
    if (!currentProductionValidationRun || currentProductionValidationRun.overall_status !== 'READY_FOR_PORTAL') throw new Error('Production validation plan review is not complete');
    if (!currentEnhancementPlan || !currentCaseId) throw new Error('Open a persisted case before portal execution');
    const manifest = caseStore.load(currentCaseId);
    if (manifest.workflow_status === 'PLAN_READY') caseWorkflow.markReadyForPortal(currentCaseId);
    caseWorkflow.beginPortal(currentCaseId);
    logger.info('Case portal execution started; authenticated Chrome CDP session is required', { caseId: currentCaseId });
    try {
      const audit = await executeEnhancementPlan(currentEnhancementPlan, new LegacyPythonRunner({packaged:app.isPackaged,resourcesPath:process.resourcesPath}), { registrySnapshot: customCodeRegistry.snapshot() });
      currentExecutionAudit = audit; caseWorkflow.recordPortalResult(currentCaseId, audit);currentProductionValidationRun=productionValidationService.recordPortal(currentProductionValidationRun,audit);
      logger.info('Case portal execution finished', { caseId: currentCaseId, runId: audit.run_id, status: audit.status, counts: audit.counts });
      return audit;
    } catch (error) { caseWorkflow.failPortal(currentCaseId, error); throw error; }
  });
  ipcMain.handle('case:confirm-verification', (_event, operator) => caseWorkflow.confirmVerification(currentCaseId, operator));
  ipcMain.handle('case:confirm-discharge', (_event, operator) => {const result=caseWorkflow.confirmDischarge(currentCaseId, operator);if(currentProductionValidationRun)currentProductionValidationRun=productionValidationService.confirmManualDischarge(currentProductionValidationRun,{operator,confirmed:true});return result;});
  ipcMain.handle('final-bill:select-and-parse', async () => {
    if (!currentBill || !currentEnhancementPlan) throw new Error('Load and analyze the initial bill before loading a final bill');
    const selection = await dialog.showOpenDialog(mainWindow, { title: 'Select final bill PDF after manual discharge', properties: ['openFile'], filters: [{ name: 'PDF documents', extensions: ['pdf'] }] });
    if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
    try {
      const filePath=selection.filePaths[0]; const file={file_path:filePath,file_name:path.basename(filePath),sha256:crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex')};
      const result=await caseWorkflow.attachFinal(currentCaseId,file,currentEnhancementPlan,currentExecutionAudit);
      currentFinalBillPath=filePath;currentCompletedBill=result.completedBill||null;if(currentProductionValidationRun&&currentCompletedBill)currentProductionValidationRun=productionValidationService.linkFinalBill(currentProductionValidationRun,{caseId:currentCaseId,result:currentCompletedBill});
      if(!currentCompletedBill)return{canceled:false,outcome:result.outcome,case:result.case};
      logger.info('Case final bill parsed locally',{caseId:currentCaseId,runId:currentCompletedBill.run_id,status:currentCompletedBill.status});
      return{canceled:false,outcome:result.outcome,case:result.case,completedBill:currentCompletedBill};
    } catch (error) { logger.error('Final bill parsing failed', { caseId:currentCaseId,message:error.message }); throw new Error(`Final bill could not be parsed: ${error.message}`); }
  });
  ipcMain.handle('final-bill:resolve-match', (_event, decision) => {
    const file={file_path:currentFinalBillPath,file_name:path.basename(currentFinalBillPath),sha256:currentCompletedBill.final_bill_reference.source.sha256};
    const result=caseWorkflow.resolveFinalMatch(currentCaseId,currentCompletedBill,file,decision);currentCompletedBill=result.completedBill;
    logger.info('Case final bill match manually resolved',{caseId:currentCaseId,runId:currentCompletedBill.run_id,operator:decision.operator});return currentCompletedBill;
  });
  ipcMain.handle('final-bill:save', (_event, options = {}) => {
    if (!currentCompletedBill) throw new Error('Load a final bill before saving');
    const result=caseWorkflow.saveCompleted(currentCaseId,currentCompletedBill,{finalPdfPath:currentFinalBillPath,allowReprocess:options.allowReprocess===true});
    if(currentProductionValidationRun)currentProductionValidationRun=productionValidationService.linkCompleted(currentProductionValidationRun,{caseId:currentCaseId,reference:{package_path:result.package_path||null,run_id:currentCompletedBill.run_id},status:result.status});logger.info('Case completed bill storage result',{caseId:currentCaseId,runId:currentCompletedBill.run_id,status:result.status,reason:result.reason||null});return result;
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
    const runtimePaths=resolveRuntimePaths({appDir:APP_DIR,resourcesPath:process.resourcesPath,packaged:app.isPackaged,platform:process.platform});
    const bundledDefaults=JSON.parse(fs.readFileSync(runtimePaths.defaultConfig,'utf8'));
    const userConfigPath=path.join(app.getPath('userData'),'config.json');
    const userConfig=ensureUserConfig(userConfigPath,bundledDefaults);
    config = loadConfig({ appDir: APP_DIR, configFile:userConfigPath, rawConfig:userConfig.value });
    const storagePath = resolveStoragePath({
      configuredPath: config.storagePath,
      documentsPath: app.getPath('documents'),
      appDir: APP_DIR
    });
    storageInfo = ensureStorage(storagePath);
    logger = createLogger({ logsDir: path.join(storagePath, 'Logs'), level: config.logging.level, source: 'desktop-main' });
    customCodeRegistry = new CustomCodeRegistry(storagePath);
    rebuildRateRepository();
    caseStore=new CaseStore(storagePath);caseLock=new ActiveCaseLock(storagePath);inboxScanner=new InboxScanner(storagePath,{minAgeMs:Math.max(config.automaticInboxWatch.stabilityWindowMs,config.automaticInboxWatch.minimumFileAgeMs)});
    caseWorkflow=new CaseWorkflowService({store:caseStore,lock:caseLock,rateRepository,registrySnapshot:()=>customCodeRegistry.snapshot(),storageRoot:storagePath});productionValidationService=new ProductionValidationRunService({caseStore});
    const watcherAuditFile=path.join(storagePath,'Logs','inbox-watcher.jsonl');
    inboxWatcher=new InboxWatcher({scanner:inboxScanner,processCandidate:processInboxCandidate,intervalMs:config.automaticInboxWatch.pollingIntervalMs,maxQueue:config.automaticInboxWatch.maximumQueueSize,concurrency:config.automaticInboxWatch.backgroundConcurrency,audit:event=>fs.appendFileSync(watcherAuditFile,`${JSON.stringify(event)}\n`,{mode:0o600})});
    if(config.automaticInboxWatch.enabled)inboxWatcher.start();
    const recoveredCases=caseWorkflow.interruptPortalCases();
    logger.info('Application startup', {
      appDir: APP_DIR,
      storagePath,
      version: app.getVersion(),
      rateRecords: rateRepository.provenance.record_count,
      rateAuthority: rateRepository.provenance.authority_status,
      recoveredCases: recoveredCases.length
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
  try { inboxWatcher?.stop(); if(caseLock?.token)caseLock.release(); logger?.info('Application shutdown requested', { state: state.get(),caseId:currentCaseId }); } catch (_) { /* controlled best effort */ }
});
