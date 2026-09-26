'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { normalizeRecord } = require('./normalizer');
const { validateRateSource } = require('./validator');

function loadRateSource(filePath) {
  const resolved = path.resolve(filePath);
  let source;
  try { source = JSON.parse(fs.readFileSync(resolved, 'utf8')); }
  catch (error) { throw new Error(`Unable to load rate source ${resolved}: ${error.message}`); }
  const provenance = validateRateSource(source);
  const records = source.records.map(normalizeRecord);
  return Object.freeze({ provenance, records: Object.freeze(records) });
}

function loadBundledReferenceRates() {
  return loadRateSource(path.join(__dirname, '..', 'data', 'hfos-reference-rates.json'));
}

module.exports = { loadBundledReferenceRates, loadRateSource };
