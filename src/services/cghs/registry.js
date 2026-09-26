'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REGISTRY_SCHEMA_VERSION = 1;
const ACTIVE_REGISTRY_FILE = path.join('CGHS', 'active-registry.json');
const REGISTRY_DIRECTORY = path.join('CGHS', 'registries');
const RULE_DIRECTORY = path.join('CGHS', 'rules');
const VALIDATION_DIRECTORY = path.join('CGHS', 'validation');

const AUTHORITY_STATUSES = Object.freeze({
  AUTHORITATIVE: 'AUTHORITATIVE',
  PROJECT_APPROVED: 'PROJECT_APPROVED',
  TEST_ONLY: 'TEST_ONLY',
  VERIFIED_RULE: 'VERIFIED_RULE',
  LEGACY: 'LEGACY',
  PARSER_EVIDENCE: 'PARSER_EVIDENCE',
  HEURISTIC: 'HEURISTIC',
  UNVERIFIED: 'UNVERIFIED',
  DATE_UNVERIFIED: 'DATE_UNVERIFIED',
  PROVISIONAL: 'PROVISIONAL',
  BLOCKED: 'BLOCKED'
});

const REGISTRY_STATES = Object.freeze({
  ACTIVE: 'ACTIVE',
  PARTIAL: 'PARTIAL',
  NOT_CONFIGURED: 'NOT CONFIGURED',
  INVALID: 'INVALID'
});

