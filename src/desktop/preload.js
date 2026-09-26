'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('vnext', Object.freeze({
  getStatus: () => invoke('app:get-status'),
  getStorageInfo: () => invoke('storage:get-info'),
  getConfig: () => invoke('config:get-public'),
  selectAndParseBill: () => invoke('bill:select-and-parse'),
  listReviewQueue: () => invoke('review:list'),
  recordReviewDecision: (decision) => invoke('review:record', decision),
  listCustomCodes: (filters) => invoke('custom-codes:list', filters),
  createCustomCode: (input) => invoke('custom-codes:create', input),
  updateCustomCode: (code, input) => invoke('custom-codes:update', code, input),
  setCustomCodeActive: (code, active, context) => invoke('custom-codes:set-active', code, active, context),
  getCustomCodeAudit: (code) => invoke('custom-codes:audit', code),
  previewPortalActions: () => invoke('portal:preview'),
  executePortalActions: () => invoke('portal:execute'),
  reportRendererReady: () => invoke('app:renderer-ready')
}));
