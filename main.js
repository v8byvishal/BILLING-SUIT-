/* ============================================================
   CGHS Billing Suite Pro - Desktop (Electron) main process
   v5.0.0-rc.1
   - Encrypted SQLite database (AES-256-GCM at rest)
   - Atomic writes, automatic + manual backups, one-click restore
   - First-launch migration from browser localStorage backups
   - Update architecture prepared (offline; online updates disabled)
   ============================================================ */
'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const initSqlJs = require('sql.js');

const APP_VERSION = (function () { try { return require('./package.json').version; } catch (e) { return app.getVersion(); } })();
const USER_DIR = () => app.getPath('userData');
const DB_FILE = () => path.join(USER_DIR(), 'cghs-data.db.enc');
const KEY_FILE = () => path.join(USER_DIR(), 'db.key');
const BACKUP_DIR = () => path.join(USER_DIR(), 'backups');
const MAX_AUTO_BACKUPS = 60;

/* ---------------- encryption (AES-256-GCM) ----------------
   The key is generated per installation and stored with Electron
   safeStorage (Windows DPAPI) when available, else file-per-user. */
let dbKey = null;

function loadOrCreateKey() {
  const { safeStorage } = require('electron');
  const canOs = safeStorage && safeStorage.isEncryptionAvailable();
  if (fs.existsSync(KEY_FILE())) {
    const raw = fs.readFileSync(KEY_FILE());
    if (raw.length > 33 && raw[0] === 1 && canOs) {
      return safeStorage.decryptString(raw.subarray(1));
    }
    if (raw[0] === 0) return raw.subarray(1).toString('hex');
  }
  const key = crypto.randomBytes(32).toString('hex');
  if (canOs) {
    fs.writeFileSync(KEY_FILE(), Buffer.concat([Buffer.from([1]), safeStorage.encryptString(key)]), { mode: 0o600 });
  } else {
    fs.writeFileSync(KEY_FILE(), Buffer.concat([Buffer.from([0]), Buffer.from(key, 'hex')]), { mode: 0o600 });
  }
  return key;
}

const MAGIC = Buffer.from('CGHSDB2\0');

function encryptBytes(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(dbKey, 'hex'), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, iv, cipher.getAuthTag(), enc]);
}

function decryptBytes(blob) {
  if (!blob.subarray(0, 8).equals(MAGIC)) throw new Error('Not a CGHS encrypted database');
  const iv = blob.subarray(8, 20);
  const tag = blob.subarray(20, 36);
  const enc = blob.subarray(36);
  const de = crypto.createDecipheriv('aes-256-gcm', Buffer.from(dbKey, 'hex'), iv);
  de.setAuthTag(tag);
  return Buffer.concat([de.update(enc), de.final()]);
}

/* ---------------- SQLite (sql.js - real SQLite, WASM, zero native deps) ---------------- */
let SQL = null;
let db = null;
let dirty = false;
let flushTimer = null;

async function openDb() {
  SQL = await initSqlJs({ locateFile: f => path.join(__dirname, 'node_modules', 'sql.js', 'dist', f) });
  if (fs.existsSync(DB_FILE())) {
    db = new SQL.Database(decryptBytes(fs.readFileSync(DB_FILE())));
  } else {
    db = new SQL.Database();
    db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
    db.run('CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    db.run("INSERT OR REPLACE INTO meta VALUES ('schema','1'),('created_at','" + Date.now() + "'),('app_version','" + APP_VERSION + "')");
    persist(true);
  }
  db.run('CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)');
}

/* atomic encrypted persist: write temp -> fsync -> rename */
function persist(force) {
  if (!db || (!dirty && !force)) return;
  const bytes = Buffer.from(db.export());
  const enc = encryptBytes(bytes);
  const tmp = DB_FILE() + '.tmp';
  const fd = fs.openSync(tmp, 'w', 0o600);
  fs.writeSync(fd, enc);
  fs.fsyncSync(fd);
  fs.closeSync(fd);
  fs.renameSync(tmp, DB_FILE());
  dirty = false;
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => { flushTimer = null; try { persist(); } catch (e) { console.error('persist failed', e); } }, 800);
}

