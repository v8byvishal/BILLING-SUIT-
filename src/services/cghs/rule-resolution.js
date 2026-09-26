'use strict';

const crypto = require('node:crypto');
const {
  AUTHORITY_STATUSES,
  SOURCE_HIERARCHY,
  isExecutableAuthority,
  lookupRegistry,
  normalizeCode,
  normalizeDescription
} = require('./registry');

const RULE_SET_VERSION = '4.0.0';
const RESOLUTION_SCHEMA_VERSION = 1;

const RULE_STATUSES = Object.freeze({
  VALIDATED: 'VALIDATED',
  PROVISIONAL: 'PROVISIONAL',
  UNVERIFIED: 'UNVERIFIED',
  DEPRECATED: 'DEPRECATED',
  BLOCKED: 'BLOCKED'
});

const RESOLUTION_STATUSES = Object.freeze({
  VALIDATED_MAPPING: 'VALIDATED_MAPPING',
  DIRECT_REGISTRY_MATCH: 'DIRECT_REGISTRY_MATCH',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  UNRESOLVED_MAPPING: 'UNRESOLVED_MAPPING',
  RULE_CONFLICT: 'RULE_CONFLICT',
  REJECTED: 'REJECTED',
  NO_MATCH: 'NO_MATCH'
});

const RAW_ALIAS_CODES = Object.freeze(['C002', 'C003', 'C008', 'C010', 'C011', 'C012', 'C014', 'N002', 'P001', 'T004', 'T005']);
const RAW_ALIAS_SET = new Set(RAW_ALIAS_CODES);

function containsAll(text, terms = []) {
  const normalized = normalizeDescription(text);
  return terms.every((term) => normalized.includes(normalizeDescription(term)));
}

function containsAny(text, terms = []) {
  const normalized = normalizeDescription(text);
  return terms.some((term) => normalized.includes(normalizeDescription(term)));
}

function candidateText(candidate) {
  return [
    candidate?.description,
    candidate?.rawText,
    candidate?.section,
    candidate?.evidence?.sourceSection,
    candidate?.evidence?.sourceText
  ].filter(Boolean).join(' ');
}

function candidateRawCode(candidate) {
  return normalizeCode(candidate?.codeRaw || candidate?.codeNormalizedCandidate || candidate?.code || '');
}

function candidateQuantity(candidate) {
  if (Number.isFinite(candidate?.quantityNormalized)) return candidate.quantityNormalized;
  if (Number.isFinite(candidate?.quantity)) return candidate.quantity;
  const raw = candidate?.quantityRaw == null ? null : Number(String(candidate.quantityRaw).replace(/[,\s]/g, ''));
  return Number.isFinite(raw) ? raw : null;
}

function sourceEvidence(candidate) {
  return [{
    type: 'PARSER_CANDIDATE',
    candidateId: candidate?.candidateId || null,
    pageNumber: candidate?.pageNumber || candidate?.evidence?.pageNumber || null,
    section: candidate?.section || candidate?.evidence?.sourceSection || null,
    sourceText: candidate?.evidence?.sourceText || candidate?.rawText || null,
    lineNumbers: candidate?.evidence?.lineNumbers || []
  }];
}

function defaultInput(candidate) {
  return {
    codeRaw: candidateRawCode(candidate) || null,
    description: candidate?.description || null,
    quantity: candidateQuantity(candidate),
    section: candidate?.section || candidate?.evidence?.sourceSection || null
  };
}

function resultBase(candidate, options = {}) {
  return {
    schemaVersion: RESOLUTION_SCHEMA_VERSION,
    candidateId: candidate?.candidateId || options.candidateId || null,
    billSessionId: candidate?.billSessionId || options.billSessionId || null,
    runId: candidate?.runId || options.runId || null,
    registryVersion: options.registry?.registryVersion || options.registryVersion || null,
    registrySourceHash: options.registry?.sourceHash || options.registrySourceHash || null,
    ruleSetVersion: options.ruleSet?.ruleSetVersion || options.ruleSetVersion || RULE_SET_VERSION,
    status: RESOLUTION_STATUSES.NO_MATCH,
    input: defaultInput(candidate),
    output: { finalCode: null, quantity: null },
    ruleId: null,
    registryEntryId: null,
    authorityStatus: AUTHORITY_STATUSES.UNVERIFIED,
    reason: 'No resolution attempted.',
    evidence: sourceEvidence(candidate),
    conflicts: []
  };
}

function normalizeRule(rule) {
  return Object.freeze({
    version: RULE_SET_VERSION,
    priority: 100,
    status: RULE_STATUSES.UNVERIFIED,
    sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: null },
    tests: [],
    ...rule
  });
}

