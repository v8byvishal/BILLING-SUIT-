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
  confirmVerification: (operator) => invoke('case:confirm-verification', operator),
  confirmDischarge: (operator) => invoke('case:confirm-discharge', operator),
  runBillValidation: () => invoke('validation:select-and-run'),
  classifyValidationFinding: (id, decision) => invoke('validation:classify', id, decision),
  listReviewQueue: () => invoke('review:list'),
  recordReviewDecision: (decision) => invoke('review:record', decision),
  listCustomCodes: (filters) => invoke('custom-codes:list', filters),
  createCustomCode: (input) => invoke('custom-codes:create', input),
  updateCustomCode: (code, input) => invoke('custom-codes:update', code, input),
  setCustomCodeActive: (code, active, context) => invoke('custom-codes:set-active', code, active, context),
  getCustomCodeAudit: (code) => invoke('custom-codes:audit', code),
  previewPortalActions: () => invoke('portal:preview'),
  executePortalActions: () => invoke('portal:execute'),
  selectAndParseFinalBill: () => invoke('final-bill:select-and-parse'),
  resolveFinalBillMatch: (decision) => invoke('final-bill:resolve-match', decision),
  saveCompletedBill: (options) => invoke('final-bill:save', options),
  reportRendererReady: () => invoke('app:renderer-ready')
}));
