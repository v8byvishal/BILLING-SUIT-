'use strict';

const crypto = require('node:crypto');
const { stableStringify, isExecutableAuthority, normalizeCode } = require('./registry');
const { RESOLUTION_STATUSES, RULE_SET_VERSION } = require('./rule-resolution');

const PLAN_SCHEMA_VERSION = 1;
const PLAN_VERSION = '5.0.0';
const PLAN_STATUSES = Object.freeze({
  NOT_CREATED: 'NOT_CREATED',
  BUILDING: 'BUILDING',
  VALIDATED: 'VALIDATED',
  VALIDATED_WITH_REVIEW: 'VALIDATED_WITH_REVIEW',
  BLOCKED: 'BLOCKED',
  INVALID: 'INVALID',
  STALE: 'STALE'
});
const PLAN_READINESS = Object.freeze({
  NOT_READY: 'NOT_READY',
  READY_FOR_PORTAL_VALIDATION: 'READY_FOR_PORTAL_VALIDATION',
  BLOCKED: 'BLOCKED',
  STALE: 'STALE'
});
const ACTION_STATES = Object.freeze({ VALIDATED_ACTION: 'VALIDATED_ACTION' });
const REVIEW_STATUS = 'REVIEW_REQUIRED';
const EXCLUDED_STATUS = 'EXCLUDED';

const VALID_PLAN_STATUS = new Set(Object.values(PLAN_STATUSES));
const VALID_READINESS = new Set(Object.values(PLAN_READINESS));
const EXECUTABLE_RESOLUTION_STATUSES = new Set([
  RESOLUTION_STATUSES.VALIDATED_MAPPING,
  RESOLUTION_STATUSES.DIRECT_REGISTRY_MATCH
]);
const SECRET_OR_EXECUTION_FIELD = /(password|credential|cookie|token|secret|api[_-]?key|authorization|authentication|selenium|browserwindow|cdp|pythonprocess|processhandle|shellcommand|command|execute|portalaction)/i;
const MAX_SAFE_QUANTITY = 100000;
const PROTECTED_RAW_ALIAS_CODES = new Set(['C002', 'C003', 'C008', 'C010', 'C011', 'C012', 'C014', 'N002', 'P001', 'T004', 'T005']);
const SUPPORTED_UNITS = new Set([null, 'COUNT', 'HOUR', 'DAY', 'UNIT', 'SESSION', 'ML', 'MG', 'AMOUNT']);

