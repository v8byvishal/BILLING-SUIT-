'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LEVELS = new Set(['DEBUG', 'INFO', 'WARN', 'ERROR']);

function loadConfig(options = {}) {
  const appDir = path.resolve(options.appDir || path.join(__dirname, '..', '..'));
  const configFile = path.resolve(options.configFile || path.join(appDir, 'config', 'default.json'));
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load configuration from ${configFile}: ${error.message}`);
  }

  const environment = process.env.VNEXT_ENV || raw.environment || 'production';
  const loggingLevel = String(process.env.VNEXT_LOG_LEVEL || raw.logging?.level || 'INFO').toUpperCase();
  if (!LEVELS.has(loggingLevel)) throw new Error(`Invalid logging level: ${loggingLevel}`);

  const configuredStoragePath = process.env.VNEXT_STORAGE_PATH || raw.storagePath || null;
  if (configuredStoragePath && !path.isAbsolute(configuredStoragePath)) {
    throw new Error('Configured Storage path must be absolute');
  }

  return Object.freeze({
    environment,
    storagePath: configuredStoragePath ? path.resolve(configuredStoragePath) : null,
    logging: Object.freeze({ level: loggingLevel }),
    networkProfile: raw.networkProfile || 'default',
    features: Object.freeze({ ...(raw.features || {}) }),
    configFile
  });
}

module.exports = { loadConfig, LEVELS };