const VALIDATION_STATUSES = Object.freeze({ PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL' });

const SOURCE_HIERARCHY = Object.freeze([
  { level: 1, label: 'Explicitly approved CGHS master/rate source', authorityStatus: AUTHORITY_STATUSES.AUTHORITATIVE, mayValidateMapping: true },
  { level: 2, label: 'Explicitly approved project rule source', authorityStatus: AUTHORITY_STATUSES.PROJECT_APPROVED, mayValidateMapping: true },
  { level: 3, label: 'Verified test-backed local rules', authorityStatus: AUTHORITY_STATUSES.TEST_ONLY, mayValidateMapping: true },
  { level: 4, label: 'Legacy project mappings', authorityStatus: AUTHORITY_STATUSES.LEGACY, mayValidateMapping: false },
  { level: 5, label: 'Parser evidence', authorityStatus: AUTHORITY_STATUSES.PARSER_EVIDENCE, mayValidateMapping: false },
  { level: 6, label: 'Heuristic inference', authorityStatus: AUTHORITY_STATUSES.HEURISTIC, mayValidateMapping: false }
]);

const EXECUTABLE_AUTHORITY = new Set([
  AUTHORITY_STATUSES.AUTHORITATIVE,
  AUTHORITY_STATUSES.PROJECT_APPROVED,
  AUTHORITY_STATUSES.TEST_ONLY,
  AUTHORITY_STATUSES.VERIFIED_RULE
]);

const CODE_FORMAT = /^(?:[A-Z]{1,5}\d{3,6}|DRUG100|CNSU100)$/;
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function sha256String(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeDescription(value) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function validAuthorityStatus(value) {
  return Object.values(AUTHORITY_STATUSES).includes(value);
}

function isExecutableAuthority(value) {
  return EXECUTABLE_AUTHORITY.has(value);
}

function isValidDate(value) {
  if (value == null || value === '') return true;
  if (!DATE_FORMAT.test(String(value))) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function overlaps(a, b) {
  const startA = a.effectiveFrom || '0000-01-01';
  const endA = a.effectiveTo || '9999-12-31';
  const startB = b.effectiveFrom || '0000-01-01';
  const endB = b.effectiveTo || '9999-12-31';
  return startA <= endB && startB <= endA;
}

function registryFileName(registry) {
  const version = String(registry.registryVersion || 'unversioned').replace(/[^a-zA-Z0-9._-]/g, '_');
  const hash = String(registry.sourceHash || registry.registryHash || sha256String(stableStringify(registry))).slice(0, 12);
  return `${version}-${hash}.json`;
}

function normalizeEntry(entry, index, defaults = {}) {
  const code = normalizeCode(entry.code);
  const entryAuthority = entry.authorityStatus || defaults.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED;
  const sourceReference = entry.sourceReference || defaults.sourceReference || { file: defaults.sourceFile || null, page: null, sheet: null, row: index + 1 };
  const rate = entry.rate == null || entry.rate === '' ? null : Number(entry.rate);
  return {
    entryId: entry.entryId || `${code || 'ENTRY'}-${String(index + 1).padStart(4, '0')}`,
    code,
    description: entry.description == null ? null : String(entry.description).trim() || null,
    category: entry.category == null ? null : String(entry.category).trim() || null,
    unit: entry.unit == null ? null : String(entry.unit).trim() || null,
    rate,
    sourceReference,
    authorityStatus: entryAuthority,
    effectiveFrom: entry.effectiveFrom || entry.effective_date || null,
    effectiveTo: entry.effectiveTo || null
  };
}

function createRegistry(input = {}) {
  const importedAt = input.importedAt || new Date(0).toISOString();
  const authorityStatus = input.authorityStatus || input.metadata?.authority_status || AUTHORITY_STATUSES.UNVERIFIED;
  const entries = (input.entries || []).map((entry, index) => normalizeEntry(entry, index, {
    authorityStatus,
    sourceFile: input.source?.file || input.sourceFile || null,
    sourceReference: input.sourceReference || null
  }));
  const registry = {
    schemaVersion: input.schemaVersion || REGISTRY_SCHEMA_VERSION,
    registryVersion: input.registryVersion || input.metadata?.version || 'unversioned',
    source: input.source || { type: input.sourceType || 'UNKNOWN', file: input.sourceFile || null },
    sourceHash: input.sourceHash || sha256String(stableStringify(entries)),
    publishedDate: input.publishedDate || input.metadata?.effective_date || null,
    importedAt,
    authorityStatus,
    entries
  };
  return Object.freeze({ ...registry, entries: Object.freeze(registry.entries.map(Object.freeze)) });
}

function issue(severity, code, message, details = {}) {
  return { severity, code, message, details };
}

function validateRegistry(registry) {
  const issues = [];
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    return { status: VALIDATION_STATUSES.FAIL, issues: [issue('FAIL', 'REGISTRY_NOT_OBJECT', 'Registry must be an object')], summary: { entries: 0 } };
  }
  if (registry.schemaVersion !== REGISTRY_SCHEMA_VERSION) issues.push(issue('FAIL', 'UNSUPPORTED_SCHEMA_VERSION', 'Registry schemaVersion is unsupported', { schemaVersion: registry.schemaVersion }));
  if (!registry.registryVersion) issues.push(issue('FAIL', 'MISSING_REGISTRY_VERSION', 'registryVersion is required'));
  if (!registry.source || typeof registry.source !== 'object') issues.push(issue('FAIL', 'MISSING_SOURCE', 'source object is required'));
  if (!registry.sourceHash) issues.push(issue('FAIL', 'MISSING_SOURCE_HASH', 'sourceHash is required'));
  if (!validAuthorityStatus(registry.authorityStatus)) issues.push(issue('FAIL', 'UNSUPPORTED_AUTHORITY_STATUS', 'Registry authorityStatus is unsupported', { authorityStatus: registry.authorityStatus }));
  if (!isValidDate(registry.publishedDate)) issues.push(issue('FAIL', 'INVALID_PUBLISHED_DATE', 'publishedDate must be YYYY-MM-DD when present', { publishedDate: registry.publishedDate }));
  const entries = Array.isArray(registry.entries) ? registry.entries : [];
  if (!Array.isArray(registry.entries)) issues.push(issue('FAIL', 'MISSING_ENTRIES', 'entries array is required'));

  const byCode = new Map();
  const entryIds = new Set();
  for (const [index, rawEntry] of entries.entries()) {
    const row = index + 1;
    const entry = normalizeEntry(rawEntry, index, { authorityStatus: registry.authorityStatus, sourceFile: registry.source?.file || null });
    if (!entry.entryId) issues.push(issue('FAIL', 'MISSING_ENTRY_ID', 'entryId is required', { row }));
    if (entry.entryId && entryIds.has(entry.entryId)) issues.push(issue('FAIL', 'DUPLICATE_ENTRY_ID', 'entryId must be unique', { row, entryId: entry.entryId }));
    if (entry.entryId) entryIds.add(entry.entryId);
    if (!entry.code) issues.push(issue('FAIL', 'MISSING_CODE', 'code is required', { row }));
    else if (!CODE_FORMAT.test(entry.code)) issues.push(issue('FAIL', 'MALFORMED_CODE', 'code format is invalid', { row, code: rawEntry.code }));
    if (!entry.description) issues.push(issue('WARN', 'MISSING_DESCRIPTION', 'description is missing', { row, code: entry.code }));
    if (!validAuthorityStatus(entry.authorityStatus)) issues.push(issue('FAIL', 'UNSUPPORTED_ENTRY_AUTHORITY', 'entry authorityStatus is unsupported', { row, code: entry.code, authorityStatus: entry.authorityStatus }));
    if (!entry.sourceReference || !entry.sourceReference.file) issues.push(issue('FAIL', 'MISSING_SOURCE_REFERENCE', 'sourceReference.file is required', { row, code: entry.code }));
    if (rawEntry.rate != null && rawEntry.rate !== '' && (!Number.isFinite(entry.rate) || entry.rate < 0)) issues.push(issue('FAIL', 'INVALID_RATE', 'rate must be a non-negative number when present', { row, code: entry.code, rate: rawEntry.rate }));
    if (!isValidDate(entry.effectiveFrom)) issues.push(issue('FAIL', 'INVALID_EFFECTIVE_FROM', 'effectiveFrom must be YYYY-MM-DD when present', { row, code: entry.code, effectiveFrom: entry.effectiveFrom }));
    if (!isValidDate(entry.effectiveTo)) issues.push(issue('FAIL', 'INVALID_EFFECTIVE_TO', 'effectiveTo must be YYYY-MM-DD when present', { row, code: entry.code, effectiveTo: entry.effectiveTo }));
    if (entry.effectiveFrom && entry.effectiveTo && entry.effectiveFrom > entry.effectiveTo) issues.push(issue('FAIL', 'INVALID_EFFECTIVE_RANGE', 'effectiveFrom must not be after effectiveTo', { row, code: entry.code }));
    if (!entry.code) continue;
    const existing = byCode.get(entry.code) || [];
    for (const previous of existing) {
      if (overlaps(previous.entry, entry)) {
        if (normalizeDescription(previous.entry.description) !== normalizeDescription(entry.description)) {
          issues.push(issue('FAIL', 'CONFLICTING_CODE_DESCRIPTION', 'Duplicate code has conflicting description in overlapping effective range', { code: entry.code, rows: [previous.row, row] }));
        } else {
          issues.push(issue('FAIL', 'DUPLICATE_CODE', 'Duplicate code appears in overlapping effective range', { code: entry.code, rows: [previous.row, row] }));
        }
      }
    }
    existing.push({ row, entry });
    byCode.set(entry.code, existing);
  }

  const hasFail = issues.some((item) => item.severity === 'FAIL');
  const hasWarn = issues.some((item) => item.severity === 'WARN');
  return {
    status: hasFail ? VALIDATION_STATUSES.FAIL : (hasWarn ? VALIDATION_STATUSES.WARN : VALIDATION_STATUSES.PASS),
    issues,
    summary: {
      entries: Array.isArray(registry.entries) ? registry.entries.length : 0,
      duplicateCodes: issues.filter((item) => item.code === 'DUPLICATE_CODE').length,
      conflicts: issues.filter((item) => /CONFLICT|OVERLAP/.test(item.code)).length,
      warnings: issues.filter((item) => item.severity === 'WARN').length
    }
  };
}

function parseCsv(content) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    const next = content[i + 1];
    if (inQuote) {
      if (ch === '"' && next === '"') { field += '"'; i += 1; }
      else if (ch === '"') inQuote = false;
      else field += ch;
      continue;
    }
    if (ch === '"') { inQuote = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    if (ch !== '\r') field += ch;
  }
  row.push(field);
  if (row.some((item) => item !== '') || rows.length) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift().map((header) => header.trim());
  return rows.filter((line) => line.some((cell) => String(cell).trim() !== '')).map((line, index) => Object.fromEntries(headers.map((header, i) => [header, line[i] == null ? '' : line[i]]).concat([['__row', index + 2]])));
}

function registryFromRows(rows, meta) {
  return createRegistry({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    registryVersion: meta.registryVersion,
    source: meta.source,
    sourceHash: meta.sourceHash,
    publishedDate: meta.publishedDate || null,
    importedAt: meta.importedAt || new Date().toISOString(),
    authorityStatus: meta.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED,
    entries: rows.map((row, index) => ({
      entryId: row.entryId || row.entry_id || `${normalizeCode(row.code)}-${String(index + 1).padStart(4, '0')}`,
      code: row.code,
      description: row.description,
      category: row.category || null,
      unit: row.unit || null,
      rate: row.rate === '' ? null : row.rate,
      sourceReference: {
        file: meta.source?.file || row.sourceFile || row.source_file || null,
        page: row.page || null,
        sheet: row.sheet || null,
        row: row.row || row.__row || index + 1
      },
      authorityStatus: row.authorityStatus || row.authority_status || meta.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED,
      effectiveFrom: row.effectiveFrom || row.effective_from || null,
      effectiveTo: row.effectiveTo || row.effective_to || null
    }))
  });
}

function loadRegistryFile(filePath, options = {}) {
  const resolved = path.resolve(filePath);
  const extension = path.extname(resolved).toLowerCase();
  const sourceHash = sha256File(resolved);
  if (extension === '.json') {
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    if (Array.isArray(raw.entries)) {
      return createRegistry({
        ...raw,
        source: raw.source || { type: options.sourceType || 'JSON', file: path.basename(resolved) },
        sourceHash: raw.sourceHash || sourceHash,
        importedAt: raw.importedAt || options.importedAt || new Date().toISOString(),
        authorityStatus: raw.authorityStatus || options.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED
      });
    }
    if (Array.isArray(raw.records)) return createRegistryFromRateSource(raw, { filePath: resolved, sourceHash, importedAt: options.importedAt });
    throw new Error('JSON registry must contain entries[] or records[]');
  }
  if (extension === '.csv') {
    const rows = parseCsv(fs.readFileSync(resolved, 'utf8'));
    return registryFromRows(rows, {
      registryVersion: options.registryVersion || path.basename(resolved, extension),
      source: { type: 'CSV', file: path.basename(resolved) },
      sourceHash,
      importedAt: options.importedAt || new Date().toISOString(),
      authorityStatus: options.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED,
      publishedDate: options.publishedDate || null
    });
  }
  throw new Error(`Unsupported registry format: ${extension || 'unknown'}`);
}

function createRegistryFromRateSource(rateSource, options = {}) {
  const metadata = rateSource.metadata || {};
  const sourceHash = options.sourceHash || metadata.extracted_data_sha256 || metadata.source_sha256 || sha256String(stableStringify(rateSource.records || []));
  const authorityStatus = metadata.authority_status === 'AUTHORITATIVE' ? AUTHORITY_STATUSES.AUTHORITATIVE : AUTHORITY_STATUSES.UNVERIFIED;
  return createRegistry({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    registryVersion: metadata.version || options.registryVersion || 'hfos-reference-rates-unversioned',
    source: {
      type: metadata.source_kind || 'RATE_SOURCE_JSON',
      file: options.filePath ? path.basename(options.filePath) : (metadata.source_filename || null),
      originalSource: metadata.source_filename || null,
      notes: metadata.notes || null
    },
    sourceHash,
    publishedDate: metadata.effective_date || null,
    importedAt: options.importedAt || new Date().toISOString(),
    authorityStatus,
    entries: (rateSource.records || []).map((record, index) => ({
      entryId: `${normalizeCode(record.code)}-${String(index + 1).padStart(4, '0')}`,
      code: record.code,
      description: record.description || null,
      category: record.category || null,
      unit: record.unit || null,
      rate: record.rate == null ? null : record.rate,
      sourceReference: { file: options.filePath ? path.basename(options.filePath) : (metadata.source_filename || null), page: null, sheet: null, row: index + 1 },
      authorityStatus,
      effectiveFrom: metadata.effective_date || null,
      effectiveTo: null
    }))
  });
}

function lookupRegistry(registry, code, options = {}) {
  const normalized = normalizeCode(code);
  if (!normalized || !CODE_FORMAT.test(normalized)) return { status: 'INVALID_CODE', code: normalized, matches: [], conflicts: [] };
  if (!registry || !Array.isArray(registry.entries)) return { status: 'NO_ACTIVE_REGISTRY', code: normalized, matches: [], conflicts: [] };
  const allMatches = registry.entries.map((entry, index) => ({ ...entry, index })).filter((entry) => normalizeCode(entry.code) === normalized);
  const effectiveDate = options.effectiveDate || null;
  let matches = allMatches;
  let authorityStatus = registry.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED;
  if (effectiveDate && isValidDate(effectiveDate)) {
    matches = allMatches.filter((entry) => (!entry.effectiveFrom || entry.effectiveFrom <= effectiveDate) && (!entry.effectiveTo || entry.effectiveTo >= effectiveDate));
  } else if (allMatches.some((entry) => entry.effectiveFrom || entry.effectiveTo)) {
    authorityStatus = AUTHORITY_STATUSES.DATE_UNVERIFIED;
  }
  if (!matches.length) return { status: allMatches.length ? 'NO_EFFECTIVE_MATCH' : 'NO_MATCH', code: normalized, matches: [], conflicts: [], authorityStatus };
  const uniqueDescriptions = new Set(matches.map((entry) => normalizeDescription(entry.description)));
  const uniqueRates = new Set(matches.map((entry) => entry.rate == null ? 'NULL' : String(entry.rate)));
  if (matches.length > 1 && (uniqueDescriptions.size > 1 || uniqueRates.size > 1)) {
    return { status: 'RULE_CONFLICT', code: normalized, matches, conflicts: matches, authorityStatus };
  }
  const selected = matches.slice().sort((a, b) => String(a.entryId).localeCompare(String(b.entryId)))[0];
  const selectedAuthority = authorityStatus === AUTHORITY_STATUSES.DATE_UNVERIFIED ? AUTHORITY_STATUSES.DATE_UNVERIFIED : (selected.authorityStatus || authorityStatus);
  return { status: 'MATCH', code: normalized, entry: selected, matches, conflicts: [], authorityStatus: selectedAuthority };
}

function registryStatusFor(registry, validation) {
  if (!registry) return REGISTRY_STATES.NOT_CONFIGURED;
  if (validation?.status === VALIDATION_STATUSES.FAIL) return REGISTRY_STATES.INVALID;
  if (!isExecutableAuthority(registry.authorityStatus)) return REGISTRY_STATES.PARTIAL;
  return REGISTRY_STATES.ACTIVE;
}

class ActiveRegistryStore {
  constructor(storageService) {
    if (!storageService) throw new Error('StorageService is required');
    this.storageService = storageService;
  }

  ensureFolders() {
    for (const relative of [REGISTRY_DIRECTORY, RULE_DIRECTORY, VALIDATION_DIRECTORY]) this.storageService.writeFile(path.join(relative, '.keep'), '', { atomic: false });
  }

  persistRegistry(registry, validation = validateRegistry(registry)) {
    this.ensureFolders();
    const name = registryFileName(registry);
    const registryPath = path.join(REGISTRY_DIRECTORY, name);
    const validationPath = path.join(VALIDATION_DIRECTORY, `${name}.validation.json`);
    this.storageService.writeJson(registryPath, registry);
    this.storageService.writeJson(validationPath, validation);
    return { registryPath, validationPath, fileName: name, validation };
  }

  activateRegistry(registry, options = {}) {
    const validation = validateRegistry(registry);
    const persisted = this.persistRegistry(registry, validation);
    if (validation.status === VALIDATION_STATUSES.FAIL) {
      const error = new Error('Invalid registry cannot be activated');
      error.code = 'INVALID_REGISTRY';
      error.validation = validation;
      throw error;
    }
    const active = {
      schemaVersion: REGISTRY_SCHEMA_VERSION,
      registryVersion: registry.registryVersion,
      sourceHash: registry.sourceHash,
      registryPath: persisted.registryPath,
      validationPath: persisted.validationPath,
      authorityStatus: registry.authorityStatus,
      activatedAt: options.activatedAt || this.storageService.now(),
      activatedBy: options.activatedBy || null,
      reason: options.reason || 'REGISTRY_ACTIVATED'
    };
    this.storageService.writeJson(ACTIVE_REGISTRY_FILE, active);
    this.storageService.appendAudit({
      operation: 'CGHS_REGISTRY_ACTIVATED',
      stage: 'CGHS_REGISTRY',
      status: 'SUCCESS',
      sourceRef: { registryVersion: registry.registryVersion, sourceHash: registry.sourceHash, authorityStatus: registry.authorityStatus }
    });
    return { active, registry, validation, persisted };
  }

  getActiveReference() {
    const loaded = this.storageService.readJson(ACTIVE_REGISTRY_FILE, { fallback: null, preserveCorrupt: true });
    if (loaded.status !== 'SUCCESS') return { status: loaded.status, active: null, error: loaded.error || null };
    return { status: 'SUCCESS', active: loaded.value };
  }

  loadActiveRegistry() {
    const reference = this.getActiveReference();
    if (reference.status !== 'SUCCESS') return { status: reference.status, registry: null, active: null, validation: null, error: reference.error || null };
    const registryLoaded = this.storageService.readJson(reference.active.registryPath, { fallback: null, preserveCorrupt: true });
    if (registryLoaded.status !== 'SUCCESS') return { status: registryLoaded.status, registry: null, active: reference.active, validation: null, error: registryLoaded.error || null };
    const validation = validateRegistry(registryLoaded.value);
    if (validation.status === VALIDATION_STATUSES.FAIL) return { status: 'INVALID', registry: registryLoaded.value, active: reference.active, validation, error: 'Active registry is invalid' };
    if (reference.active.sourceHash !== registryLoaded.value.sourceHash) return { status: 'INVALID', registry: registryLoaded.value, active: reference.active, validation, error: 'Active registry source hash mismatch' };
    return { status: 'SUCCESS', registry: registryLoaded.value, active: reference.active, validation };
  }

  ensureDefaultUnverifiedRegistry(options = {}) {
    const active = this.loadActiveRegistry();
    if (active.status === 'SUCCESS') return active;
    const sourceFile = options.sourceFile;
    if (!sourceFile || !fs.existsSync(sourceFile)) return active;
    const registry = loadRegistryFile(sourceFile, { importedAt: options.importedAt || this.storageService.now() });
    this.activateRegistry(registry, { reason: 'DEFAULT_UNVERIFIED_REGISTRY_INSTALLED' });
    return this.loadActiveRegistry();
  }

  statusSummary(ruleSet = null) {
    const active = this.loadActiveRegistry();
    const registry = active.registry || null;
    const validation = active.validation || null;
    const rules = Array.isArray(ruleSet?.rules) ? ruleSet.rules : [];
    return {
      status: registryStatusFor(registry, validation) || (active.status === 'INVALID' ? REGISTRY_STATES.INVALID : REGISTRY_STATES.NOT_CONFIGURED),
      loadStatus: active.status,
      registryVersion: registry?.registryVersion || active.active?.registryVersion || 'NONE',
      registrySource: registry?.source?.file || registry?.source?.originalSource || 'NONE',
      registryHash: registry?.sourceHash || active.active?.sourceHash || 'NONE',
      authorityStatus: registry?.authorityStatus || active.active?.authorityStatus || 'UNCONFIGURED',
      validationStatus: validation?.status || null,
      validationIssues: validation?.issues || [],
      ruleSetVersion: ruleSet?.ruleSetVersion || null,
      rules: rules.length,
      validatedRules: rules.filter((rule) => rule.status === 'VALIDATED').length,
      reviewRules: rules.filter((rule) => rule.status !== 'VALIDATED').length,
      active: active.active || null,
      error: active.error || null
    };
  }
}

module.exports = {
  ACTIVE_REGISTRY_FILE,
  AUTHORITY_STATUSES,
  CODE_FORMAT,
  EXECUTABLE_AUTHORITY,
  REGISTRY_DIRECTORY,
  REGISTRY_SCHEMA_VERSION,
  REGISTRY_STATES,
  RULE_DIRECTORY,
  SOURCE_HIERARCHY,
  VALIDATION_DIRECTORY,
  VALIDATION_STATUSES,
  ActiveRegistryStore,
  createRegistry,
  createRegistryFromRateSource,
  isExecutableAuthority,
  loadRegistryFile,
  lookupRegistry,
  normalizeCode,
  normalizeDescription,
  parseCsv,
  registryStatusFor,
  sha256File,
  sha256String,
  stableStringify,
  validateRegistry
};
