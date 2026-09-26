'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { IPC_CHANNEL, OPERATIONS, OPERATION_SET } = require('./ipc-contract');

async function call(operation, payload = null) {
  if (!OPERATION_SET.has(operation)) throw new Error(`Unsupported UI operation: ${operation}`);
  const response = await ipcRenderer.invoke(IPC_CHANNEL, { operation, payload });
  if (!response || response.ok !== true) {
    const error = response?.error || { message: `IPC failure: ${operation}`, code: 'IPC_INVALID_REQUEST' };
    const thrown = new Error(error.message || `IPC failure: ${operation}`);
    thrown.code = error.code;
    thrown.stage = error.stage;
    thrown.recoverable = error.recoverable;
    thrown.details = error.details;
    throw thrown;
  }
  return response.value;
}

const api = Object.freeze({
  app: Object.freeze({
    getInfo: () => call(OPERATIONS.APP_GET_INFO),
    getStatus: () => call(OPERATIONS.APP_GET_STATUS),
    getDiagnostics: () => call(OPERATIONS.APP_GET_DIAGNOSTICS)
  }),
  storage: Object.freeze({
    getStatus: () => call(OPERATIONS.STORAGE_GET_STATUS),
    openRoot: () => call(OPERATIONS.STORAGE_OPEN_ROOT),
    openFolder: (name) => call(OPERATIONS.STORAGE_OPEN_FOLDER, { name }),
    listRecent: () => call(OPERATIONS.STORAGE_LIST_RECENT),
    listSourceBills: () => call(OPERATIONS.STORAGE_LIST_SOURCE_BILLS),
    getUsageSummary: () => call(OPERATIONS.STORAGE_GET_USAGE)
  }),
  sourceBill: Object.freeze({
    getParseResult: (billSessionId) => call(OPERATIONS.SOURCE_BILL_GET_PARSE_RESULT, { billSessionId })
  }),
  registry: Object.freeze({
    getStatus: () => call(OPERATIONS.REGISTRY_GET_STATUS)
  }),
  resolution: Object.freeze({
    getStatus: () => call(OPERATIONS.RESOLUTION_GET_STATUS),
    getResult: (billSessionId) => call(OPERATIONS.RESOLUTION_GET_RESULT, { billSessionId })
  }),
  bill: Object.freeze({
    getCurrent: () => call(OPERATIONS.BILL_GET_CURRENT),
    clearCurrent: () => call(OPERATIONS.BILL_CLEAR_CURRENT),
    select: () => call(OPERATIONS.BILL_SELECT),
    reset: () => call(OPERATIONS.BILL_RESET)
  }),
  enhancement: Object.freeze({
    buildPlan: (billSessionId) => call(OPERATIONS.ENHANCEMENT_BUILD_PLAN, { billSessionId }),
    getPlan: (billSessionId) => call(OPERATIONS.ENHANCEMENT_GET_PLAN, { billSessionId }),
    getPlanSummary: (billSessionId) => call(OPERATIONS.ENHANCEMENT_GET_PLAN_SUMMARY, { billSessionId }),
    validatePlan: (billSessionId) => call(OPERATIONS.ENHANCEMENT_VALIDATE_PLAN, { billSessionId }),
    rebuildPlan: (billSessionId) => call(OPERATIONS.ENHANCEMENT_REBUILD_PLAN, { billSessionId }),
    getStatus: () => call(OPERATIONS.ENHANCEMENT_GET_STATUS)
  }),
  portal: Object.freeze({
    preflight: (input) => call(OPERATIONS.PORTAL_PREFLIGHT, input),
    getPreflight: (input) => call(OPERATIONS.PORTAL_GET_PREFLIGHT, input),
    startExecution: (input) => call(OPERATIONS.PORTAL_START_EXECUTION, input),
    getExecution: (input) => call(OPERATIONS.PORTAL_GET_EXECUTION, input),
    cancelExecution: (input) => call(OPERATIONS.PORTAL_CANCEL_EXECUTION, input),
    getExecutionSummary: (input) => call(OPERATIONS.PORTAL_GET_EXECUTION_SUMMARY, input),
    revalidate: (input) => call(OPERATIONS.PORTAL_REVALIDATE, input)
  }),
  finalBill: Object.freeze({
    getStatus: () => call(OPERATIONS.FINAL_BILL_GET_STATUS)
  }),
  settings: Object.freeze({
    get: () => call(OPERATIONS.SETTINGS_GET),
    update: (input) => call(OPERATIONS.SETTINGS_UPDATE, input)
  }),
  history: Object.freeze({
    list: () => call(OPERATIONS.HISTORY_LIST)
  }),
  diagnostics: Object.freeze({
    openFolder: () => call(OPERATIONS.DIAGNOSTICS_OPEN_FOLDER)
  })
});

contextBridge.exposeInMainWorld('cghsSuite', api);

// Transitional compatibility for legacy renderer code. The new Phase 1 shell uses
// window.cghsSuite exclusively; these narrow wrappers avoid exposing arbitrary
// commands while older workflow handlers are phased into the central contract.
const legacyInvoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld('vnext', Object.freeze({
  getStatus: () => api.app.getStatus(),
  getStorageInfo: () => api.storage.getStatus(),
  getConfig: () => api.settings.get(),
  selectAndParseBill: () => api.bill.select(),
  listCases: () => legacyInvoke('cases:list'),
  openCase: (id) => legacyInvoke('cases:open', id),
  scanInbox: (kind) => legacyInvoke('inbox:scan', kind),
  watcherStatus: () => legacyInvoke('watcher:status'),
  watcherStart: () => legacyInvoke('watcher:start'),
  watcherPause: () => legacyInvoke('watcher:pause'),
  watcherResume: () => legacyInvoke('watcher:resume'),
  watcherStop: () => legacyInvoke('watcher:stop'),
  confirmVerification: (operator) => legacyInvoke('case:confirm-verification', operator),
  confirmDischarge: (operator) => legacyInvoke('case:confirm-discharge', operator),
  runBillValidation: () => legacyInvoke('validation:select-and-run'),
  getProductionValidation: () => legacyInvoke('production-validation:get'),
  confirmProductionPlan: (input) => legacyInvoke('production-validation:confirm-plan', input),
  addProductionValidationNote: (input) => legacyInvoke('production-validation:add-note', input),
  productionPortalPreflight: (input) => legacyInvoke('production-validation:preflight', input),
  classifyValidationFinding: (id, decision) => legacyInvoke('validation:classify', id, decision),
  listReviewQueue: () => legacyInvoke('review:list'),
  recordReviewDecision: (decision) => legacyInvoke('review:record', decision),
  listCustomCodes: (filters) => legacyInvoke('custom-codes:list', filters),
  createCustomCode: (input) => legacyInvoke('custom-codes:create', input),
  updateCustomCode: (code, input) => legacyInvoke('custom-codes:update', code, input),
  setCustomCodeActive: (code, active, context) => legacyInvoke('custom-codes:set-active', code, active, context),
  getCustomCodeAudit: (code) => legacyInvoke('custom-codes:audit', code),
  previewPortalActions: () => api.portal.getPreflight({}),
  executePortalActions: (confirmation) => api.portal.startExecution({ operatorConfirmed: confirmation?.confirmed === true }),
  selectAndParseFinalBill: () => legacyInvoke('final-bill:select-and-parse'),
  resolveFinalBillMatch: (decision) => legacyInvoke('final-bill:resolve-match', decision),
  saveCompletedBill: (options) => legacyInvoke('final-bill:save', options),
  reportRendererReady: () => legacyInvoke('app:renderer-ready')
}));
