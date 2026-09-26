/* Preload: exposes the SQLite-backed storage adapter with the EXACT
   window.storage contract the app has used since v2, plus a small
   desktop API. contextIsolation keeps the renderer sandboxed. */
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

async function call(ch, ...args) {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r || r.ok !== true) throw new Error((r && r.error) || 'IPC failure: ' + ch);
  return r.value;
}

contextBridge.exposeInMainWorld('nativeStorage', {
  native: true,                                   /* tells SafeStorage to defer */
  async get(key) {
    const v = await call('kv:get', key);
    return v === null ? null : { value: v };
  },
  async set(key, value) { await call('kv:set', key, String(value)); },
  async delete(key) { await call('kv:delete', key); }
});

contextBridge.exposeInMainWorld('desktop', {
  version: () => call('app:info'),
  backupNow: (reason) => call('backup:create', reason || 'manual'),
  listBackups: () => call('backup:list'),
  restoreBackup: (file) => call('backup:restore', file),
  openBackupFolder: () => call('backup:openFolder'),
  migrationStatus: () => call('migrate:status'),
  importBrowserData: () => call('migrate:pickAndImport'),
  checkForUpdates: () => call('update:check')
});