function explicitAlias(ruleId, codeRaw, phrase, finalCode, priority, section) {
  return normalizeRule({
    ruleId,
    priority,
    status: RULE_STATUSES.VALIDATED,
    handler: 'CONTEXTUAL_ALIAS',
    input: { codeRaw },
    conditions: [{ type: 'DESCRIPTION_CONTAINS_ALL', terms: phrase.split(' ') }],
    output: { finalCode, quantity: 'SOURCE_QUANTITY', unit: null },
    sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section, authority: 'user-provided locked mapping' },
    tests: [ruleId]
  });
}

function getDefaultRuleSet() {
  const rules = [
    explicitAlias('CGHS_C_004_NIV_MACHINE_PER_DAY', 'C004', 'NIV Machine Per Day', 'CC004', 900, '8'),
    explicitAlias('CGHS_C_008_BLOOD_TRANSFUSION', 'C008', 'Blood Transfusion Charge', 'CC008', 900, '8'),
    explicitAlias('CGHS_C_010_ENDOTRACHEAL_INTUBATION', 'C010', 'Endotracheal Intubation', 'CC010', 900, '8'),
    explicitAlias('CGHS_C_011_CENTRAL_LINE', 'C011', 'Central Line', 'CC011', 900, '8'),
    explicitAlias('CGHS_C_012_NEBULIZER_THERAPY', 'C012', 'Nebulizer Therapy', 'CC012', 900, '8'),
    explicitAlias('CGHS_C_014_RYLES_TUBE_INSERTION', 'C014', 'Ryles Tube Insertion Charge', 'CC014', 900, '8'),
    normalizeRule({
      ruleId: 'C002_OXYGEN_HALF_DAY', priority: 880, status: RULE_STATUSES.VALIDATED, handler: 'OXYGEN_DURATION',
      input: { codeRaw: 'C002' }, conditions: [{ type: 'TEXT_CONTAINS_ALL', terms: ['Oxygen'] }, { type: 'TEXT_CONTAINS_ANY', terms: ['Half Day', 'Halfday', '12 Hrs', '12 Hours'] }],
      output: { finalCode: 'CC002', quantity: 12, unit: 'HOUR' },
      sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '9', authority: 'user-provided C002 oxygen rule' },
      tests: ['C002 oxygen half day maps to CC002 x 12']
    }),
    normalizeRule({
      ruleId: 'C002_OXYGEN_FULL_DAY', priority: 880, status: RULE_STATUSES.VALIDATED, handler: 'OXYGEN_DURATION',
      input: { codeRaw: 'C002' }, conditions: [{ type: 'TEXT_CONTAINS_ALL', terms: ['Oxygen'] }, { type: 'TEXT_CONTAINS_ANY', terms: ['Full Day', 'Fullday', '24 Hrs', '24 Hours'] }],
      output: { finalCode: 'CC002', quantity: 24, unit: 'HOUR' },
      sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '9', authority: 'user-provided C002 oxygen rule' },
      tests: ['C002 oxygen full day maps to CC002 x 24']
    }),
    normalizeRule({
      ruleId: 'C002_PACKED_CELLS_REVIEW', priority: 870, status: RULE_STATUSES.UNVERIFIED, handler: 'REVIEW_CONTEXT',
      input: { codeRaw: 'C002' }, conditions: [{ type: 'TEXT_CONTAINS_ANY', terms: ['Packed Cells', 'Blood Bank'] }],
      output: { finalCode: null, quantity: null }, reviewStatus: RESOLUTION_STATUSES.REVIEW_REQUIRED,
      reviewReason: 'C002 packed cells / blood bank context is not an approved CC002 oxygen mapping.',
      sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '9' }, tests: ['C002 packed cells remains review-required']
    }),
    normalizeRule({
      ruleId: 'C003_VENTILATOR_REVIEW', priority: 860, status: RULE_STATUSES.UNVERIFIED, handler: 'REVIEW_CONTEXT',
      input: { codeRaw: 'C003' }, conditions: [{ type: 'TEXT_CONTAINS_ANY', terms: ['Ventilator'] }], output: { finalCode: null, quantity: null }, reviewStatus: RESOLUTION_STATUSES.REVIEW_REQUIRED,
      reviewReason: 'No validated C003 ventilator to final-code mapping exists in the active registry/rule set.', sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '10' }
    }),
    normalizeRule({
      ruleId: 'C003_FRESH_FROZEN_PLASMA_REVIEW', priority: 860, status: RULE_STATUSES.UNVERIFIED, handler: 'REVIEW_CONTEXT',
      input: { codeRaw: 'C003' }, conditions: [{ type: 'TEXT_CONTAINS_ANY', terms: ['Fresh Frozen Plasma', 'FFP'] }], output: { finalCode: null, quantity: null }, reviewStatus: RESOLUTION_STATUSES.REVIEW_REQUIRED,
      reviewReason: 'No validated C003 fresh frozen plasma to final-code mapping exists in the active registry/rule set.', sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '10' }
    }),
    normalizeRule({
      ruleId: 'CC001_ICU_COUNT_DERIVED', priority: 820, status: RULE_STATUSES.VALIDATED, handler: 'DERIVED_COUNT',
      input: { requestedCode: 'CC001' }, conditions: [{ type: 'CONTEXT_COUNT_REQUIRED', field: 'icuCount' }], output: { finalCode: 'CC001', quantityFrom: 'icuCount', unit: 'COUNT' },
      sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '11' }, tests: ['CC001 ICU count derived only from provided ICU evidence']
    }),
    normalizeRule({
      ruleId: 'WC001_WARD_COUNT_DERIVED', priority: 820, status: RULE_STATUSES.VALIDATED, handler: 'DERIVED_COUNT',
      input: { requestedCode: 'WC001' }, conditions: [{ type: 'CONTEXT_COUNT_REQUIRED', field: 'wardCount' }], output: { finalCode: 'WC001', quantityFrom: 'wardCount', unit: 'COUNT' },
      sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '11' }, tests: ['WC001 ward count derived only from provided ward evidence']
    }),
    normalizeRule({
      ruleId: 'CN002_ICU_WARD_FORMULA', priority: 810, status: RULE_STATUSES.VALIDATED, handler: 'DERIVED_FORMULA',
      input: { requestedCode: 'CN002' }, conditions: [{ type: 'CONTEXT_COUNT_REQUIRED', field: 'icuCount' }, { type: 'CONTEXT_COUNT_REQUIRED', field: 'wardCount' }],
      output: { finalCode: 'CN002', formula: { icuCount: 3, wardCount: 2 }, unit: 'COUNT' },
      sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '11' }, tests: ['CN002 = ICU x 3 + Ward x 2']
    }),
    normalizeRule({
      ruleId: 'CATEGORY_CGHS_L_B_TO_LB', priority: 760, status: RULE_STATUSES.VALIDATED, handler: 'CATEGORY_COMPOSITION',
      input: { category: 'CGHS-L', tokenPattern: 'Bxxx' }, output: { prefix: 'L', finalPattern: 'LBxxx' }, sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '12' }, tests: ['CGHS-L + Bxxx -> LBxxx']
    }),
    normalizeRule({
      ruleId: 'CATEGORY_CGHS_RI_NUMERIC_TO_RI', priority: 760, status: RULE_STATUSES.VALIDATED, handler: 'CATEGORY_COMPOSITION',
      input: { category: 'CGHS-RI', tokenPattern: 'numeric' }, output: { prefix: 'RI', finalPattern: 'RIxxx' }, sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '12' }, tests: ['CGHS-RI + numeric -> RIxxx']
    }),
    normalizeRule({
      ruleId: 'CATEGORY_CGHS_CI_NUMERIC_TO_CI', priority: 760, status: RULE_STATUSES.VALIDATED, handler: 'CATEGORY_COMPOSITION',
      input: { category: 'CGHS-CI', tokenPattern: 'numeric' }, output: { prefix: 'CI', finalPattern: 'CIxxx' }, sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '12' }, tests: ['CGHS-CI + numeric -> CIxxx']
    }),
    normalizeRule({
      ruleId: 'CATEGORY_CGHS_G_P_TO_GP', priority: 760, status: RULE_STATUSES.VALIDATED, handler: 'CATEGORY_COMPOSITION',
      input: { category: 'CGHS-G', tokenPattern: 'Pxxx' }, output: { prefix: 'G', finalPattern: 'GPxxx' }, sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '12' }, tests: ['CGHS-G + Pxxx -> GPxxx']
    }),
    normalizeRule({
      ruleId: 'CATEGORY_CGHS_P_T_TO_PT', priority: 760, status: RULE_STATUSES.VALIDATED, handler: 'CATEGORY_COMPOSITION',
      input: { category: 'CGHS-P', tokenPattern: 'Txxx' }, output: { prefix: 'P', finalPattern: 'PTxxx' }, sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '12' }, tests: ['CGHS-P + Txxx -> PTxxx']
    }),
    normalizeRule({
      ruleId: 'RAW_ALIAS_PROTECTION', priority: 100, status: RULE_STATUSES.UNVERIFIED, handler: 'RAW_ALIAS_PROTECTION',
      input: { rawAliases: RAW_ALIAS_CODES }, output: { finalCode: null, quantity: null }, reviewStatus: RESOLUTION_STATUSES.REVIEW_REQUIRED,
      reviewReason: 'Raw alias is not a final executable code without an explicit validated rule.', sourceReference: { file: 'PHASE_04_PROJECT_REQUIREMENTS', section: '13' }, tests: ['raw alias != validated final code']
    })
  ];
  return Object.freeze({ ruleSetVersion: RULE_SET_VERSION, sourceHierarchy: SOURCE_HIERARCHY, rules: Object.freeze(rules) });
}