/* ---------------- storage API exposed over IPC ---------------- */
function kvGet(key) {
  const st = db.prepare('SELECT value FROM kv WHERE key = :k');
  st.bind({ ':k': key });
  const row = st.step() ? st.getAsObject() : null;
  st.free();
  return row ? row.value : null;
}
function kvSet(key, value) {
  db.run('INSERT INTO kv (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at', [key, value, Date.now()]);
  scheduleFlush();
}
function kvDelete(key) {
  db.run('DELETE FROM kv WHERE key = ?', [key]);
  scheduleFlush();
}
function kvKeys() {
  const out = [];
  const st = db.prepare('SELECT key FROM kv ORDER BY key');
  while (st.step()) out.push(st.getAsObject().key);
  st.free();
  return out;
}

/* ---------------- backups (encrypted with the same key) ---------------- */
function makeBackup(reason) {
  fs.mkdirSync(BACKUP_DIR(), { recursive: true });
  persist(true);
  const name = 'cghs-backup-' + new Date().toISOString().replace(/[:.]/g, '-') + '-' + (reason || 'manual') + '.db.enc';
  const target = path.join(BACKUP_DIR(), name);
  fs.copyFileSync(DB_FILE(), target);
  const list = fs.readdirSync(BACKUP_DIR()).filter(f => f.endsWith('.db.enc')).sort();
  while (list.length > MAX_AUTO_BACKUPS) fs.unlinkSync(path.join(BACKUP_DIR(), list.shift()));
  return { file: name, bytes: fs.statSync(target).size };
}

function listBackups() {
  if (!fs.existsSync(BACKUP_DIR())) return [];
  return fs.readdirSync(BACKUP_DIR()).filter(f => f.endsWith('.db.enc')).sort().reverse()
    .map(f => ({ file: f, bytes: fs.statSync(path.join(BACKUP_DIR(), f)).size, mtime: fs.statSync(path.join(BACKUP_DIR(), f)).mtimeMs }));
}

function restoreBackup(file) {
  const src = path.join(BACKUP_DIR(), path.basename(file));
  if (!fs.existsSync(src)) throw new Error('Backup not found');
  decryptBytes(fs.readFileSync(src));            /* verify before touching anything */
  makeBackup('pre-restore');                     /* safety net */
  db.close();
  fs.copyFileSync(src, DB_FILE());
  db = new SQL.Database(decryptBytes(fs.readFileSync(DB_FILE())));
  return true;
}

/* ---------------- first-launch migration from the browser version ---------------- */
function migrationStatus() {
  try { return JSON.parse(kvGet('desktop-migration') || 'null'); } catch (e) { return null; }
}

function importBrowserSnapshot(jsonText) {
  /* Accepts either a full-backup JSON exported by the browser version
     (collectBackupData shape) or a raw {key: value} localStorage dump. */
  const data = JSON.parse(jsonText);
  let pairs = {};
  if (data && data.app && (data.data || data.bills)) {
    /* browser full-backup shape */
    const d = data.data || data;
    for (const k of Object.keys(d)) if (typeof d[k] !== 'undefined') pairs[k] = JSON.stringify(d[k]);
    if (data.bills) for (const id of Object.keys(data.bills)) pairs['bill:' + id] = JSON.stringify(data.bills[id]);
    if (data['bills-index']) pairs['bills-index'] = JSON.stringify(data['bills-index']);
  } else if (data && typeof data === 'object') {
    for (const k of Object.keys(data)) {
      if (/::bak|::crc/.test(k)) continue;      /* browser safe-layer sidecars are obsolete here */
      pairs[k] = typeof data[k] === 'string' ? data[k] : JSON.stringify(data[k]);
    }
  } else throw new Error('Unrecognized backup format');

  let imported = 0, skippedExisting = 0;
  db.run('BEGIN');
  try {
    for (const k of Object.keys(pairs)) {
      if (kvGet(k) !== null) { skippedExisting++; continue; }   /* never overwrite newer desktop data */
      kvSet(k, pairs[k]);
      imported++;
    }
    db.run('COMMIT');
  } catch (e) { db.run('ROLLBACK'); throw e; }
  kvSet('desktop-migration', JSON.stringify({ at: Date.now(), imported, skippedExisting, source: 'browser-backup' }));
  persist(true);
  makeBackup('post-migration');
  return { imported, skippedExisting };
}