function canonicalizeForPlanHash(value, key = '') {
  if (value === undefined) return undefined;
  if (key === 'createdAt' || key === 'planSha256' || key === 'validation' || key === 'runtimeDiagnostics') return undefined;
  if (key === 'planId') return undefined;
  if (Array.isArray(value)) return value.map((item) => canonicalizeForPlanHash(item)).filter((item) => item !== undefined);
  if (value && typeof value === 'object') {
    const output = {};
    for (const childKey of Object.keys(value).sort()) {
      const child = canonicalizeForPlanHash(value[childKey], childKey);
      if (child !== undefined) output[childKey] = child;
    }
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value;
}

function computePlanHash(plan) {
  return crypto.createHash('sha256').update(stableStringify(canonicalizeForPlanHash(plan))).digest('hex');
}

function validateQuantity(value, options = {}) {
  const required = options.required !== false;
  if (value == null || value === '') return { ok: !required, reasonCode: required ? 'QUANTITY_MISSING' : null, reason: required ? 'Quantity is required for a validated action.' : null };
  if (typeof value === 'number' && !Number.isFinite(value)) return { ok: false, reasonCode: Number.isNaN(value) ? 'QUANTITY_NAN' : 'QUANTITY_INFINITY', reason: 'Quantity must be finite.' };
  const number = typeof value === 'number' ? value : Number(String(value).replace(/[,\s]/g, ''));
  if (!Number.isFinite(number)) return { ok: false, reasonCode: 'QUANTITY_INVALID', reason: 'Quantity must be numeric.' };
  if (number <= 0) return { ok: false, reasonCode: number === 0 ? 'QUANTITY_ZERO' : 'QUANTITY_NEGATIVE', reason: 'Quantity must be greater than zero.' };
  if (number > MAX_SAFE_QUANTITY) return { ok: false, reasonCode: 'QUANTITY_ABSURDLY_LARGE', reason: `Quantity exceeds the supported maximum of ${MAX_SAFE_QUANTITY}.` };
  const text = String(value);
  const decimals = text.includes('.') ? text.split('.').pop().replace(/[^0-9]/g, '').length : 0;
  if (decimals > 3) return { ok: false, reasonCode: 'QUANTITY_PRECISION_UNSUPPORTED', reason: 'Quantity precision greater than 3 decimal places is not supported.' };
  return { ok: true, quantity: Number(number.toFixed(3)), reasonCode: null, reason: null };
}

function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

function issue(severity, code, message, details = {}) {
  return { severity, code, message, details };
}

function containsUnsafeKeys(value, path = []) {
  const found = [];
  if (!value || typeof value !== 'object') return found;
  for (const [key, child] of Object.entries(value)) {
    const next = [...path, key];
    if (SECRET_OR_EXECUTION_FIELD.test(key)) found.push(next.join('.'));
    if (child && typeof child === 'object') found.push(...containsUnsafeKeys(child, next));
  }
  return found;
}

function validateEvidence(evidence) {
  return isObject(evidence) && (evidence.pageNumber != null || evidence.text || evidence.sourceText || evidence.section);
}

function validateAction(action, plan, ruleSetContext, issues) {
  if (!action.actionId) issues.push(issue('FAIL', 'ACTION_ID_MISSING', 'Action requires actionId', { candidateId: action.candidateId || null }));
  if (!action.candidateId) issues.push(issue('FAIL', 'ACTION_CANDIDATE_MISSING', 'Action requires candidateId', { actionId: action.actionId || null }));
  if (!validateEvidence(action.sourceEvidence)) issues.push(issue('FAIL', 'ACTION_PROVENANCE_MISSING', 'Action requires source evidence', { actionId: action.actionId || null }));
  if (!action.resolved?.finalCode) issues.push(issue('FAIL', 'ACTION_FINAL_CODE_MISSING', 'Action requires final code', { actionId: action.actionId || null }));
  const finalCode = normalizeCode(action.resolved?.finalCode || action.finalCode || '');
  if (finalCode && PROTECTED_RAW_ALIAS_CODES.has(finalCode) && !action.resolution?.ruleId) issues.push(issue('FAIL', 'ACTION_PROTECTED_ALIAS_WITHOUT_RULE', 'Protected raw alias cannot be executable without an explicit validated rule', { actionId: action.actionId || null, finalCode }));
  if (action.finalCode && finalCode !== normalizeCode(action.finalCode)) issues.push(issue('FAIL', 'ACTION_FINAL_CODE_MISMATCH', 'Top-level action finalCode must match resolved finalCode', { actionId: action.actionId || null }));
  const quantity = validateQuantity(action.resolved?.quantity);
  if (!quantity.ok) issues.push(issue('FAIL', quantity.reasonCode, quantity.reason, { actionId: action.actionId || null, quantity: action.resolved?.quantity }));
  const unit = action.resolved?.unit ?? null;
  if (!SUPPORTED_UNITS.has(unit)) issues.push(issue('FAIL', 'ACTION_UNIT_UNSUPPORTED', 'Action unit is not in the supported semantic unit set', { actionId: action.actionId || null, unit }));
  if (action.quantity && Number(action.quantity.value) !== Number(action.resolved?.quantity)) issues.push(issue('FAIL', 'ACTION_QUANTITY_MISMATCH', 'Top-level action quantity must match resolved quantity', { actionId: action.actionId || null }));
  if (!EXECUTABLE_RESOLUTION_STATUSES.has(action.resolution?.status)) issues.push(issue('FAIL', 'ACTION_RESOLUTION_NOT_VALIDATED', 'Action resolution status must be validated/direct', { actionId: action.actionId || null, status: action.resolution?.status }));
  if (action.resolution?.authorityStatus && !isExecutableAuthority(action.resolution.authorityStatus)) issues.push(issue('FAIL', 'ACTION_AUTHORITY_UNACCEPTABLE', 'Action authority status is not acceptable', { actionId: action.actionId || null, authorityStatus: action.resolution.authorityStatus }));
  if (action.resolution?.ruleId) {
    const rule = (ruleSetContext?.rules || []).find((item) => item.ruleId === action.resolution.ruleId);
    if (!rule) issues.push(issue('FAIL', 'ACTION_RULE_UNKNOWN', 'Referenced rule is not in the rule set', { actionId: action.actionId, ruleId: action.resolution.ruleId }));
    else if (rule.status !== 'VALIDATED') issues.push(issue('FAIL', 'ACTION_RULE_NOT_VALIDATED', 'Referenced rule is not VALIDATED', { actionId: action.actionId, ruleId: action.resolution.ruleId, status: rule.status }));
  } else if (!action.resolution?.registryEntryId) {
    issues.push(issue('FAIL', 'ACTION_RULE_OR_REGISTRY_REQUIRED', 'Action requires ruleId or registryEntryId', { actionId: action.actionId || null }));
  }
  if (action.billSessionId && action.billSessionId !== plan.billSessionId) issues.push(issue('FAIL', 'ACTION_BILL_SESSION_MISMATCH', 'Action billSessionId does not match plan', { actionId: action.actionId, billSessionId: action.billSessionId, planBillSessionId: plan.billSessionId }));
  if (!action.aggregation?.groupKey || !Array.isArray(action.aggregation.sourceCandidateIds) || !action.aggregation.sourceCandidateIds.length) {
    issues.push(issue('FAIL', 'ACTION_AGGREGATION_INVALID', 'Action requires aggregation group and sourceCandidateIds', { actionId: action.actionId || null }));
  }
  if (action.state !== ACTION_STATES.VALIDATED_ACTION) issues.push(issue('FAIL', 'ACTION_STATE_INVALID', 'Action state must be VALIDATED_ACTION', { actionId: action.actionId || null, state: action.state }));
}

function validateReview(review, issues) {
  if (!review.reviewId) issues.push(issue('FAIL', 'REVIEW_ID_MISSING', 'Review item requires reviewId', { candidateId: review.candidateId || null }));
  if (!review.reason) issues.push(issue('FAIL', 'REVIEW_REASON_MISSING', 'Review item requires reason', { reviewId: review.reviewId || null }));
  if (!review.reasonCode) issues.push(issue('FAIL', 'REVIEW_REASON_CODE_MISSING', 'Review item requires reasonCode', { reviewId: review.reviewId || null }));
  if (review.candidateId && !validateEvidence(review.sourceEvidence)) issues.push(issue('FAIL', 'REVIEW_EVIDENCE_MISSING', 'Review item requires source evidence when tied to a candidate', { reviewId: review.reviewId || null }));
  if (review.status !== REVIEW_STATUS) issues.push(issue('FAIL', 'REVIEW_STATUS_INVALID', 'Review item status must be REVIEW_REQUIRED', { reviewId: review.reviewId || null, status: review.status }));
}

function validateExcluded(excluded, issues) {
  if (!excluded.exclusionId) issues.push(issue('FAIL', 'EXCLUSION_ID_MISSING', 'Excluded item requires exclusionId', { candidateId: excluded.candidateId || null }));
  if (!excluded.reason) issues.push(issue('FAIL', 'EXCLUSION_REASON_MISSING', 'Excluded item requires reason', { exclusionId: excluded.exclusionId || null }));
  if (excluded.candidateId && !validateEvidence(excluded.sourceEvidence)) issues.push(issue('FAIL', 'EXCLUSION_EVIDENCE_MISSING', 'Excluded item requires source evidence when tied to a candidate', { exclusionId: excluded.exclusionId || null }));
  if (excluded.status !== EXCLUDED_STATUS) issues.push(issue('FAIL', 'EXCLUSION_STATUS_INVALID', 'Excluded item status must be EXCLUDED', { exclusionId: excluded.exclusionId || null, status: excluded.status }));
}

function detectStalePlan(plan, context = {}) {
  const reasons = [];
  const createdAgainst = plan?.createdAgainst || {};
  const comparisons = [
    ['parserVersion', context.parserVersion],
    ['registryVersion', context.registryVersion],
    ['registrySourceHash', context.registrySourceHash],
    ['ruleSetVersion', context.ruleSetVersion]
  ];
  for (const [field, current] of comparisons) {
    if (current != null && createdAgainst[field] != null && createdAgainst[field] !== current) {
      reasons.push({ field, planValue: createdAgainst[field], currentValue: current });
    }
  }
  return { stale: reasons.length > 0, reasons };
}

function markPlanStale(plan, context = {}) {
  const stale = detectStalePlan(plan, context);
  if (!stale.stale) return { ...plan };
  return {
    ...plan,
    status: PLAN_STATUSES.STALE,
    readiness: PLAN_READINESS.STALE,
    diagnostics: { ...(plan.diagnostics || {}), staleReasons: stale.reasons }
  };
}

class EnhancementPlanValidator {
  constructor(options = {}) {
    this.ruleSetContext = options.ruleSetContext || { ruleSetVersion: RULE_SET_VERSION, rules: [] };
  }

  validate(plan, context = {}) {
    const issues = [];
    if (!isObject(plan)) return { status: 'FAIL', issues: [issue('FAIL', 'PLAN_NOT_OBJECT', 'Plan must be an object')], valid: false };
    if (plan.schemaVersion !== PLAN_SCHEMA_VERSION) issues.push(issue('FAIL', 'PLAN_SCHEMA_INVALID', 'Unsupported plan schema version', { schemaVersion: plan.schemaVersion }));
    if (plan.planVersion !== PLAN_VERSION) issues.push(issue('FAIL', 'PLAN_VERSION_INVALID', 'Unsupported plan version', { planVersion: plan.planVersion }));
    if (!plan.planId) issues.push(issue('FAIL', 'PLAN_ID_MISSING', 'planId is required'));
    if (!plan.billSessionId) issues.push(issue('FAIL', 'PLAN_BILL_SESSION_MISSING', 'billSessionId is required'));
    if (!plan.sourceBillId) issues.push(issue('FAIL', 'PLAN_SOURCE_BILL_MISSING', 'sourceBillId is required'));
    if (!VALID_PLAN_STATUS.has(plan.status)) issues.push(issue('FAIL', 'PLAN_STATUS_INVALID', 'Plan status is invalid', { status: plan.status }));
    if (!VALID_READINESS.has(plan.readiness)) issues.push(issue('FAIL', 'PLAN_READINESS_INVALID', 'Plan readiness is invalid', { readiness: plan.readiness }));
    const registryContext = plan.registryContext || plan.registry;
    const ruleContext = plan.ruleContext || plan.rules;
    if (!isObject(registryContext) || !registryContext.registryVersion || !registryContext.registrySourceHash || !registryContext.authorityStatus) issues.push(issue('FAIL', 'PLAN_REGISTRY_CONTEXT_MISSING', 'Registry context is required'));
    if (!isObject(ruleContext) || !ruleContext.ruleSetVersion) issues.push(issue('FAIL', 'PLAN_RULE_CONTEXT_MISSING', 'Rule set context is required'));
    if (!isObject(plan.createdAgainst) || !plan.createdAgainst.parserVersion || !plan.createdAgainst.registryVersion || !plan.createdAgainst.registrySourceHash || !plan.createdAgainst.ruleSetVersion) issues.push(issue('FAIL', 'PLAN_CREATED_AGAINST_MISSING', 'createdAgainst parser/registry/rule context is required'));
    if (!Array.isArray(plan.actions)) issues.push(issue('FAIL', 'PLAN_ACTIONS_INVALID', 'actions must be an array'));
    if (!Array.isArray(plan.reviewItems)) issues.push(issue('FAIL', 'PLAN_REVIEWS_INVALID', 'reviewItems must be an array'));
    if (!Array.isArray(plan.excludedItems)) issues.push(issue('FAIL', 'PLAN_EXCLUDED_INVALID', 'excludedItems must be an array'));
    if (plan.readiness === PLAN_READINESS.READY_FOR_PORTAL_VALIDATION && (!Array.isArray(plan.actions) || !plan.actions.length)) issues.push(issue('FAIL', 'PLAN_READY_WITHOUT_ACTIONS', 'READY_FOR_PORTAL_VALIDATION requires at least one validated action'));
    if (plan.status === PLAN_STATUSES.BLOCKED && plan.readiness !== PLAN_READINESS.BLOCKED) issues.push(issue('FAIL', 'PLAN_BLOCKED_READINESS_INVALID', 'BLOCKED plans must have BLOCKED readiness'));
    if (plan.status === PLAN_STATUSES.STALE && plan.readiness !== PLAN_READINESS.STALE) issues.push(issue('FAIL', 'PLAN_STALE_READINESS_INVALID', 'STALE plans must have STALE readiness'));

    const unsafe = containsUnsafeKeys(plan);
    for (const item of unsafe) issues.push(issue('FAIL', 'PLAN_UNSAFE_FIELD', 'Plan contains a credential/execution-shaped field', { field: item }));

    const actionIds = new Set();
    const reviewIds = new Set();
    const exclusionIds = new Set();
    const groupUnits = new Map();
    const sourceCandidateIds = new Set(context.sourceCandidateIds || plan.diagnostics?.sourceCandidateIds || []);
    const representedCandidateIds = new Set();

    for (const action of plan.actions || []) {
      if (actionIds.has(action.actionId)) issues.push(issue('FAIL', 'ACTION_ID_DUPLICATE', 'Action IDs must be unique', { actionId: action.actionId }));
      if (action.actionId) actionIds.add(action.actionId);
      validateAction(action, plan, this.ruleSetContext, issues);
      if (sourceCandidateIds.size) {
        for (const candidateId of action.aggregation?.sourceCandidateIds || [action.candidateId].filter(Boolean)) {
          if (candidateId) representedCandidateIds.add(candidateId);
          if (candidateId && !sourceCandidateIds.has(candidateId)) issues.push(issue('FAIL', 'ACTION_SOURCE_CANDIDATE_NOT_IN_SOURCE_BILL', 'Action references a candidate outside the source bill parser result', { actionId: action.actionId, candidateId }));
        }
      } else {
        for (const candidateId of action.aggregation?.sourceCandidateIds || [action.candidateId].filter(Boolean)) if (candidateId) representedCandidateIds.add(candidateId);
      }
      const groupKey = action.aggregation?.groupKey;
      if (groupKey) {
        const existing = groupUnits.get(groupKey);
        if (existing && existing !== (action.resolved?.unit || null)) issues.push(issue('FAIL', 'AGGREGATION_UNIT_MISMATCH', 'Aggregation group mixes units', { groupKey, units: [existing, action.resolved?.unit || null] }));
        groupUnits.set(groupKey, action.resolved?.unit || null);
      }
    }
    for (const review of plan.reviewItems || []) {
      if (reviewIds.has(review.reviewId)) issues.push(issue('FAIL', 'REVIEW_ID_DUPLICATE', 'Review IDs must be unique', { reviewId: review.reviewId }));
      if (review.reviewId) reviewIds.add(review.reviewId);
      validateReview(review, issues);
      if (review.candidateId) representedCandidateIds.add(review.candidateId);
      if (sourceCandidateIds.size && review.candidateId && !sourceCandidateIds.has(review.candidateId)) issues.push(issue('FAIL', 'REVIEW_SOURCE_CANDIDATE_NOT_IN_SOURCE_BILL', 'Review item references a candidate outside the source bill parser result', { reviewId: review.reviewId, candidateId: review.candidateId }));
    }
    for (const excluded of plan.excludedItems || []) {
      if (exclusionIds.has(excluded.exclusionId)) issues.push(issue('FAIL', 'EXCLUSION_ID_DUPLICATE', 'Excluded item IDs must be unique', { exclusionId: excluded.exclusionId }));
      if (excluded.exclusionId) exclusionIds.add(excluded.exclusionId);
      validateExcluded(excluded, issues);
      if (excluded.candidateId) representedCandidateIds.add(excluded.candidateId);
      if (sourceCandidateIds.size && excluded.candidateId && !sourceCandidateIds.has(excluded.candidateId)) issues.push(issue('FAIL', 'EXCLUDED_SOURCE_CANDIDATE_NOT_IN_SOURCE_BILL', 'Excluded item references a candidate outside the source bill parser result', { exclusionId: excluded.exclusionId, candidateId: excluded.candidateId }));
    }
    if (sourceCandidateIds.size) {
      for (const candidateId of sourceCandidateIds) {
        if (!representedCandidateIds.has(candidateId)) issues.push(issue('FAIL', 'PLAN_SOURCE_CANDIDATE_NOT_REPRESENTED', 'Every parser candidate must be represented as an action, review item, or excluded item', { candidateId }));
      }
    }

    if (context.billSessionId && plan.billSessionId !== context.billSessionId) issues.push(issue('FAIL', 'PLAN_CONTEXT_BILL_SESSION_MISMATCH', 'Plan billSessionId does not match validation context', { planBillSessionId: plan.billSessionId, contextBillSessionId: context.billSessionId }));
    if (context.sourceBillId && plan.sourceBillId !== context.sourceBillId) issues.push(issue('FAIL', 'PLAN_CONTEXT_SOURCE_BILL_MISMATCH', 'Plan sourceBillId does not match validation context', { planSourceBillId: plan.sourceBillId, contextSourceBillId: context.sourceBillId }));
    if (context.sourceExists === false) issues.push(issue('FAIL', 'PLAN_SOURCE_MISSING', 'Source bill artifact is missing'));
    const stale = detectStalePlan(plan, context);
    if (stale.stale) issues.push(issue('WARN', 'PLAN_STALE', 'Plan was generated against an earlier parser/registry/rule context', { reasons: stale.reasons }));

    const expectedHash = computePlanHash(plan);
    if (!plan.planSha256) issues.push(issue('FAIL', 'PLAN_HASH_MISSING', 'Plan hash is required'));
    else if (plan.planSha256 !== expectedHash) issues.push(issue('FAIL', 'PLAN_HASH_MISMATCH', 'Plan hash does not match canonical plan content', { expectedHash, actualHash: plan.planSha256 }));

    const hasFail = issues.some((item) => item.severity === 'FAIL');
    const hasWarn = issues.some((item) => item.severity === 'WARN');
    return {
      status: hasFail ? 'FAIL' : (hasWarn ? 'WARN' : 'PASS'),
      valid: !hasFail,
      issues,
      expectedHash,
      stale
    };
  }
}

module.exports = {
  ACTION_STATES,
  EXCLUDED_STATUS,
  EXECUTABLE_RESOLUTION_STATUSES,
  MAX_SAFE_QUANTITY,
  PLAN_READINESS,
  PLAN_SCHEMA_VERSION,
  PLAN_STATUSES,
  PLAN_VERSION,
  PROTECTED_RAW_ALIAS_CODES,
  REVIEW_STATUS,
  SUPPORTED_UNITS,
  EnhancementPlanValidator,
  computePlanHash,
  detectStalePlan,
  markPlanStale,
  validateQuantity
};