function requestedDerivedCode(candidate) {
  const code = candidateRawCode(candidate);
  if (['CC001', 'WC001', 'CN002'].includes(code)) return code;
  const requested = normalizeCode(candidate?.requestedCode || candidate?.derivedCode || candidate?.outputCode || '');
  return ['CC001', 'WC001', 'CN002'].includes(requested) ? requested : null;
}

function conditionMatches(condition, candidate, context = {}) {
  const text = candidateText(candidate);
  switch (condition.type) {
    case 'DESCRIPTION_CONTAINS_ALL': return containsAll(candidate?.description || text, condition.terms || []);
    case 'TEXT_CONTAINS_ALL': return containsAll(text, condition.terms || []);
    case 'TEXT_CONTAINS_ANY': return containsAny(text, condition.terms || []);
    case 'CONTEXT_COUNT_REQUIRED': return Number.isFinite(context?.counts?.[condition.field]);
    default: return false;
  }
}

function contextConditionsMissing(rule, context = {}) {
  return (rule.conditions || [])
    .filter((condition) => condition.type === 'CONTEXT_COUNT_REQUIRED')
    .filter((condition) => !Number.isFinite(context?.counts?.[condition.field]))
    .map((condition) => condition.field);
}

function applyContextualAlias(rule, candidate) {
  const code = candidateRawCode(candidate);
  if (code !== normalizeCode(rule.input.codeRaw)) return null;
  if (!(rule.conditions || []).every((condition) => conditionMatches(condition, candidate))) return null;
  return { finalCode: rule.output.finalCode, quantity: rule.output.quantity === 'SOURCE_QUANTITY' ? candidateQuantity(candidate) : rule.output.quantity ?? null, unit: rule.output.unit || null };
}

