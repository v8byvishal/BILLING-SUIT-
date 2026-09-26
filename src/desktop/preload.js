'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => ipcRenderer.invoke(channel);

contextBridge.exposeInMainWorld('vnext', Object.freeze({
  getStatus: () => invoke('app:get-status'),
  getStorageInfo: () => invoke('storage:get-info'),
  getConfig: () => invoke('config:get-public'),
  selectAndParseBill: () => invoke('bill:select-and-parse'),
  previewPortalActions: () => invoke('portal:preview'),
  executePortalActions: () => invoke('portal:execute'),
  reportRendererReady: () => invoke('app:renderer-ready')
}));
