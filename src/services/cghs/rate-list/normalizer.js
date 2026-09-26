'use strict';

const CODE_FORMAT = /^[A-Z]{1,5}\d{2,6}$/;

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeRecord(record, index) {
  const code = normalizeCode(record?.code);
  if (!CODE_FORMAT.test(code)) throw new Error(`Invalid rate code at record ${index}: ${record?.code ?? ''}`);
  const rate = record.rate == null || record.rate === '' ? null : Number(record.rate);
  if (rate !== null && (!Number.isFinite(rate) || rate < 0)) throw new Error(`Invalid rate for ${code}`);
  return Object.freeze({
    code,
    description: record.description == null ? null : String(record.description).trim() || null,
    rate,
    category: record.category == null ? null : String(record.category).trim() || null,
    aliases: Object.freeze(Array.isArray(record.aliases) ? record.aliases.map(normalizeCode).filter(Boolean) : []),
    source: record.source || null
  });
}

module.exports = { CODE_FORMAT, normalizeCode, normalizeRecord };