function applyOxygenDuration(rule, candidate) {
  const code = candidateRawCode(candidate);
  if (code !== 'C002') return null;
  if (!(rule.conditions || []).every((condition) => conditionMatches(condition, candidate))) return null;
  return { finalCode: rule.output.finalCode, quantity: rule.output.quantity, unit: rule.output.unit || null };
}

function applyReviewContext(rule, candidate) {
  const code = candidateRawCode(candidate);
  if (rule.input?.codeRaw && code !== normalizeCode(rule.input.codeRaw)) return null;
  if (!(rule.conditions || []).every((condition) => conditionMatches(condition, candidate))) return null;
  return { finalCode: null, quantity: null, reviewOnly: true };
}

function applyDerived(rule, candidate, context = {}) {
  if (requestedDerivedCode(candidate) !== rule.input?.requestedCode) return null;
  const missing = contextConditionsMissing(rule, context);
  if (missing.length) return { missingContext: missing };
  if (rule.handler === 'DERIVED_COUNT') {
    return { finalCode: rule.output.finalCode, quantity: context.counts[rule.output.quantityFrom], unit: rule.output.unit || null, derivedInputs: { [rule.output.quantityFrom]: context.counts[rule.output.quantityFrom] } };
  }
  if (rule.handler === 'DERIVED_FORMULA') {
    const quantity = Object.entries(rule.output.formula || {}).reduce((total, [field, factor]) => total + (context.counts[field] * factor), 0);
    return { finalCode: rule.output.finalCode, quantity, unit: rule.output.unit || null, derivedInputs: Object.fromEntries(Object.keys(rule.output.formula || {}).map((field) => [field, context.counts[field]])) };
  }
  return null;
}

function categoryMarkerRegex(category) {
  const cleaned = String(category || '').replace(/^CGHS-/, '');
  return new RegExp(`\\bCGHS[-\\s]*${cleaned}\\b`, 'i');
}

