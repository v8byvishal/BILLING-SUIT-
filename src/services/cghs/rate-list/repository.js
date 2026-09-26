'use strict';

const { CODE_FORMAT, normalizeCode, normalizeRecord } = require('./normalizer');
const { AUTHORITY } = require('./validator');

const CODE_STATUS = Object.freeze({
  VALID: 'VALID',
  UNKNOWN: 'UNKNOWN',
  UNRESOLVED_COMPOUND: 'UNRESOLVED_COMPOUND',
  CUSTOM_LOCAL: 'CUSTOM/LOCAL',
  INVALID_FORMAT: 'INVALID_FORMAT'
});

class RateRepository {
  constructor(rateSource, customEntries = []) {
    if (!rateSource?.provenance || !Array.isArray(rateSource.records)) throw new Error('Normalized rate source required');
    this.provenance = rateSource.provenance;
    this.index = new Map();
    for (const record of rateSource.records) {
      if (this.index.has(record.code)) throw new Error(`Conflicting duplicate authoritative/reference rate: ${record.code}`);
      this.index.set(record.code, record);
    }
    this.custom = new Map();
    for (const [index, entry] of customEntries.entries()) this.addCustom(entry, index);
    Object.freeze(this);
  }

  addCustom(entry, index = 0) {
    if (!entry?.audit?.reason || !entry?.audit?.created_by || !entry?.audit?.created_at) {
      throw new Error(`Custom rate ${entry?.code || index} requires reason, created_by, and created_at audit fields`);
    }
    const record = normalizeRecord({ ...entry, source: 'CUSTOM_LOCAL' }, index);
    if (this.custom.has(record.code)) throw new Error(`Duplicate custom rate: ${record.code}`);
    if (this.index.has(record.code) && entry.audit.override_authoritative !== true) {
      throw new Error(`Custom rate ${record.code} conflicts with source data and requires explicit override_authoritative audit approval`);
    }
    this.custom.set(record.code, Object.freeze({ ...record, audit: Object.freeze({ ...entry.audit }) }));
  }

  lookup(value) {
    const code = normalizeCode(value);
    if (!CODE_FORMAT.test(code)) return Object.freeze({ code, status: CODE_STATUS.INVALID_FORMAT, record: null, rate_source: this.provenance });
    if (this.custom.has(code)) return Object.freeze({ code, status: CODE_STATUS.CUSTOM_LOCAL, record: this.custom.get(code), rate_source: this.provenance });
    if (this.index.has(code)) return Object.freeze({ code, status: CODE_STATUS.VALID, record: this.index.get(code), rate_source: this.provenance });
    return Object.freeze({ code, status: CODE_STATUS.UNKNOWN, record: null, rate_source: this.provenance });
  }

  validateCodeNormalization(codeNormalization) {
    if (!codeNormalization || codeNormalization.normalization_status === 'UNRESOLVED') {
      return Object.freeze({ status: CODE_STATUS.INVALID_FORMAT, components: [] });
    }
    const components = codeNormalization.components.map((component) => ({
      raw: component.raw,
      base_code: component.base_code,
      qualifiers: component.qualifiers,
      lookup: component.base_code ? this.lookup(component.base_code) : { status: CODE_STATUS.INVALID_FORMAT, record: null }
    }));
    if (codeNormalization.is_compound) return Object.freeze({
      status: CODE_STATUS.UNRESOLVED_COMPOUND,
      raw_code_expression: codeNormalization.raw_code_expression,
      semantic_interpretation: 'NOT_INFERRED',
      components
    });
    return Object.freeze({ status: components[0]?.lookup.status || CODE_STATUS.INVALID_FORMAT, components });
  }

  isFinanciallyAuthoritative() {
    return this.provenance.authority_status === AUTHORITY.AUTHORITATIVE;
  }
}

module.exports = { CODE_STATUS, RateRepository };
