'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('vnext', Object.freeze({
  getStatus: () => invoke('app:get-status'),
  getStorageInfo: () => invoke('storage:get-info'),
  getConfig: () => invoke('config:get-public'),
  selectAndParseBill: () => invoke('bill:select-and-parse'),
  listCases: () => invoke('cases:list'),
  openCase: (id) => invoke('cases:open', id),
  scanInbox: (kind) => invoke('inbox:scan', kind),
  watcherStatus: () => invoke('watcher:status'),
  watcherStart: () => invoke('watcher:start'),
  watcherPause: () => invoke('watcher:pause'),
  watcherResume: () => invoke('watcher:resume'),
  watcherStop: () => invoke('watcher:stop'),
  confirmVerification: (operator) => invoke('case:confirm-verification', operator),
  confirmDischarge: (operator) => invoke('case:confirm-discharge', operator),
  runBillValidation: () => invoke('validation:select-and-run'),
  getProductionValidation: () => invoke('production-validation:get'),
  confirmProductionPlan: (input) => invoke('production-validation:confirm-plan', input),
  addProductionValidationNote: (input) => invoke('production-validation:add-note', input),
  productionPortalPreflight: (input) => invoke('production-validation:preflight', input),
  classifyValidationFinding: (id, decision) => invoke('validation:classify', id, decision),
  listReviewQueue: () => invoke('review:list'),
  recordReviewDecision: (decision) => invoke('review:record', decision),
  listCustomCodes: (filters) => invoke('custom-codes:list', filters),
  createCustomCode: (input) => invoke('custom-codes:create', input),
  updateCustomCode: (code, input) => invoke('custom-codes:update', code, input),
  setCustomCodeActive: (code, active, context) => invoke('custom-codes:set-active', code, active, context),
  getCustomCodeAudit: (code) => invoke('custom-codes:audit', code),
  previewPortalActions: () => invoke('portal:preview'),
  executePortalActions: (confirmation) => invoke('portal:execute', confirmation),
  selectAndParseFinalBill: () => invoke('final-bill:select-and-parse'),
  resolveFinalBillMatch: (decision) => invoke('final-bill:resolve-match', decision),
  saveCompletedBill: (options) => invoke('final-bill:save', options),
  reportRendererReady: () => invoke('app:renderer-ready')
}));