function applyCategoryComposition(rule, candidate) {
  const text = candidateText(candidate);
  if (!categoryMarkerRegex(rule.input.category).test(text)) return null;
  const raw = candidateRawCode(candidate);
  let token = null;
  if (rule.input.tokenPattern === 'Bxxx') token = raw.match(/^B\d{3}$/) ? raw : ((text.match(/\bB\s*(\d{3})\b/i) || [])[1] ? `B${(text.match(/\bB\s*(\d{3})\b/i) || [])[1]}` : null);
  else if (rule.input.tokenPattern === 'Pxxx') token = raw.match(/^P\d{3}$/) ? raw : ((text.match(/\bP\s*(\d{3})\b/i) || [])[1] ? `P${(text.match(/\bP\s*(\d{3})\b/i) || [])[1]}` : null);
  else if (rule.input.tokenPattern === 'Txxx') token = raw.match(/^T\d{3}$/) ? raw : ((text.match(/\bT\s*(\d{3})\b/i) || [])[1] ? `T${(text.match(/\bT\s*(\d{3})\b/i) || [])[1]}` : null);
  else if (rule.input.tokenPattern === 'numeric') token = raw.match(/^\d{3}$/) ? raw : ((text.match(/\b(\d{3})\b/) || [])[1] || null);
  if (!token) return null;
  const digits = token.match(/(\d{3})$/)?.[1];
  if (!digits) return null;
  let finalCode = null;
  if (rule.output.finalPattern === 'LBxxx') finalCode = `LB${digits}`;
  else if (rule.output.finalPattern === 'RIxxx') finalCode = `RI${digits}`;
  else if (rule.output.finalPattern === 'CIxxx') finalCode = `CI${digits}`;
  else if (rule.output.finalPattern === 'GPxxx') finalCode = `GP${digits}`;
  else if (rule.output.finalPattern === 'PTxxx') finalCode = `PT${digits}`;
  return finalCode ? { finalCode, quantity: candidateQuantity(candidate), unit: rule.output.unit || null } : null;
}

function applyRawAliasProtection(rule, candidate) {
  const code = candidateRawCode(candidate);
  return RAW_ALIAS_SET.has(code) ? { finalCode: null, quantity: null, reviewOnly: true } : null;
}

function applyRule(rule, candidate, context = {}) {
  switch (rule.handler) {
    case 'CONTEXTUAL_ALIAS': return applyContextualAlias(rule, candidate);
    case 'OXYGEN_DURATION': return applyOxygenDuration(rule, candidate);
    case 'REVIEW_CONTEXT': return applyReviewContext(rule, candidate);
    case 'DERIVED_COUNT':
    case 'DERIVED_FORMULA': return applyDerived(rule, candidate, context);
    case 'CATEGORY_COMPOSITION': return applyCategoryComposition(rule, candidate);
    case 'RAW_ALIAS_PROTECTION': return applyRawAliasProtection(rule, candidate);
    default: return null;
  }
}

function outputKey(match) {
  return JSON.stringify({ finalCode: match.output.finalCode || null, quantity: match.output.quantity ?? null, status: match.status });
}

function mappingReason(rule, candidate, applied) {
  const raw = candidateRawCode(candidate) || 'source evidence';
  const context = candidate?.description || candidate?.evidence?.sourceText || candidate?.rawText || 'documented context';
  if (rule.handler === 'DERIVED_FORMULA') return `${rule.ruleId}: ${applied.finalCode} quantity derived from documented counts ${JSON.stringify(applied.derivedInputs)}.`;
  if (rule.handler === 'DERIVED_COUNT') return `${rule.ruleId}: ${applied.finalCode} quantity derived from documented count ${JSON.stringify(applied.derivedInputs)}.`;
  if (rule.handler === 'CATEGORY_COMPOSITION') return `${rule.ruleId}: category composition produced ${applied.finalCode} from ${raw}.`;
  return `${rule.ruleId}: ${raw} resolved from context "${context}" to ${applied.finalCode}.`;
}

function splitCompoundExpression(candidate) {
  const raw = String(candidate?.codeRaw || candidate?.rawText || candidate?.evidence?.sourceText || '');
  const explicitCodes = [...raw.matchAll(/\b[A-Z]{1,5}\d{3,6}\b/g)].map((match) => normalizeCode(match[0]));
  const hasCompoundJoiner = /\s(?:and)\s|[+/]/i.test(raw) || explicitCodes.length > 1;
  if (!hasCompoundJoiner) return { isCompound: false, components: [] };
  if (explicitCodes.length > 1 && /^[A-Z0-9\s+/(),.-]+$/i.test(raw)) {
    return {
      isCompound: true,
      status: 'SPLIT',
      rawExpression: raw,
      components: explicitCodes.map((code, index) => ({
        ...candidate,
        parentCandidateId: candidate.candidateId || null,
        candidateId: `${candidate.candidateId || 'candidate'}-component-${index + 1}`,
        componentIndex: index + 1,
        rawExpression: raw,
        codeRaw: code,
        codeNormalizedCandidate: code
      }))
    };
  }
  return { isCompound: true, status: 'AMBIGUOUS', rawExpression: raw, components: [] };
}

