'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { loadConfig } = require('../core/config');
const { ensureUserConfig, CURRENT_SCHEMA_VERSION } = require('../core/user-config');
const { resolveRuntimePaths } = require('../core/runtime-paths');
const { createLogger } = require('../core/logger');
const { createAppState } = require('../core/app-state');
const { createApplicationStateStore, APP_STATUS, BILL_STATUS, ENHANCEMENT_STATUS, FINAL_BILL_STATUS, PORTAL_STATUS } = require('../core/application-state-store');
const { SettingsStore } = require('../core/settings-store');
const { STORAGE_FOLDERS, StorageService, ensureStorage, resolveStoragePath } = require('../core/storage');
const { createBundledRateRepository, evaluateBill } = require('../services/cghs');
const { adaptEnhancementPlan } = require('../adapters/legacy-portal/plan-adapter');
const { LegacyPythonRunner } = require('../adapters/legacy-portal/python-runner');
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
const { createDiagnosticsReport, ensureDiagnosticsFolder, writeDiagnosticsReport } = require('../services/diagnostics/diagnostics-service');
const { parseStoredSourceBill, PARSER_STATUSES } = require('../services/bill-ingestion/source-parser');
const { ActiveRegistryStore } = require('../services/cghs/registry');
const { getDefaultRuleSet, resolveParseResult } = require('../services/cghs/rule-resolution');
const { EnhancementPlanBuilder, createPlanSummary } = require('../services/cghs/plan-builder');
const { EnhancementPlanValidator } = require('../services/cghs/plan-validator');
const { PortalPreflightService } = require('../services/portal/portal-preflight-service');
const { PortalExecutionGate } = require('../services/portal/portal-execution-gate');
const { PortalExecutionService } = require('../services/portal/safe-portal-execution-service');
const { LegacyPortalAdapter } = require('../services/portal/legacy-portal-adapter');
const { OPERATIONS, registerPhase1Ipc } = require('./phase1-ipc');

const APP_DIR = path.resolve(__dirname, '..', '..');
let mainWindow = null;
let logger = null;
let config = null;
let storageInfo = null;
let storageService = null;
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
let registryStore = null;
let activeRegistryState = null;
let activeRuleSet = null;
let currentResolutionRun = null;
let currentDeterministicPlan = null;
let portalPreflightService = null;
let portalExecutionGate = null;
let portalExecutionService = null;
let portalAdapter = null;
let currentPortalPreflight = null;
let currentPortalExecution = null;
let settingsStore = null;
let phase1Settings = null;
const state = createAppState();
const phase1State = createApplicationStateStore();

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

function refreshActiveRegistryState() {
  if (!registryStore) return null;
  activeRegistryState = registryStore.loadActiveRegistry();
  return activeRegistryState;
}

function activeRegistry() {
  return (activeRegistryState?.status === 'SUCCESS' ? activeRegistryState.registry : null);
}

function registryStatusSummary() {
  return registryStore ? registryStore.statusSummary(activeRuleSet) : null;
}

function persistResolutionForParseResult(parseResult) {
  if (!parseResult || !storageService) return null;
  const resolution = resolveParseResult(parseResult, {
    registry: activeRegistry(),
    ruleSet: activeRuleSet,
    billSessionId: parseResult.billSessionId,
    parserRunId: parseResult.runId,
    parserVersion: parseResult.parserVersion
  });
  storageService.writeResolutionResult(parseResult.billSessionId, resolution);
  storageService.appendAudit({
    runId: resolution.runId,
    billSessionId: parseResult.billSessionId,
    operation: 'CGHS_RULE_RESOLUTION_COMPLETED',
    stage: 'CGHS_RESOLUTION',
    status: resolution.status,
    sourceRef: { registryVersion: resolution.registryVersion, registrySourceHash: resolution.registrySourceHash, ruleSetVersion: resolution.ruleSetVersion, counts: resolution.counts }
  });
  currentResolutionRun = resolution;
  return resolution;
}

function registryContextForPlan() {
  const summary = registryStatusSummary() || {};
  return {
    status: summary.status || null,
    registryVersion: summary.registryVersion || activeRegistry()?.registryVersion || 'NONE',
    registrySourceHash: summary.registryHash || activeRegistry()?.sourceHash || 'NONE',
    authorityStatus: summary.authorityStatus || activeRegistry()?.authorityStatus || 'UNVERIFIED',
    source: summary.registrySource || activeRegistry()?.source || null
  };
}

