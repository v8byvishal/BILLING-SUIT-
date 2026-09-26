'use strict';

const crypto = require('node:crypto');

const AUTHORITY = Object.freeze({
  AUTHORITATIVE: 'AUTHORITATIVE',
  RATE_SOURCE_UNDEFINED: 'RATE_SOURCE_UNDEFINED'
});

function stableChecksum(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function validateRateSource(source) {
  if (!source || !Array.isArray(source.records)) throw new Error('Rate source must contain a records array');
  const metadata = source.metadata || {};
  if (!Object.values(AUTHORITY).includes(metadata.authority_status)) throw new Error('Rate source authority_status must be explicit');
  if (metadata.record_count != null && metadata.record_count !== source.records.length) throw new Error('Rate source record count mismatch');
  return Object.freeze({
    source_filename: metadata.source_filename || null,
    source_kind: metadata.source_kind || 'UNSPECIFIED',
    authority_status: metadata.authority_status,
    version: metadata.version || null,
    effective_date: metadata.effective_date || null,
    source_sha256: metadata.source_sha256 || null,
    data_checksum: metadata.extracted_data_sha256 || stableChecksum(source.records),
    record_count: source.records.length,
    loaded_at: new Date().toISOString(),
    notes: metadata.notes || null
  });
}

module.exports = { AUTHORITY, stableChecksum, validateRateSource };