function directRegistryResult(candidate, registry, options = {}) {
  const code = candidateRawCode(candidate);
  if (!code || RAW_ALIAS_SET.has(code)) return null;
  const lookup = lookupRegistry(registry, code, { effectiveDate: options.effectiveDate });
  if (lookup.status === 'RULE_CONFLICT') {
    return { status: RESOLUTION_STATUSES.RULE_CONFLICT, registryLookup: lookup, reason: `Conflicting registry entries for ${code}.` };
  }
  if (lookup.status !== 'MATCH') return null;
  const entry = lookup.entry;
  const authorityStatus = lookup.authorityStatus || entry.authorityStatus || registry.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED;
  if (!isExecutableAuthority(authorityStatus)) {
    return { status: RESOLUTION_STATUSES.REVIEW_REQUIRED, registryLookup: lookup, entry, authorityStatus, reason: `Registry entry ${entry.entryId} is ${authorityStatus}; exact source evidence requires review before validation.` };
  }
  return { status: RESOLUTION_STATUSES.DIRECT_REGISTRY_MATCH, registryLookup: lookup, entry, authorityStatus, output: { finalCode: code, quantity: candidateQuantity(candidate), unit: entry.unit || null }, reason: `Exact authoritative registry match for ${code}.` };
}

function descriptionCandidateResult(candidate, registry) {
  if (!registry || !Array.isArray(registry.entries) || !candidate?.description) return null;
  const needle = normalizeDescription(candidate.description);
  if (!needle) return null;
  const matches = registry.entries.filter((entry) => normalizeDescription(entry.description) === needle || normalizeDescription(entry.description).includes(needle) || needle.includes(normalizeDescription(entry.description)));
  if (!matches.length) return null;
  return { status: RESOLUTION_STATUSES.REVIEW_REQUIRED, matches, reason: 'Description/near-description registry candidate match requires review; fuzzy matching cannot create a validated mapping.' };
}

function makeRuleMatch(rule, candidate, applied) {
  const status = rule.status === RULE_STATUSES.VALIDATED ? RESOLUTION_STATUSES.VALIDATED_MAPPING
    : (rule.status === RULE_STATUSES.BLOCKED ? RESOLUTION_STATUSES.REJECTED : (rule.reviewStatus || RESOLUTION_STATUSES.REVIEW_REQUIRED));
  return {
    rule,
    status,
    output: { finalCode: applied.finalCode || null, quantity: applied.quantity ?? null, unit: applied.unit || null },
    reason: applied.reviewOnly ? (rule.reviewReason || `${rule.ruleId} requires review.`) : mappingReason(rule, candidate, applied),
    applied
  };
}