/* ---------------- update architecture (prepared, offline) ---------------- */
const UPDATE_CONFIG = {
  channel: 'stable',
  onlineUpdatesEnabled: false,          /* deliberately off - flip in a future release */
  feedUrl: null,                        /* e.g. https://updates.example/cghs when enabled */
  checkOnLaunch: false
};
function checkForUpdates() {
  /* Offline placeholder: reports current version and that online checks are disabled.
     When onlineUpdatesEnabled is turned on, wire electron-updater here. */
  return { current: APP_VERSION, channel: UPDATE_CONFIG.channel, online: UPDATE_CONFIG.onlineUpdatesEnabled, status: 'up-to-date (offline mode)' };
}

/* ---------------- IPC (validated, minimal surface) ---------------- */
function registerIpc() {
  const S = (fn) => (e, ...a) => { try { return { ok: true, value: fn(...a) }; } catch (err) { return { ok: false, error: String(err.message || err) }; } };
  ipcMain.handle('kv:get', S((key) => { if (typeof key !== 'string') throw new Error('bad key'); return kvGet(key); }));
  ipcMain.handle('kv:set', S((key, value) => { if (typeof key !== 'string' || typeof value !== 'string') throw new Error('bad args'); kvSet(key, value); return true; }));
  ipcMain.handle('kv:delete', S((key) => { if (typeof key !== 'string') throw new Error('bad key'); kvDelete(key); return true; }));
  ipcMain.handle('kv:keys', S(() => kvKeys()));
  ipcMain.handle('backup:create', S((reason) => makeBackup(String(reason || 'manual').slice(0, 24))));
  ipcMain.handle('backup:list', S(() => listBackups()));
  ipcMain.handle('backup:restore', S((file) => restoreBackup(file)));
  ipcMain.handle('backup:openFolder', S(() => { fs.mkdirSync(BACKUP_DIR(), { recursive: true }); shell.openPath(BACKUP_DIR()); return true; }));
  ipcMain.handle('migrate:status', S(() => migrationStatus()));
  ipcMain.handle('migrate:pickAndImport', async () => {
    try {
      const r = await dialog.showOpenDialog({ title: 'Import data from the browser version (full backup .json)', filters: [{ name: 'CGHS backup', extensions: ['json'] }], properties: ['openFile'] });
      if (r.canceled || !r.filePaths[0]) return { ok: true, value: null };
      const res = importBrowserSnapshot(fs.readFileSync(r.filePaths[0], 'utf8'));
      return { ok: true, value: res };
    } catch (err) { return { ok: false, error: String(err.message || err) }; }
  });
  ipcMain.handle('app:info', S(() => ({ version: APP_VERSION, dataDir: USER_DIR(), dbBytes: fs.existsSync(DB_FILE()) ? fs.statSync(DB_FILE()).size : 0, encrypted: true, update: checkForUpdates() })));
  ipcMain.handle('update:check', S(() => checkForUpdates()));
}

/* ---------------- window ---------------- */
let win = null;
function createWindow() {
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 640,
    icon: path.join(__dirname, 'build', 'icon.png'),
    title: 'CGHS Billing Suite Pro',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  });
  Menu.setApplicationMenu(null);
  win.loadFile(path.join(__dirname, 'app', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));   /* no external windows */
}

/* auto backup every 30 minutes + on quit */
let autoBackupTimer = null;

app.whenReady().then(async () => {
  dbKey = loadOrCreateKey();
  await openDb();
  registerIpc();
  createWindow();
  autoBackupTimer = setInterval(() => { try { makeBackup('auto'); } catch (e) {} }, 30 * 60 * 1000);
});

app.on('before-quit', () => {
  try { clearInterval(autoBackupTimer); persist(true); makeBackup('exit'); } catch (e) {}
});
app.on('window-all-closed', () => app.quit());
