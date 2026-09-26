'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { CODE_FORMAT, normalizeCode } = require('../cghs/rate-list/normalizer');

const QUANTITY_BEHAVIORS = new Set(['MANUAL', 'FIXED', 'PER_DAY']);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function hash(value) { return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex'); }
function now(clock) { return clock().toISOString(); }
function required(value, label) {
  const result = String(value || '').trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

class CustomCodeRegistry {
  constructor(storageRoot, options = {}) {
    if (!path.isAbsolute(storageRoot)) throw new Error('Custom code registry requires an absolute Storage path');
    this.clock = options.clock || (() => new Date());
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    this.directory = path.join(storageRoot, 'Custom_Codes');
    this.auditDirectory = path.join(storageRoot, 'Audit');
    this.file = path.join(this.directory, 'registry.json');
    this.auditFile = path.join(this.auditDirectory, 'custom-code-audit.jsonl');
    fs.mkdirSync(this.directory, { recursive: true });
    fs.mkdirSync(this.auditDirectory, { recursive: true });
    this.data = this.#load();
  }

  #load() {
    if (!fs.existsSync(this.file)) return { schema_version: 1, revision: 0, updated_at: null, records: [] };
    let value;
    try { value = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch (error) { throw new Error(`Custom code registry is unreadable: ${error.message}`); }
    if (value?.schema_version !== 1 || !Number.isInteger(value.revision) || !Array.isArray(value.records)) throw new Error('Unsupported custom code registry format');
    return value;
  }

  #persist() {
    const temp = `${this.file}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temp, `${JSON.stringify(this.data, null, 2)}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  #audit(action, context) {
    const event = { event_id: this.idFactory(), timestamp: now(this.clock), action, ...context };
    fs.appendFileSync(this.auditFile, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    return event;
  }

  #commit(action, oldValue, newValue, context) {
    this.data.revision += 1;
    this.data.updated_at = now(this.clock);
    this.#persist();
    return this.#audit(action, {
      code: newValue?.code || oldValue?.code || null,
      old_value: oldValue || null,
      new_value: newValue || null,
      reason: context.reason,
      source: context.source,
      operator: context.operator,
      bill_context: context.bill_context || null,
      registry_revision: this.data.revision
    });
  }

  #validated(input, existing = null) {
    const originalCode = required(input.code ?? existing?.original_code, 'Code');
    const code = normalizeCode(originalCode);
    if (!CODE_FORMAT.test(code)) throw new Error('Custom code format is invalid');
    const description = required(input.description ?? existing?.description, 'Description');
    const reason = required(input.reason, 'Reason');
    const source = required(input.source, 'Source/reference');
    const operator = required(input.operator, 'Operator');
    const quantityBehavior = String(input.quantity_behavior ?? existing?.quantity_behavior ?? 'MANUAL').toUpperCase();
    if (!QUANTITY_BEHAVIORS.has(quantityBehavior)) throw new Error('Quantity behavior must be MANUAL, FIXED, or PER_DAY');
    const fixedQuantity = input.fixed_quantity ?? existing?.fixed_quantity ?? null;
    if (quantityBehavior === 'FIXED' && (!Number.isInteger(fixedQuantity) || fixedQuantity <= 0)) throw new Error('FIXED quantity behavior requires a positive integer fixed_quantity');
    const rate = input.rate === '' || input.rate == null ? (existing?.rate ?? null) : Number(input.rate);
    if (rate !== null && (!Number.isFinite(rate) || rate < 0)) throw new Error('Custom code rate must be a non-negative number or undefined');
    return { originalCode, code, description, reason, source, operator, quantityBehavior, fixedQuantity: quantityBehavior === 'FIXED' ? fixedQuantity : null, rate };
  }

  create(input, options = {}) {
    const v = this.#validated(input);
    if (this.data.records.some((record) => record.code === v.code)) throw new Error(`Duplicate custom code: ${v.code}`);
    const reference = options.referenceLookup?.(v.code);
    const collides = reference?.status === 'VALID';
    if (collides && input.override_authoritative !== true) throw new Error(`Custom code ${v.code} conflicts with reference data and requires override_authoritative = true`);
    const timestamp = now(this.clock);
    const record = {
      id: this.idFactory(), code: v.code, original_code: v.originalCode, description: v.description,
      unit: input.unit == null ? null : String(input.unit).trim() || null,
      quantity_behavior: v.quantityBehavior, fixed_quantity: v.fixedQuantity, rate: v.rate,
      reason: v.reason, source: v.source, creator: v.operator, created_at: timestamp, updated_at: timestamp,
      active: input.active !== false, override_authoritative: collides && input.override_authoritative === true,
      reference_state_at_override: collides ? reference.record : null,
      notes: input.notes == null ? null : String(input.notes).trim() || null,
      revision: 1, scope: 'GLOBAL'
    };
    this.data.records.push(record);
    this.#commit('CREATED', null, record, { ...v, bill_context: input.bill_context });
    if (record.override_authoritative) this.#audit('OVERRIDE_ENABLED', {
      code: record.code, old_value: reference.record, new_value: record, reason: v.reason, source: v.source,
      operator: v.operator, bill_context: input.bill_context || null, registry_revision: this.data.revision
    });
    return structuredClone(record);
  }

  update(codeValue, input) {
    const code = normalizeCode(codeValue);
    const index = this.data.records.findIndex((record) => record.code === code);
    if (index < 0) throw new Error(`Custom code not found: ${code}`);
    const oldValue = structuredClone(this.data.records[index]);
    const v = this.#validated({ ...input, code: oldValue.original_code }, oldValue);
    const next = { ...oldValue, description: v.description, unit: input.unit === undefined ? oldValue.unit : String(input.unit || '').trim() || null,
      quantity_behavior: v.quantityBehavior, fixed_quantity: v.fixedQuantity, rate: v.rate, reason: v.reason, source: v.source,
      notes: input.notes === undefined ? oldValue.notes : String(input.notes || '').trim() || null,
      updated_at: now(this.clock), revision: oldValue.revision + 1 };
    this.data.records[index] = next;
    this.#commit('UPDATED', oldValue, next, v);
    return structuredClone(next);
  }

  setActive(codeValue, active, context) {
    const code = normalizeCode(codeValue);
    const record = this.data.records.find((item) => item.code === code);
    if (!record) throw new Error(`Custom code not found: ${code}`);
    if (record.active === Boolean(active)) return structuredClone(record);
    const oldValue = structuredClone(record);
    record.active = Boolean(active); record.updated_at = now(this.clock); record.revision += 1;
    const auditContext = {
      reason: required(context?.reason, 'Reason'), source: required(context?.source, 'Source/reference'), operator: required(context?.operator, 'Operator')
    };
    this.#commit(active ? 'REACTIVATED' : 'DEACTIVATED', oldValue, record, auditContext);
    if (record.override_authoritative) this.#audit(active ? 'OVERRIDE_ENABLED' : 'OVERRIDE_DISABLED', {
      code: record.code, old_value: oldValue, new_value: record, ...auditContext, bill_context: null, registry_revision: this.data.revision
    });
    return structuredClone(record);
  }

  recordReview(input) {
    return this.#audit(input.action || 'REVIEWED', {
      code: input.code ? normalizeCode(input.code) : null, old_value: null, new_value: null,
      reason: required(input.reason, 'Reason'), source: required(input.source, 'Source/reference'),
      operator: required(input.operator, 'Operator'), bill_context: input.bill_context || null,
      review_record: input.review_record || null, scope: 'BILL_SPECIFIC', registry_revision: this.data.revision
    });
  }

  recordPlanUsage(plan, operator = 'SYSTEM') {
    const events = [];
    for (const entry of plan?.entries || []) {
      if (entry.code_validation !== 'CUSTOM/LOCAL') continue;
      events.push(this.#audit(entry.status === 'CUSTOM_VALID' ? 'USED_IN_PLAN' : 'BLOCKED', {
        code: entry.code, old_value: null, new_value: null, reason: entry.status,
        source: entry.rule_id || entry.source || 'ENHANCEMENT_PLAN', operator,
        bill_context: { source_sha256: plan.bill?.source_sha256 || null, bill_number: plan.bill?.bill_number || null },
        registry_revision: this.data.revision
      }));
    }
    return events;
  }

  list(filters = {}) {
    const query = String(filters.query || '').trim().toLowerCase();
    return this.data.records.filter((record) => (filters.active == null || record.active === filters.active)
      && (!filters.status || (filters.status === 'CUSTOM_OVERRIDE' ? record.override_authoritative : filters.status === 'CUSTOM_LOCAL' && !record.override_authoritative))
      && (!query || `${record.code} ${record.description}`.toLowerCase().includes(query))).map((record) => structuredClone(record));
  }

  get(code) { const record = this.data.records.find((item) => item.code === normalizeCode(code)); return record ? structuredClone(record) : null; }

  activeRateEntries() {
    return this.data.records.filter((record) => record.active).map((record) => ({
      code: record.code, description: record.description, rate: record.rate, category: record.override_authoritative ? 'CUSTOM_OVERRIDE' : 'CUSTOM_LOCAL', aliases: [],
      audit: { reason: record.reason, created_by: record.creator, created_at: record.created_at, override_authoritative: record.override_authoritative,
        registry_record_revision: record.revision, quantity_behavior: record.quantity_behavior, fixed_quantity: record.fixed_quantity }
    }));
  }

  snapshot() {
    const active = this.data.records.filter((record) => record.active);
    const recordHashes = Object.fromEntries(active.map((record) => [record.code, hash(record)]));
    return Object.freeze({ schema_version: 1, revision: this.data.revision, hash: hash(recordHashes), record_hashes: Object.freeze(recordHashes) });
  }

  audit(codeValue = null) {
    if (!fs.existsSync(this.auditFile)) return [];
    const code = codeValue ? normalizeCode(codeValue) : null;
    return fs.readFileSync(this.auditFile, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line)).filter((event) => !code || event.code === code);
  }
}

module.exports = { CustomCodeRegistry, QUANTITY_BEHAVIORS, hash };
