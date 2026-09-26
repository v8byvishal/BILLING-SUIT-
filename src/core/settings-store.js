'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteFile } = require('./storage');

const SETTINGS_SCHEMA_VERSION = 1;
const ALLOWED_SETTINGS = new Set(['storagePath', 'loggingLevel', 'diagnosticsEnabled']);

function defaultSettings() {
  return {
    schema_version: SETTINGS_SCHEMA_VERSION,
    storagePath: null,
    loggingLevel: 'INFO',
    diagnosticsEnabled: true,
    updated_at: null
  };
}

function sanitizeSettings(input = {}) {
  const next = {};
  for (const [key, value] of Object.entries(input)) {
    if (/password|credential|cookie|token|secret/i.test(key)) continue;
    if (!ALLOWED_SETTINGS.has(key)) continue;
    if (key === 'storagePath') next.storagePath = value == null || value === '' ? null : path.resolve(String(value));
    if (key === 'loggingLevel') next.loggingLevel = String(value || 'INFO').toUpperCase();
    if (key === 'diagnosticsEnabled') next.diagnosticsEnabled = value !== false;
  }
  return next;
}

class SettingsStore {
  constructor(file, options = {}) {
    if (!path.isAbsolute(file)) throw new Error('Settings file path must be absolute');
    this.file = file;
    this.clock = options.clock || (() => new Date());
  }

  load() {
    if (!fs.existsSync(this.file)) return defaultSettings();
    const value = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    return { ...defaultSettings(), ...sanitizeSettings(value), updated_at: value.updated_at || null };
  }

  save(input) {
    const current = this.load();
    const next = { ...current, ...sanitizeSettings(input), schema_version: SETTINGS_SCHEMA_VERSION, updated_at: this.clock().toISOString() };
    atomicWriteFile(this.file, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  }

  update(input) {
    return this.save(input);
  }
}

module.exports = { ALLOWED_SETTINGS, SETTINGS_SCHEMA_VERSION, SettingsStore, defaultSettings, sanitizeSettings };