function resolveCandidate(candidate, options = {}) {
  const registry = options.registry || null;
  const ruleSet = options.ruleSet || getDefaultRuleSet();
  const context = options.context || {};
  const base = resultBase(candidate, { ...options, registry, ruleSet });

  if (!candidate || typeof candidate !== 'object') return { ...base, status: RESOLUTION_STATUSES.REVIEW_REQUIRED, reason: 'Candidate is missing or invalid.' };
  const section = String(candidate.section || candidate.evidence?.sourceSection || '').toUpperCase();
  if (section === 'PATIENT_PAYABLE') {
    return { ...base, status: RESOLUTION_STATUSES.REVIEW_REQUIRED, authorityStatus: AUTHORITY_STATUSES.PARSER_EVIDENCE, reason: 'Patient Payable evidence is separated and not included in the main CGHS rule-resolution pool without an explicit rule.' };
  }

  const compound = splitCompoundExpression(candidate);
  if (compound.isCompound) {
    return {
      ...base,
      status: RESOLUTION_STATUSES.REVIEW_REQUIRED,
      reason: compound.status === 'SPLIT' ? 'Compound expression was split into preserved components for review; Phase 4 does not silently aggregate guessed components.' : 'Compound expression is ambiguous and requires review.',
      evidence: [...base.evidence, { type: 'COMPOUND_EXPRESSION', rawExpression: compound.rawExpression, components: compound.components.map((item) => ({ candidateId: item.candidateId, codeRaw: item.codeRaw, parentCandidateId: item.parentCandidateId, componentIndex: item.componentIndex })) }]
    };
  }

  const direct = directRegistryResult(candidate, registry, options);
  if (direct?.status === RESOLUTION_STATUSES.DIRECT_REGISTRY_MATCH) {
    return { ...base, status: direct.status, output: direct.output, registryEntryId: direct.entry.entryId, authorityStatus: direct.authorityStatus, reason: direct.reason, evidence: [...base.evidence, { type: 'REGISTRY_ENTRY', entryId: direct.entry.entryId, code: direct.entry.code, sourceReference: direct.entry.sourceReference }] };
  }
  if (direct?.status === RESOLUTION_STATUSES.RULE_CONFLICT) {
    return { ...base, status: RESOLUTION_STATUSES.RULE_CONFLICT, authorityStatus: direct.registryLookup.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED, reason: direct.reason, conflicts: direct.registryLookup.conflicts.map((entry) => ({ type: 'REGISTRY_ENTRY', entryId: entry.entryId, code: entry.code, description: entry.description })) };
  }

  const matches = [];
  const reviewMatches = [];
  const missingContextMatches = [];
  for (const rule of ruleSet.rules || []) {
    const applied = applyRule(rule, candidate, context);
    if (!applied) continue;
    if (applied.missingContext?.length) { missingContextMatches.push({ rule, missingContext: applied.missingContext }); continue; }
    const match = makeRuleMatch(rule, candidate, applied);
    if (match.status === RESOLUTION_STATUSES.VALIDATED_MAPPING) matches.push(match);
    else reviewMatches.push(match);
  }

  if (matches.length) {
    const distinct = new Map();
    for (const match of matches) distinct.set(outputKey(match), match);
    if (distinct.size > 1) {
      return {
        ...base,
        status: RESOLUTION_STATUSES.RULE_CONFLICT,
        authorityStatus: AUTHORITY_STATUSES.PROJECT_APPROVED,
        reason: 'Multiple VALIDATED rules produced conflicting outputs. No arbitrary winner was selected.',
        conflicts: matches.map((match) => ({ ruleId: match.rule.ruleId, output: match.output, priority: match.rule.priority, reason: match.reason }))
      };
    }
    const selected = matches.slice().sort((a, b) => (b.rule.priority - a.rule.priority) || a.rule.ruleId.localeCompare(b.rule.ruleId))[0];
    return {
      ...base,
      status: RESOLUTION_STATUSES.VALIDATED_MAPPING,
      output: { finalCode: selected.output.finalCode, quantity: selected.output.quantity, unit: selected.output.unit || null },
      ruleId: selected.rule.ruleId,
      authorityStatus: AUTHORITY_STATUSES.PROJECT_APPROVED,
      reason: selected.reason,
      evidence: [...base.evidence, { type: 'RULE', ruleId: selected.rule.ruleId, priority: selected.rule.priority, sourceReference: selected.rule.sourceReference, conditions: selected.rule.conditions || [] }]
    };
  }

  if (direct?.status === RESOLUTION_STATUSES.REVIEW_REQUIRED) {
    return { ...base, status: RESOLUTION_STATUSES.REVIEW_REQUIRED, registryEntryId: direct.entry.entryId, authorityStatus: direct.authorityStatus, reason: direct.reason, evidence: [...base.evidence, { type: 'REGISTRY_ENTRY_UNVERIFIED', entryId: direct.entry.entryId, code: direct.entry.code, sourceReference: direct.entry.sourceReference }] };
  }

  if (reviewMatches.length) {
    const selected = reviewMatches.slice().sort((a, b) => (b.rule.priority - a.rule.priority) || a.rule.ruleId.localeCompare(b.rule.ruleId))[0];
    return { ...base, status: selected.status, ruleId: selected.rule.ruleId, authorityStatus: selected.rule.status === RULE_STATUSES.BLOCKED ? AUTHORITY_STATUSES.BLOCKED : AUTHORITY_STATUSES.UNVERIFIED, reason: selected.reason, evidence: [...base.evidence, { type: 'RULE_REVIEW', ruleId: selected.rule.ruleId, sourceReference: selected.rule.sourceReference }] };
  }

  if (missingContextMatches.length) {
    const selected = missingContextMatches.slice().sort((a, b) => (b.rule.priority - a.rule.priority) || a.rule.ruleId.localeCompare(b.rule.ruleId))[0];
    return { ...base, status: RESOLUTION_STATUSES.REVIEW_REQUIRED, ruleId: selected.rule.ruleId, authorityStatus: AUTHORITY_STATUSES.PROJECT_APPROVED, reason: `Required derived-rule evidence is missing or ambiguous: ${selected.missingContext.join(', ')}.` };
  }

  const fuzzy = descriptionCandidateResult(candidate, registry);
  if (fuzzy) {
    return { ...base, status: fuzzy.status, authorityStatus: AUTHORITY_STATUSES.UNVERIFIED, registryEntryId: fuzzy.matches[0].entryId || null, reason: fuzzy.reason, evidence: [...base.evidence, { type: 'CANDIDATE_MATCH', matches: fuzzy.matches.map((entry) => ({ entryId: entry.entryId, code: entry.code, description: entry.description })).slice(0, 5) }] };
  }

  const raw = candidateRawCode(candidate);
  if (RAW_ALIAS_SET.has(raw)) {
    return { ...base, status: RESOLUTION_STATUSES.REVIEW_REQUIRED, authorityStatus: AUTHORITY_STATUSES.UNVERIFIED, reason: 'Raw alias is protected and no validated rule established a final code.' };
  }

  return { ...base, status: RESOLUTION_STATUSES.NO_MATCH, authorityStatus: registry ? (registry.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED) : AUTHORITY_STATUSES.UNVERIFIED, reason: 'No authoritative registry entry or validated rule matched this candidate.' };
}