function buildAndPersistEnhancementPlan({ parserResult, resolutionResult, sourceBillId }) {
  if (!parserResult || !storageService) return null;
  const billSessionId = parserResult.billSessionId;
  const planRunId = `plan-build-${crypto.randomUUID()}`;
  storageService.appendAudit({ runId: planRunId, billSessionId, operation: 'PLAN_BUILD_STARTED', stage: 'ENHANCEMENT_PLAN', status: 'BUILDING', sourceRef: { parserRunId: parserResult.runId || null, resolutionRunId: resolutionResult?.runId || null } });
  try {
    const builder = new EnhancementPlanBuilder({ ruleSetContext: activeRuleSet });
    const plan = builder.build({
      billSessionId,
      sourceBillId,
      parserResult,
      resolutionResult,
      registryContext: registryContextForPlan(),
      ruleSetContext: activeRuleSet
    });
    storageService.appendAudit({ runId: planRunId, billSessionId, operation: 'PLAN_VALIDATION_STARTED', stage: 'ENHANCEMENT_PLAN', status: 'VALIDATING', sourceRef: { planId: plan.planId } });
    const sourceRecord = storageService.getSourceBillRecord(billSessionId, { verifyHash: false });
    const validation = new EnhancementPlanValidator({ ruleSetContext: activeRuleSet }).validate(plan, {
      billSessionId,
      sourceBillId,
      parserVersion: parserResult.parserVersion,
      registryVersion: activeRegistry()?.registryVersion || plan.createdAgainst.registryVersion,
      registrySourceHash: activeRegistry()?.sourceHash || plan.createdAgainst.registrySourceHash,
      ruleSetVersion: activeRuleSet.ruleSetVersion,
      sourceCandidateIds: (parserResult.candidates || []).map((candidate) => candidate.candidateId).filter(Boolean),
      sourceExists: sourceRecord.status === 'SUCCESS'
    });
    plan.validation = { status: validation.status, issueCount: validation.issues.length, issues: validation.issues };
    const summary = createPlanSummary(plan);
    storageService.writeEnhancementPlan(billSessionId, plan, summary);
    currentDeterministicPlan = plan;
    phase1State.setEnhancement({ billSessionId, status: plan.status, plan: summary, diagnostics: plan.validation?.issues || [] });
    storageService.updateBillSession(billSessionId, { status: plan.status, enhancementPlanPath: storageService.getEnhancementPlanPath(billSessionId) });
    storageService.appendAudit({ runId: planRunId, billSessionId, operation: validation.valid ? 'PLAN_VALIDATION_PASSED' : 'PLAN_VALIDATION_FAILED', stage: 'ENHANCEMENT_PLAN', status: validation.status, sourceRef: { planId: plan.planId, issueCount: validation.issues.length } });
    storageService.appendAudit({ runId: planRunId, billSessionId, operation: 'PLAN_BUILD_COMPLETED', stage: 'ENHANCEMENT_PLAN', status: plan.status, sourceRef: { planId: plan.planId, planSha256: plan.planSha256, summary } });
    if (plan.reviewItems.length) storageService.appendAudit({ runId: planRunId, billSessionId, operation: 'PLAN_MARKED_REVIEW_REQUIRED', stage: 'ENHANCEMENT_PLAN', status: plan.status, sourceRef: { planId: plan.planId, reviewCount: plan.reviewItems.length } });
    if (plan.readiness === 'READY_FOR_PORTAL_VALIDATION') storageService.appendAudit({ runId: planRunId, billSessionId, operation: 'PLAN_MARKED_READY_FOR_PORTAL_VALIDATION', stage: 'ENHANCEMENT_PLAN', status: plan.readiness, sourceRef: { planId: plan.planId, actionCount: plan.actions.length } });
    return plan;
  } catch (error) {
    storageService.appendAudit({ runId: planRunId, billSessionId, operation: 'PLAN_BUILD_FAILED', stage: 'ENHANCEMENT_PLAN', status: 'FAILED', errorCode: error.code || 'PLAN_BUILD_FAILED', sourceRef: { message: error.message } });
    throw error;
  }
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


function clearActiveBillWorkspace() {
  currentBill = null;
  currentEnhancementPlan = null;
  currentExecutionAudit = null;
  currentFinalBillPath = null;
  currentCompletedBill = null;
  currentValidationReport = null;
  currentProductionValidationRun = null;
  currentResolutionRun = null;
  currentDeterministicPlan = null;
  currentPortalPreflight = null;
  currentPortalExecution = null;
  currentCaseId = null;
  state.set('IDLE');
  phase1State.resetCurrentBill();
}

function billMetadataForState(bill, manifest = null) {
  if (!bill && !manifest) return null;
  return {
    caseId: manifest?.case_id || currentCaseId || null,
    workflowStatus: manifest?.workflow_status || null,
    fileName: bill?.source?.file_name || manifest?.initial_pdf_reference?.file_name || null,
    sha256: bill?.source?.sha256 || manifest?.initial_pdf_hash || null,
    pages: bill?.metadata?.page_count ?? null,
    billNumber: bill?.billing?.bill_number || manifest?.bill_number || null,
    patientName: bill?.patient?.name || null,
    uhid: bill?.patient?.uhid || manifest?.uhid || null,
    ipNumber: bill?.patient?.ip_number || manifest?.ip_number || null,
    sections: (bill?.sections || []).map((section) => section.section_type),
    excludedSections: (bill?.excluded_sections || []).map((section) => section.section_type)
  };
}

function enhancementStatusForPlan(plan) {
  if (!plan) return ENHANCEMENT_STATUS.NOT_STARTED;
  if ((plan.execution_summary?.review_required || []).length || (plan.unknown_codes || []).length || (plan.unresolved_codes || []).length) return ENHANCEMENT_STATUS.REVIEW_REQUIRED;
  if ((plan.execution_summary?.executable || []).length) return ENHANCEMENT_STATUS.READY;
  return ENHANCEMENT_STATUS.NOT_STARTED;
}

function buildPlanForBillSession(billSessionId) {
  if (!billSessionId) throw new Error('billSessionId is required');
  const sourceRecord = storageService.getSourceBillRecord(billSessionId, { verifyHash: false });
  const parse = storageService.readParseResult(billSessionId);
  let resolution = storageService.readResolutionResult(billSessionId);
  if (parse.status === 'SUCCESS' && resolution.status !== 'SUCCESS') {
    persistResolutionForParseResult(parse.result);
    resolution = storageService.readResolutionResult(billSessionId);
  }
  const plan = buildAndPersistEnhancementPlan({
    parserResult: parse.status === 'SUCCESS' ? parse.result : { billSessionId, parserVersion: null, candidates: [], candidateCount: 0 },
    resolutionResult: resolution.status === 'SUCCESS' ? resolution.result : null,
    sourceBillId: sourceRecord.metadata?.sourceBillId || billSessionId
  });
  return plan;
}

function planValidationContext(billSessionId, plan = null) {
  const parse = billSessionId && storageService ? storageService.readParseResult(billSessionId) : null;
  return {
    parserVersion: parse?.result?.parserVersion || plan?.createdAgainst?.parserVersion || null,
    registryVersion: activeRegistry()?.registryVersion || plan?.createdAgainst?.registryVersion || null,
    registrySourceHash: activeRegistry()?.sourceHash || plan?.createdAgainst?.registrySourceHash || null,
    ruleSetVersion: activeRuleSet?.ruleSetVersion || plan?.createdAgainst?.ruleSetVersion || null,
    sourceCandidateIds: (parse?.result?.candidates || plan?.diagnostics?.sourceCandidateIds || []).map((candidate) => typeof candidate === 'string' ? candidate : candidate.candidateId).filter(Boolean),
    sourceExists: billSessionId && storageService ? storageService.getSourceBillRecord(billSessionId, { verifyHash: false }).status === 'SUCCESS' : false,
    ruleSetContext: activeRuleSet
  };
}

function ensurePortalServices() {
  if (!portalAdapter) portalAdapter = new LegacyPortalAdapter({ runner: new LegacyPythonRunner({ packaged: app.isPackaged, resourcesPath: process.resourcesPath }) });
  const common = { storageService, ruleSetContext: activeRuleSet, contextProvider: planValidationContext };
  if (!portalPreflightService) portalPreflightService = new PortalPreflightService({ ...common, portalInspector: portalAdapter });
  if (!portalExecutionGate) portalExecutionGate = new PortalExecutionGate(common);
  if (!portalExecutionService) portalExecutionService = new PortalExecutionService({ ...common, preflightService: portalPreflightService, gate: portalExecutionGate, adapter: portalAdapter });
  return { portalPreflightService, portalExecutionGate, portalExecutionService, portalAdapter };
}

function validateStoredPlan(billSessionId) {
  if (!billSessionId) return { status: 'NOT_FOUND', error: 'billSessionId is required', billSessionId: null };
  const loaded = storageService.readEnhancementPlan(billSessionId);
  if (loaded.status !== 'SUCCESS') return { status: loaded.status, error: loaded.error || null, billSessionId };
  const validator = new EnhancementPlanValidator({ ruleSetContext: activeRuleSet });
  const result = validator.validate(loaded.plan, {
    ...planValidationContext(billSessionId, loaded.plan),
    billSessionId,
    sourceBillId: loaded.plan.sourceBillId
  });
  if (result.stale?.stale) storageService.appendAudit({ billSessionId, operation: 'PLAN_MARKED_STALE', stage: 'ENHANCEMENT_PLAN', status: 'STALE', sourceRef: { planId: loaded.plan.planId, reasons: result.stale.reasons } });
  return { billSessionId, planId: loaded.plan.planId, validation: result };
}

async function selectAndParseSourceBill() {
  const selection = await dialog.showOpenDialog(mainWindow, {
    title: 'Select hospital bill PDF',
    properties: ['openFile'],
    filters: [{ name: 'PDF documents', extensions: ['pdf'] }]
  });
  if (selection.canceled || !selection.filePaths[0]) return { canceled: true };
  state.set('ANALYZING');
  clearActiveBillWorkspace();
  try {
    const filePath = selection.filePaths[0];
    const importResult = storageService.importSourceBill(filePath, { originalFileName: path.basename(filePath) });
    if (importResult.status === 'DUPLICATE_SOURCE_BILL') {
      const existingParse = storageService.readParseResult(importResult.billSessionId);
      let existingResolution = storageService.readResolutionResult(importResult.billSessionId);
      if (existingParse.status === 'SUCCESS' && existingResolution.status !== 'SUCCESS') {
        persistResolutionForParseResult(existingParse.result);
        existingResolution = storageService.readResolutionResult(importResult.billSessionId);
      }
      currentResolutionRun = existingResolution.status === 'SUCCESS' ? existingResolution.result : null;
      let existingPlan = storageService.readEnhancementPlan(importResult.billSessionId);
      if (existingParse.status === 'SUCCESS' && currentResolutionRun && existingPlan.status !== 'SUCCESS') {
        buildAndPersistEnhancementPlan({ parserResult: existingParse.result, resolutionResult: currentResolutionRun, sourceBillId: importResult.metadata?.sourceBillId || importResult.billSessionId });
        existingPlan = storageService.readEnhancementPlan(importResult.billSessionId);
      }
      currentDeterministicPlan = existingPlan.status === 'SUCCESS' ? existingPlan.plan : null;
      const source = { file_path: importResult.paths?.sourceFile || null, file_name: importResult.metadata?.originalFileName || path.basename(filePath), sha256: importResult.metadata?.sha256 || null, source_bill_id: importResult.metadata?.sourceBillId || importResult.billSessionId };
      const billSessionId = phase1State.startBillSession({
        billSessionId: importResult.billSessionId,
        source,
        metadata: {
          fileName: source.file_name,
          sha256: source.sha256,
          persistedSource: importResult.metadata,
          parseStatus: existingParse.status === 'SUCCESS' ? existingParse.result.status : 'NOT_STARTED',
          pageCount: existingParse.result?.pageCount || 0,
          candidateCount: existingParse.result?.candidateCount || 0,
          resolutionStatus: currentResolutionRun?.status || 'NOT_STARTED',
          resolutionCount: currentResolutionRun?.resultCount || 0,
          ruleSetVersion: currentResolutionRun?.ruleSetVersion || activeRuleSet?.ruleSetVersion || null,
          planStatus: currentDeterministicPlan?.status || 'NOT_CREATED',
          planId: currentDeterministicPlan?.planId || null,
          planSha256: currentDeterministicPlan?.planSha256 || null
        }
      });
      currentBill = existingParse.status === 'SUCCESS' ? { source, parserResult: existingParse.result, resolutionResult: currentResolutionRun, enhancementPlan: currentDeterministicPlan } : { source, parserResult: null, resolutionResult: null, enhancementPlan: null };
      if (currentDeterministicPlan) phase1State.setEnhancement({ billSessionId, status: currentDeterministicPlan.status, plan: createPlanSummary(currentDeterministicPlan), diagnostics: currentDeterministicPlan.validation?.issues || [] });
      state.set('BILL_LOADED');
      phase1State.appendHistory({ billSessionId, operation: 'SOURCE_BILL_DUPLICATE', status: 'DUPLICATE_SOURCE_BILL', source_reference: importResult.metadata });
      return { canceled: false, duplicate: true, duplicateCode: 'DUPLICATE_SOURCE_BILL', billSessionId, source: importResult.metadata, parseResult: existingParse.result || null, resolutionResult: currentResolutionRun, enhancementPlan: currentDeterministicPlan, appState: phase1State.snapshot() };
    }
    if (importResult.status !== 'IMPORTED') throw new Error(importResult.message || importResult.code || importResult.status);

    const billSessionId = importResult.billSessionId;
    const source = {
      file_path: importResult.paths.sourceFile,
      file_name: importResult.metadata.originalFileName,
      sha256: importResult.metadata.sha256,
      source_bill_id: importResult.sourceBillId
    };
    phase1State.startBillSession({
      billSessionId,
      source,
      metadata: { fileName: source.file_name, sha256: source.sha256, persistedSource: importResult.metadata, parseStatus: PARSER_STATUSES.READING, pageCount: 0, candidateCount: 0 }
    });
    const parseResult = await parseStoredSourceBill(storageService, billSessionId);
    const resolutionResult = parseResult.status === PARSER_STATUSES.FAILED ? null : persistResolutionForParseResult(parseResult);
    const enhancementPlan = resolutionResult ? buildAndPersistEnhancementPlan({ parserResult: parseResult, resolutionResult, sourceBillId: importResult.sourceBillId || billSessionId }) : null;
    currentBill = { source, parserResult: parseResult, resolutionResult, enhancementPlan };
    currentEnhancementPlan = null;
    currentDeterministicPlan = enhancementPlan;
    state.set(parseResult.status === PARSER_STATUSES.FAILED ? 'ERROR' : 'BILL_LOADED');
    phase1State.setCurrentBillMetadata({
      fileName: source.file_name,
      sha256: source.sha256,
      persistedSource: importResult.metadata,
      parseStatus: parseResult.status,
      pages: parseResult.pageCount,
      pageCount: parseResult.pageCount,
      candidateCount: parseResult.candidateCount,
      parserVersion: parseResult.parserVersion,
      runId: parseResult.runId,
      warnings: parseResult.warnings || [],
      resolutionStatus: resolutionResult?.status || 'NOT_STARTED',
      resolutionCount: resolutionResult?.resultCount || 0,
      ruleSetVersion: resolutionResult?.ruleSetVersion || activeRuleSet?.ruleSetVersion || null,
      registryVersion: resolutionResult?.registryVersion || activeRegistry()?.registryVersion || null,
      planStatus: enhancementPlan?.status || 'NOT_CREATED',
      planId: enhancementPlan?.planId || null,
      planSha256: enhancementPlan?.planSha256 || null,
      readiness: enhancementPlan?.readiness || null
    });
    if (parseResult.status === PARSER_STATUSES.FAILED) {
      phase1State.appendHistory({ billSessionId, operation: 'PDF_PARSE_FAILED', status: 'FAILED', error_code: parseResult.errorCode });
      throw Object.assign(new Error(parseResult.message || 'Source PDF could not be parsed'), { code: parseResult.errorCode || 'PDF_PARSE_FAILED' });
    }
    if (parseResult.status === PARSER_STATUSES.PARSER_COMPLETED_NO_CANDIDATES) {
      phase1State.appendHistory({ billSessionId, operation: 'PARSER_ZERO_CANDIDATES', status: parseResult.status });
    } else {
      phase1State.appendHistory({ billSessionId, operation: 'PDF_PARSE_COMPLETED', status: parseResult.status });
    }
    logger.info('Source bill imported and parsed for evidence candidates', { billSessionId, pages: parseResult.pageCount, candidates: parseResult.candidateCount, status: parseResult.status });
    return { canceled: false, billSessionId, source: importResult.metadata, parseResult, resolutionResult, appState: phase1State.snapshot() };
  } catch (error) {
    state.set('ERROR');
    phase1State.setAppStatus(APP_STATUS.ERROR, error.message);
    phase1State.appendHistory({ operation: 'PDF_PARSE_FAILED', status: 'FAILED', error_code: error.code || 'PDF_PARSE_FAILED' });
    try { storageService?.appendFailure({ stage: 'PDF_PARSE', code: error.code || 'PDF_PARSE_FAILED', message: error.message, recoverable: true }); } catch (_) { /* failure persistence is best effort during error handling */ }
    logger.error('Source PDF ingestion/parsing failed', { message: error.message, code: error.code || null });
    throw new Error(`Source PDF could not be parsed: ${error.message}`);
  }
}

function createPhase1Handlers() {
  return {
    [OPERATIONS.APP_GET_INFO]: () => ({
      productName: 'CGHS Billing Suite VNEXT',
      version: app.getVersion(),
      environment: config?.environment || 'production',
      electronVersion: process.versions.electron || null,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      branchLocked: 'arena/01a0dfad-billing-suit'
    }),
    [OPERATIONS.APP_GET_STATUS]: () => {
      if (storageService) phase1State.setStorageStatus(storageService.getStatus());
      return phase1State.snapshot();
    },
    [OPERATIONS.APP_GET_DIAGNOSTICS]: () => {
      const report = createDiagnosticsReport({
        storageRoot: storageInfo?.path || null,
        storageService,
        appInfo: { version: app.getVersion(), packaged: app.isPackaged, environment: config?.environment, electronVersion: process.versions.electron || null },
        billSessionId: phase1State.getCurrentBillSessionId(),
        applicationState: phase1State.snapshot(),
        includeUsage: true
      });
      report.registry = registryStatusSummary();
      report.resolution = currentResolutionRun ? { status: currentResolutionRun.status, counts: currentResolutionRun.counts, ruleSetVersion: currentResolutionRun.ruleSetVersion } : null;
      phase1State.setDiagnostics({ records: [report] });
      return report;
    },
    [OPERATIONS.STORAGE_GET_STATUS]: () => {
      storageInfo = storageService.getStatus();
      phase1State.setStorageStatus(storageInfo);
      return storageInfo;
    },
    [OPERATIONS.STORAGE_OPEN_ROOT]: async () => ({ path: storageInfo.path, result: await shell.openPath(storageInfo.path) }),
    [OPERATIONS.STORAGE_OPEN_FOLDER]: async (payload = {}) => {
      const name = String(payload.name || '');
      return storageService.openFolder(name, (folder) => shell.openPath(folder));
    },
    [OPERATIONS.STORAGE_LIST_RECENT]: () => storageService ? storageService.listBillSessions().slice(0, 10).map((item) => item.session || item) : [],
    [OPERATIONS.STORAGE_LIST_SOURCE_BILLS]: () => storageService ? storageService.listSourceBills({ verifyHash: false }) : [],
    [OPERATIONS.STORAGE_GET_USAGE]: () => storageService ? storageService.getUsageSummary() : null,
    [OPERATIONS.SOURCE_BILL_GET_PARSE_RESULT]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return null;
      const result = storageService.readParseResult(billSessionId);
      if (result.status === 'SUCCESS') return result.result;
      return { status: result.status, error: result.error || null, billSessionId };
    },
    [OPERATIONS.REGISTRY_GET_STATUS]: () => registryStatusSummary(),
    [OPERATIONS.RESOLUTION_GET_STATUS]: () => currentResolutionRun ? { status: currentResolutionRun.status, resultCount: currentResolutionRun.resultCount, counts: currentResolutionRun.counts, ruleSetVersion: currentResolutionRun.ruleSetVersion, registryVersion: currentResolutionRun.registryVersion } : { status: 'NOT_STARTED', resultCount: 0, counts: {}, ruleSetVersion: activeRuleSet?.ruleSetVersion || null, registryVersion: activeRegistry()?.registryVersion || null },
    [OPERATIONS.RESOLUTION_GET_RESULT]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return null;
      const result = storageService.readResolutionResult(billSessionId);
      if (result.status === 'SUCCESS') { currentResolutionRun = result.result; return result.result; }
      const parse = storageService.readParseResult(billSessionId);
      if (parse.status === 'SUCCESS') return persistResolutionForParseResult(parse.result);
      return { status: result.status, error: result.error || null, billSessionId };
    },
    [OPERATIONS.BILL_GET_CURRENT]: () => phase1State.snapshot().currentBill,
    [OPERATIONS.BILL_CLEAR_CURRENT]: () => { const billSessionId = phase1State.getCurrentBillSessionId(); clearActiveBillWorkspace(); if (billSessionId) storageService?.appendAudit({ billSessionId, operation: 'CURRENT_BILL_RESET', stage: 'UI', status: 'SUCCESS' }); return phase1State.snapshot().currentBill; },
    [OPERATIONS.BILL_RESET]: () => { const billSessionId = phase1State.getCurrentBillSessionId(); clearActiveBillWorkspace(); if (billSessionId) storageService?.appendAudit({ billSessionId, operation: 'CURRENT_BILL_RESET', stage: 'UI', status: 'SUCCESS' }); return phase1State.snapshot(); },
    [OPERATIONS.BILL_SELECT]: () => selectAndParseSourceBill(),
    [OPERATIONS.ENHANCEMENT_BUILD_PLAN]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      const plan = buildPlanForBillSession(billSessionId);
      return { billSessionId, plan, summary: createPlanSummary(plan) };
    },
    [OPERATIONS.ENHANCEMENT_GET_PLAN]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return { billSessionId: null, plan: null, message: 'No bill session is active.' };
      const loaded = storageService.readEnhancementPlan(billSessionId);
      if (loaded.status === 'SUCCESS') { currentDeterministicPlan = loaded.plan; return { billSessionId, plan: loaded.plan }; }
      return { billSessionId, plan: null, status: loaded.status, message: 'No EnhancementPlan available.' };
    },
    [OPERATIONS.ENHANCEMENT_GET_PLAN_SUMMARY]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return null;
      const summary = storageService.readEnhancementPlanSummary(billSessionId);
      if (summary.status === 'SUCCESS') return summary.summary;
      const plan = storageService.readEnhancementPlan(billSessionId);
      return plan.status === 'SUCCESS' ? createPlanSummary(plan.plan) : null;
    },
    [OPERATIONS.ENHANCEMENT_VALIDATE_PLAN]: (payload = {}) => validateStoredPlan(payload.billSessionId || phase1State.getCurrentBillSessionId()),
    [OPERATIONS.ENHANCEMENT_REBUILD_PLAN]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      const plan = buildPlanForBillSession(billSessionId);
      return { billSessionId, plan, summary: createPlanSummary(plan) };
    },
    [OPERATIONS.ENHANCEMENT_GET_STATUS]: () => phase1State.snapshot().enhancement,
    [OPERATIONS.PORTAL_PREFLIGHT]: async (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return { status: 'BLOCKED', blockingReasons: [{ code: 'SOURCE_BILL_CHANGED', message: 'No active bill session.' }] };
      ensurePortalServices();
      const planResult = storageService.readEnhancementPlan(billSessionId);
      const plan = planResult.status === 'SUCCESS' ? planResult.plan : null;
      currentPortalPreflight = await portalPreflightService.preflight({ billSessionId, planId: payload.planId || plan?.planId || null, planSha256: payload.planSha256 || plan?.planSha256 || null });
      return currentPortalPreflight;
    },
    [OPERATIONS.PORTAL_GET_PREFLIGHT]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return null;
      const loaded = storageService.readPortalPreflightSnapshot(billSessionId, payload.preflightId || 'latest');
      return loaded.status === 'SUCCESS' ? loaded.snapshot : { status: loaded.status, error: loaded.error || null };
    },
    [OPERATIONS.PORTAL_REVALIDATE]: async (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      ensurePortalServices();
      currentPortalPreflight = await portalPreflightService.preflight({ billSessionId, planId: payload.planId || null, planSha256: payload.planSha256 || null });
      return currentPortalPreflight;
    },
    [OPERATIONS.PORTAL_START_EXECUTION]: async (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) throw new Error('No active bill session for portal execution.');
      ensurePortalServices();
      const planResult = storageService.readEnhancementPlan(billSessionId);
      const plan = planResult.status === 'SUCCESS' ? planResult.plan : null;
      currentPortalExecution = await portalExecutionService.startExecution({ billSessionId, planId: payload.planId || plan?.planId || null, planSha256: payload.planSha256 || plan?.planSha256 || null, operatorConfirmed: payload.operatorConfirmed === true });
      phase1State.setPortal({ billSessionId, status: currentPortalExecution.status, diagnostics: currentPortalExecution.diagnostics || [], execution: { runId: currentPortalExecution.runId, summary: currentPortalExecution.summary } });
      return currentPortalExecution;
    },
    [OPERATIONS.PORTAL_GET_EXECUTION]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return null;
      if (payload.runId) return ensurePortalServices().portalExecutionService.getExecution(billSessionId, payload.runId);
      return currentPortalExecution;
    },
    [OPERATIONS.PORTAL_CANCEL_EXECUTION]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      return ensurePortalServices().portalExecutionService.cancelExecution(billSessionId, payload.runId || currentPortalExecution?.runId);
    },
    [OPERATIONS.PORTAL_GET_EXECUTION_SUMMARY]: (payload = {}) => {
      const billSessionId = payload.billSessionId || phase1State.getCurrentBillSessionId();
      if (!billSessionId) return null;
      return ensurePortalServices().portalExecutionService.getExecutionSummary(billSessionId, payload.runId || currentPortalExecution?.runId);
    },
    [OPERATIONS.FINAL_BILL_GET_STATUS]: () => phase1State.snapshot().finalBill,
    [OPERATIONS.SETTINGS_GET]: () => ({ publicConfig: publicConfig(), settings: phase1Settings, configSchemaVersion: CURRENT_SCHEMA_VERSION }),
    [OPERATIONS.SETTINGS_UPDATE]: (payload = {}) => {
      phase1Settings = settingsStore.update(payload);
      phase1State.setSettings({ publicConfig: publicConfig(), settings: phase1Settings });
      return { settings: phase1Settings, restartRequired: Object.prototype.hasOwnProperty.call(payload, 'storagePath') };
    },
    [OPERATIONS.HISTORY_LIST]: () => storageService ? storageService.listAuditRecords({ limit: 100 }) : phase1State.snapshot().history,
    [OPERATIONS.DIAGNOSTICS_OPEN_FOLDER]: async () => {
      const folder = ensureDiagnosticsFolder(storageInfo.path);
      return { path: folder, result: await shell.openPath(folder) };
    }
  };
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
  ipcMain.handle('cases:open',(_event,id)=>{const manifest=caseWorkflow.openCase(id);currentCaseId=id;const initialPath=path.join(caseStore.directory(id),'normalized','initial-bill.json');const planPath=path.join(caseStore.directory(id),'enhancement','plan.json');currentBill=fs.existsSync(initialPath)?JSON.parse(fs.readFileSync(initialPath)):null;currentEnhancementPlan=fs.existsSync(planPath)?JSON.parse(fs.readFileSync(planPath)):null;currentValidationReport=null;if(currentBill){const billSessionId=phase1State.startBillSession({source:currentBill.source||manifest.initial_pdf_reference,metadata:billMetadataForState(currentBill,manifest)});if(currentEnhancementPlan)phase1State.setEnhancement({billSessionId,status:enhancementStatusForPlan(currentEnhancementPlan),plan:currentEnhancementPlan,diagnostics:currentEnhancementPlan.warnings||[]});}return{manifest,bill:currentBill,enhancementPlan:currentEnhancementPlan,appState:phase1State.snapshot()};});
  ipcMain.handle('inbox:scan',async(_event,kind='initial')=>{const files=inboxScanner.scan(kind);const outcomes=[];for(const file of files.filter(x=>x.status==='STABLE'))outcomes.push(await processInboxCandidate(kind,file));return{files,outcomes,cases:caseStore.list()};});
  ipcMain.handle('watcher:status',()=>inboxWatcher.status());
  ipcMain.handle('watcher:start',()=>inboxWatcher.start());
  ipcMain.handle('watcher:pause',()=>inboxWatcher.pause());
  ipcMain.handle('watcher:resume',()=>inboxWatcher.resume());
  ipcMain.handle('watcher:stop',()=>inboxWatcher.stop());
  ipcMain.handle('watcher:scan-now',()=>inboxWatcher.scanNow());
  ipcMain.handle('bill:select-and-parse', () => selectAndParseSourceBill());
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
    const billSessionId = phase1State.getCurrentBillSessionId();
    if (!billSessionId) throw new Error('Open a persisted source bill before portal preflight.');
    const plan = storageService.readEnhancementPlan(billSessionId);
    if (plan.status !== 'SUCCESS') throw new Error('Build and validate an EnhancementPlan before portal preflight.');
    return { message: 'Legacy portal preview is disabled in Phase 6. Use cghsSuite.portal.preflight and cghsSuite.portal.startExecution.', planSummary: createPlanSummary(plan.plan) };
  });
  ipcMain.handle('portal:execute', async () => {
    throw new Error('Legacy direct portal execution is disabled in Phase 6. Use controlled portal.startExecution after READY preflight.');
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
      currentFinalBillPath=filePath;currentCompletedBill=result.completedBill||null;const billSessionId=phase1State.getCurrentBillSessionId();if(billSessionId)storageService.storeFinalBillFile(billSessionId,filePath,{originalFileName:path.basename(filePath),overwrite:true,sessionStatus:result.outcome||'FINAL_BILL_IMPORTED'});if(currentProductionValidationRun&&currentCompletedBill)currentProductionValidationRun=productionValidationService.linkFinalBill(currentProductionValidationRun,{caseId:currentCaseId,result:currentCompletedBill});
      if(!currentCompletedBill)return{canceled:false,outcome:result.outcome,case:result.case};
      if(billSessionId)phase1State.setFinalBill({billSessionId,status:FINAL_BILL_STATUS.READY,source:file,diagnostics:[]});
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
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!String(targetUrl || '').startsWith('file://')) event.preventDefault();
  });
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
      appDataPath: app.getPath('appData'),
      documentsPath: app.getPath('documents'),
      appDir: APP_DIR
    });
    storageService = new StorageService({ root: storagePath, appDataPath: app.getPath('appData'), documentsPath: app.getPath('documents'), appDir: APP_DIR });
    storageInfo = storageService.initialize({ legacySettingsPath: path.join(app.getPath('userData'), 'phase1-settings.json') });
    if (storageInfo.status !== 'READY' && storageInfo.status !== 'CORRUPT') throw new Error(`Storage is not ready: ${storageInfo.status}${storageInfo.error ? ` - ${storageInfo.error}` : ''}`);
    activeRuleSet = getDefaultRuleSet();
    registryStore = new ActiveRegistryStore(storageService);
    try {
      activeRegistryState = registryStore.ensureDefaultUnverifiedRegistry({ sourceFile: path.join(APP_DIR, 'src', 'services', 'cghs', 'data', 'hfos-reference-rates.json') });
    } catch (error) {
      activeRegistryState = { status: 'INVALID', registry: null, validation: error.validation || null, error: error.message };
    }
    settingsStore = new SettingsStore(storageService.getSettingsPath());
    phase1Settings = settingsStore.load();
    if (!phase1Settings.corrupt && !phase1Settings.storagePath) phase1Settings = settingsStore.save({ storagePath, loggingLevel: config.logging.level, diagnosticsEnabled: true });
    phase1State.setAppInfo({ productName: 'CGHS Billing Suite VNEXT', version: app.getVersion(), environment: config.environment, packaged: app.isPackaged });
    phase1State.setAppStatus(APP_STATUS.READY, 'Application ready');
    phase1State.setStorageStatus(storageInfo);
    phase1State.setSettings({ publicConfig: publicConfig(), settings: phase1Settings });
    logger = createLogger({ logsDir: storageService.getFolderPath('Logs'), level: config.logging.level, source: 'desktop-main' });
    customCodeRegistry = new CustomCodeRegistry(storagePath);
    rebuildRateRepository();
    caseStore=new CaseStore(storagePath);caseLock=new ActiveCaseLock(storagePath);inboxScanner=new InboxScanner(storagePath,{minAgeMs:Math.max(config.automaticInboxWatch.stabilityWindowMs,config.automaticInboxWatch.minimumFileAgeMs)});
    caseWorkflow=new CaseWorkflowService({store:caseStore,lock:caseLock,rateRepository,registrySnapshot:()=>customCodeRegistry.snapshot(),storageRoot:storagePath});productionValidationService=new ProductionValidationRunService({caseStore});
    const watcherAuditFile=path.join(storageService.getFolderPath('Logs'),'inbox-watcher.jsonl');
    inboxWatcher=new InboxWatcher({scanner:inboxScanner,processCandidate:processInboxCandidate,intervalMs:config.automaticInboxWatch.pollingIntervalMs,maxQueue:config.automaticInboxWatch.maximumQueueSize,concurrency:config.automaticInboxWatch.backgroundConcurrency,audit:event=>fs.appendFileSync(watcherAuditFile,`${JSON.stringify(event)}\n`,{mode:0o600})});
    if(config.automaticInboxWatch.enabled)inboxWatcher.start();
    ensurePortalServices();
    const recoveredPortalRuns = [];
    try {
      for (const sourceBill of storageService.listSourceBills({ verifyHash: false })) {
        if (sourceBill.billSessionId) recoveredPortalRuns.push(...storageService.markInterruptedPortalRuns(sourceBill.billSessionId));
      }
    } catch (_) { /* interrupted portal run recovery is best effort */ }
    const recoveredCases=caseWorkflow.interruptPortalCases();
    logger.info('Application startup', {
      appDir: APP_DIR,
      storagePath,
      version: app.getVersion(),
      rateRecords: rateRepository.provenance.record_count,
      rateAuthority: rateRepository.provenance.authority_status,
      registryVersion: activeRegistry()?.registryVersion || null,
      registryAuthority: activeRegistry()?.authorityStatus || null,
      ruleSetVersion: activeRuleSet.ruleSetVersion,
      recoveredCases: recoveredCases.length,
      recoveredPortalRuns: recoveredPortalRuns.length,
      storageStatus: storageInfo.status
    });
    storageService.appendAudit({ operation: 'APPLICATION_STARTUP', stage: 'DESKTOP', status: 'SUCCESS', sourceRef: { recoveredCases, recoveredPortalRuns: recoveredPortalRuns.length, storageStatus: storageInfo.status, registryVersion: activeRegistry()?.registryVersion || null, ruleSetVersion: activeRuleSet.ruleSetVersion } });
    registerPhase1Ipc(ipcMain, createPhase1Handlers());
    registerIpc();
    createWindow();
  } catch (error) {
    if (!logger) {
      try {
        const fallbackStorage = resolveStoragePath({
          configuredPath: null,
          appDataPath: app.getPath('appData'),
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