function summarizeResolution(results) {
  const counts = Object.fromEntries(Object.values(RESOLUTION_STATUSES).map((status) => [status, 0]));
  for (const result of results) counts[result.status] = (counts[result.status] || 0) + 1;
  return counts;
}

function resolveCandidates(candidates, options = {}) {
  const runId = options.resolutionRunId || `resolution-run-${crypto.randomUUID()}`;
  const startedAt = options.startedAt || new Date().toISOString();
  const ruleSet = options.ruleSet || getDefaultRuleSet();
  const registry = options.registry || null;
  const results = (candidates || []).map((candidate) => resolveCandidate({ ...candidate, runId: candidate.runId || options.parserRunId || candidate.runId }, { ...options, ruleSet, registry, runId }));
  const finishedAt = options.finishedAt || new Date().toISOString();
  return {
    schemaVersion: RESOLUTION_SCHEMA_VERSION,
    runId,
    billSessionId: options.billSessionId || candidates?.[0]?.billSessionId || null,
    parserRunId: options.parserRunId || candidates?.[0]?.runId || null,
    parserVersion: options.parserVersion || null,
    registryVersion: registry?.registryVersion || null,
    registrySourceHash: registry?.sourceHash || null,
    registryAuthorityStatus: registry?.authorityStatus || AUTHORITY_STATUSES.UNVERIFIED,
    ruleSetVersion: ruleSet.ruleSetVersion,
    status: results.some((result) => result.status === RESOLUTION_STATUSES.RULE_CONFLICT) ? RESOLUTION_STATUSES.RULE_CONFLICT
      : (results.some((result) => [RESOLUTION_STATUSES.REVIEW_REQUIRED, RESOLUTION_STATUSES.UNRESOLVED_MAPPING, RESOLUTION_STATUSES.NO_MATCH].includes(result.status)) ? RESOLUTION_STATUSES.REVIEW_REQUIRED : RESOLUTION_STATUSES.VALIDATED_MAPPING),
    resultCount: results.length,
    counts: summarizeResolution(results),
    results,
    metrics: { startedAt, finishedAt, durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)) }
  };
}

function resolveParseResult(parseResult, options = {}) {
  return resolveCandidates(parseResult?.candidates || [], {
    ...options,
    billSessionId: parseResult?.billSessionId || options.billSessionId,
    parserRunId: parseResult?.runId || options.parserRunId,
    parserVersion: parseResult?.parserVersion || options.parserVersion
  });
}

function resolveStoredSourceBill(storageService, billSessionId, options = {}) {
  const parse = storageService.readParseResult(billSessionId);
  if (parse.status !== 'SUCCESS') return { status: RESOLUTION_STATUSES.REVIEW_REQUIRED, billSessionId, error: parse.error || parse.status, results: [] };
  const resolution = resolveParseResult(parse.result, options);
  storageService.writeResolutionResult(billSessionId, resolution);
  storageService.appendAudit({
    runId: resolution.runId,
    billSessionId,
    operation: 'CGHS_RULE_RESOLUTION_COMPLETED',
    stage: 'CGHS_RESOLUTION',
    status: resolution.status,
    sourceRef: { registryVersion: resolution.registryVersion, registrySourceHash: resolution.registrySourceHash, ruleSetVersion: resolution.ruleSetVersion, counts: resolution.counts }
  });
  return resolution;
}

module.exports = {
  RAW_ALIAS_CODES,
  RESOLUTION_SCHEMA_VERSION,
  RESOLUTION_STATUSES,
  RULE_SET_VERSION,
  RULE_STATUSES,
  applyRule,
  candidateRawCode,
  getDefaultRuleSet,
  resolveCandidate,
  resolveCandidates,
  resolveParseResult,
  resolveStoredSourceBill,
  splitCompoundExpression
};
