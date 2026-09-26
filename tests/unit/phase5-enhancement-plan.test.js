'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const matrix = require('../fixtures/plans/phase5-matrix.json');
const { StorageService } = require('../../src/core/storage');
const { AUTHORITY_STATUSES } = require('../../src/services/cghs/registry');
const { RESOLUTION_STATUSES, RULE_SET_VERSION, getDefaultRuleSet, resolveCandidate } = require('../../src/services/cghs/rule-resolution');
const {
  EnhancementPlanBuilder,
  createPlanSummary
} = require('../../src/services/cghs/plan-builder');
const {
  EnhancementPlanValidator,
  PLAN_READINESS,
  PLAN_STATUSES,
  computePlanHash,
  detectStalePlan,
  validateQuantity
} = require('../../src/services/cghs/plan-validator');

const FIXED_DATE = '2026-09-27T00:00:00.000Z';
const DEFAULT_BILL_SESSION = 'bill-session-phase5';
const DEFAULT_REGISTRY = Object.freeze({
  status: 'READY',
  registryVersion: 'phase5-test-registry',
  registrySourceHash: 'phase5-test-registry-hash',
  authorityStatus: AUTHORITY_STATUSES.TEST_ONLY,
  source: { type: 'TEST_ONLY_JSON', file: 'phase5-registry.json' }
});
const DEFAULT_RULE_ID = 'CGHS_C_008_BLOOD_TRANSFUSION';
const DEFAULT_RULE_SET = getDefaultRuleSet();

function candidate(id, overrides = {}) {
  const numeric = Number(String(id).replace(/\D/g, '')) || 1;
  const codeRaw = overrides.codeRaw ?? 'C008';
  const description = overrides.description ?? 'Blood Transfusion Charge';
  const quantityRaw = Object.prototype.hasOwnProperty.call(overrides, 'quantityRaw') ? overrides.quantityRaw : '1';
  const quantityNormalized = Object.prototype.hasOwnProperty.call(overrides, 'quantityNormalized') ? overrides.quantityNormalized : 1;
  const section = overrides.section || 'PROCEDURES';
  return {
    candidateId: id,
    billSessionId: overrides.billSessionId || DEFAULT_BILL_SESSION,
    runId: overrides.runId || 'parser-run-phase5',
    pageNumber: overrides.pageNumber || 1,
    section,
    description,
    rawText: overrides.rawText || `${description} (${codeRaw}) Qty ${quantityRaw}`,
    codeRaw,
    codeNormalizedCandidate: String(codeRaw || '').replace(/\s+/g, '').toUpperCase() || null,
    quantityRaw,
    quantityNormalized,
    evidence: overrides.evidence || {
      pageNumber: overrides.pageNumber || 1,
      sourceSection: section,
      sourceText: overrides.rawText || `${description} (${codeRaw}) Qty ${quantityRaw}`,
      lineNumbers: overrides.lineNumbers || [numeric]
    },
    status: overrides.status || 'VALID_EVIDENCE',
    confidence: overrides.confidence ?? 0.9
  };
}

function parserResult(candidates, overrides = {}) {
  return {
    billSessionId: overrides.billSessionId || DEFAULT_BILL_SESSION,
    runId: overrides.runId || 'parser-run-phase5',
    parserVersion: overrides.parserVersion || '3.0.0',
    status: overrides.status || 'COMPLETED',
    candidateCount: candidates.length,
    candidates,
    warnings: overrides.warnings || []
  };
}

function resolutionFor(sourceCandidate, overrides = {}) {
  const quantity = Object.prototype.hasOwnProperty.call(overrides, 'quantity') ? overrides.quantity : sourceCandidate.quantityNormalized;
  return {
    schemaVersion: 1,
    candidateId: overrides.candidateId || sourceCandidate.candidateId,
    billSessionId: overrides.billSessionId || sourceCandidate.billSessionId,
    runId: overrides.runId || 'resolution-run-phase5',
    registryVersion: Object.prototype.hasOwnProperty.call(overrides, 'registryVersion') ? overrides.registryVersion : DEFAULT_REGISTRY.registryVersion,
    registrySourceHash: Object.prototype.hasOwnProperty.call(overrides, 'registrySourceHash') ? overrides.registrySourceHash : DEFAULT_REGISTRY.registrySourceHash,
    ruleSetVersion: overrides.ruleSetVersion || RULE_SET_VERSION,
    status: overrides.status || RESOLUTION_STATUSES.VALIDATED_MAPPING,
    input: {
      codeRaw: sourceCandidate.codeRaw,
      description: sourceCandidate.description,
      quantity: sourceCandidate.quantityNormalized,
      section: sourceCandidate.section
    },
    output: {
      finalCode: Object.prototype.hasOwnProperty.call(overrides, 'finalCode') ? overrides.finalCode : 'CC008',
      quantity,
      unit: Object.prototype.hasOwnProperty.call(overrides, 'unit') ? overrides.unit : null
    },
    ruleId: Object.prototype.hasOwnProperty.call(overrides, 'ruleId') ? overrides.ruleId : DEFAULT_RULE_ID,
    registryEntryId: Object.prototype.hasOwnProperty.call(overrides, 'registryEntryId') ? overrides.registryEntryId : null,
    authorityStatus: overrides.authorityStatus || AUTHORITY_STATUSES.PROJECT_APPROVED,
    reason: overrides.reason || 'Synthetic Phase 5 fixture resolution.',
    evidence: overrides.evidence || [
      {
        type: 'PARSER_CANDIDATE',
        candidateId: sourceCandidate.candidateId,
        pageNumber: sourceCandidate.pageNumber,
        section: sourceCandidate.section,
        sourceText: sourceCandidate.rawText,
        lineNumbers: sourceCandidate.evidence.lineNumbers
      },
      { type: 'RULE', ruleId: Object.prototype.hasOwnProperty.call(overrides, 'ruleId') ? overrides.ruleId : DEFAULT_RULE_ID }
    ],
    conflicts: overrides.conflicts || []
  };
}

function resolutionResult(results, overrides = {}) {
  return {
    schemaVersion: 1,
    billSessionId: overrides.billSessionId || DEFAULT_BILL_SESSION,
    runId: overrides.runId || 'resolution-run-phase5',
    parserRunId: overrides.parserRunId || 'parser-run-phase5',
    parserVersion: overrides.parserVersion || '3.0.0',
    registryVersion: Object.prototype.hasOwnProperty.call(overrides, 'registryVersion') ? overrides.registryVersion : DEFAULT_REGISTRY.registryVersion,
    registrySourceHash: Object.prototype.hasOwnProperty.call(overrides, 'registrySourceHash') ? overrides.registrySourceHash : DEFAULT_REGISTRY.registrySourceHash,
    registryAuthorityStatus: overrides.registryAuthorityStatus || AUTHORITY_STATUSES.TEST_ONLY,
    ruleSetVersion: overrides.ruleSetVersion || RULE_SET_VERSION,
    status: overrides.status || 'COMPLETED',
    resultCount: Array.isArray(results) ? results.length : 0,
    counts: overrides.counts || {},
    results
  };
}

function buildPlan(input = {}) {
  const ruleSetContext = input.ruleSetContext || DEFAULT_RULE_SET;
  const builder = new EnhancementPlanBuilder({
    ruleSetContext,
    clock: () => new Date(FIXED_DATE)
  });
  return builder.build({
    billSessionId: input.billSessionId || DEFAULT_BILL_SESSION,
    sourceBillId: input.sourceBillId || DEFAULT_BILL_SESSION,
    parserResult: input.parserResult,
    resolutionResult: input.resolutionResult,
    registryContext: input.registryContext || DEFAULT_REGISTRY,
    ruleSetContext
  });
}

function directResolution(sourceCandidate, overrides = {}) {
  return resolutionFor(sourceCandidate, {
    status: RESOLUTION_STATUSES.DIRECT_REGISTRY_MATCH,
    ruleId: null,
    registryEntryId: overrides.registryEntryId || 'REG-LB126-1',
    authorityStatus: overrides.authorityStatus || AUTHORITY_STATUSES.TEST_ONLY,
    finalCode: overrides.finalCode || sourceCandidate.codeRaw,
    quantity: overrides.quantity ?? sourceCandidate.quantityNormalized,
    unit: overrides.unit ?? null,
    ...overrides
  });
}

function planForScenario(scenario) {
  const c1 = candidate('candidate-0001');
  const parser = parserResult([c1]);
  switch (scenario) {
    case 'validated-c008':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1)]) });
    case 'validated-direct-registry': {
      const direct = candidate('candidate-0001', { codeRaw: 'LB126', description: 'Ferritin', quantityNormalized: 2, quantityRaw: '2' });
      return buildPlan({ parserResult: parserResult([direct]), resolutionResult: resolutionResult([directResolution(direct, { finalCode: 'LB126', registryEntryId: 'REG-LB126-1' })]) });
    }
    case 'aggregate-same-context': {
      const a = candidate('candidate-0001', { quantityNormalized: 2, quantityRaw: '2', lineNumbers: [1] });
      const b = candidate('candidate-0002', { quantityNormalized: 3, quantityRaw: '3', lineNumbers: [2] });
      return buildPlan({ parserResult: parserResult([a, b]), resolutionResult: resolutionResult([resolutionFor(a, { quantity: 2 }), resolutionFor(b, { quantity: 3 })]) });
    }
    case 'aggregate-different-unit': {
      const a = candidate('candidate-0001', { quantityNormalized: 1, quantityRaw: '1', lineNumbers: [1] });
      const b = candidate('candidate-0002', { quantityNormalized: 1, quantityRaw: '1', lineNumbers: [2] });
      return buildPlan({ parserResult: parserResult([a, b]), resolutionResult: resolutionResult([resolutionFor(a, { unit: 'COUNT' }), resolutionFor(b, { unit: 'HOUR' })]) });
    }
    case 'aggregate-different-context': {
      const a = candidate('candidate-0001', { description: 'Blood Transfusion Charge', lineNumbers: [1] });
      const b = candidate('candidate-0002', { description: 'Blood Transfusion Processing Charge', lineNumbers: [2] });
      return buildPlan({ parserResult: parserResult([a, b]), resolutionResult: resolutionResult([resolutionFor(a), resolutionFor(b)]) });
    }
    case 'duplicate-candidate-excluded': {
      const a = candidate('candidate-0001', { lineNumbers: [1] });
      const b = candidate('candidate-0002', { lineNumbers: [1] });
      return buildPlan({ parserResult: parserResult([a, b]), resolutionResult: resolutionResult([resolutionFor(a), resolutionFor(b)]) });
    }
    case 'patient-payable-excluded': {
      const p = candidate('candidate-0001', { section: 'PATIENT_PAYABLE' });
      return buildPlan({ parserResult: parserResult([p]), resolutionResult: resolutionResult([resolutionFor(p)]) });
    }
    case 'non-domain-excluded': {
      const n = candidate('candidate-0001', { section: 'PAYMENT' });
      return buildPlan({ parserResult: parserResult([n]), resolutionResult: resolutionResult([resolutionFor(n)]) });
    }
    case 'unsupported-candidate-excluded': {
      const u = candidate('candidate-0001', { status: 'IGNORED' });
      return buildPlan({ parserResult: parserResult([u]), resolutionResult: resolutionResult([resolutionFor(u)]) });
    }
    case 'rejected-excluded':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: RESOLUTION_STATUSES.REJECTED, finalCode: null, quantity: null, reason: 'Rejected by synthetic rule.' })]) });
    case 'no-match-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: RESOLUTION_STATUSES.NO_MATCH, finalCode: null, quantity: null, ruleId: null, authorityStatus: AUTHORITY_STATUSES.UNVERIFIED })]) });
    case 'review-required-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: RESOLUTION_STATUSES.REVIEW_REQUIRED, finalCode: null, quantity: null })]) });
    case 'rule-conflict-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: RESOLUTION_STATUSES.RULE_CONFLICT, finalCode: null, quantity: null, conflicts: [{ ruleId: 'A' }, { ruleId: 'B' }] })]) });
    case 'unresolved-mapping-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: RESOLUTION_STATUSES.UNRESOLVED_MAPPING, finalCode: null, quantity: null })]) });
    case 'provisional-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: 'PROVISIONAL' })]) });
    case 'unverified-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: 'UNVERIFIED' })]) });
    case 'blocked-resolution-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { status: 'BLOCKED' })]) });
    case 'missing-quantity-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: null })]) });
    case 'zero-quantity-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: 0 })]) });
    case 'negative-quantity-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: -1 })]) });
    case 'invalid-quantity-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: 'abc' })]) });
    case 'infinite-quantity-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: Infinity })]) });
    case 'large-quantity-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: 100001 })]) });
    case 'precision-quantity-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: 1.2345 })]) });
    case 'unsupported-unit-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { unit: 'BOX' })]) });
    case 'final-code-missing-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { finalCode: null })]) });
    case 'unknown-rule-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { ruleId: 'UNKNOWN_RULE' })]) });
    case 'unvalidated-rule-review': {
      const ruleSetContext = { ...DEFAULT_RULE_SET, rules: DEFAULT_RULE_SET.rules.map((rule) => rule.ruleId === DEFAULT_RULE_ID ? { ...rule, status: 'REVIEW_REQUIRED' } : rule) };
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1)]), ruleSetContext });
    }
    case 'unacceptable-authority-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([directResolution(c1, { finalCode: 'LB126', authorityStatus: AUTHORITY_STATUSES.UNVERIFIED })]) });
    case 'protected-alias-direct-review': {
      const raw = candidate('candidate-0001', { codeRaw: 'C002', description: 'Synthetic protected alias direct registry' });
      return buildPlan({ parserResult: parserResult([raw]), resolutionResult: resolutionResult([directResolution(raw, { finalCode: 'C002', registryEntryId: 'REG-C002-1' })]) });
    }
    case 'protected-alias-rule-allowed': {
      const raw = candidate('candidate-0001', { codeRaw: 'C002', description: 'Synthetic explicit rule keeps C002' });
      return buildPlan({ parserResult: parserResult([raw]), resolutionResult: resolutionResult([resolutionFor(raw, { finalCode: 'C002', quantity: 1 })]) });
    }
    case 'c002-half-day-rule': {
      const oxygen = candidate('candidate-0001', { codeRaw: 'C002', description: 'Oxygen Half Day', quantityNormalized: null, quantityRaw: null, rawText: 'Oxygen Half Day (C002)' });
      const resolved = resolveCandidate(oxygen);
      return buildPlan({ parserResult: parserResult([oxygen]), resolutionResult: resolutionResult([resolved], { registryVersion: null, registrySourceHash: null }) });
    }
    case 'c002-full-day-rule': {
      const oxygen = candidate('candidate-0001', { codeRaw: 'C002', description: 'Oxygen Full Day', quantityNormalized: null, quantityRaw: null, rawText: 'Oxygen Full Day (C002)' });
      const resolved = resolveCandidate(oxygen);
      return buildPlan({ parserResult: parserResult([oxygen]), resolutionResult: resolutionResult([resolved], { registryVersion: null, registrySourceHash: null }) });
    }
    case 'cn002-formula-rule': {
      const cn = candidate('candidate-0001', { codeRaw: 'CN002', description: 'Inpatient consultation derived', quantityNormalized: null, quantityRaw: null, rawText: 'Inpatient consultation derived (CN002)' });
      const resolved = resolveCandidate(cn, { context: { counts: { icuCount: 1, wardCount: 2 } } });
      return buildPlan({ parserResult: parserResult([cn]), resolutionResult: resolutionResult([resolved], { registryVersion: null, registrySourceHash: null }) });
    }
    case 'registry-version-mismatch-blocked':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { registryVersion: 'other-registry' })], { registryVersion: 'other-registry' }) });
    case 'registry-hash-mismatch-blocked':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { registrySourceHash: 'other-hash' })], { registrySourceHash: 'other-hash' }) });
    case 'rule-set-mismatch-blocked':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { ruleSetVersion: '9.9.9' })], { ruleSetVersion: '9.9.9' }) });
    case 'missing-parser-blocked':
      return buildPlan({ parserResult: null, resolutionResult: resolutionResult([resolutionFor(c1)]) });
    case 'missing-resolution-blocked':
      return buildPlan({ parserResult: parser, resolutionResult: null });
    case 'invalid-resolution-blocked':
      return buildPlan({ parserResult: parser, resolutionResult: { ...resolutionResult([], {}), results: { bad: true } } });
    case 'no-candidates-blocked':
      return buildPlan({ parserResult: parserResult([]), resolutionResult: resolutionResult([]) });
    case 'orphan-parser-candidate-review':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([]) });
    case 'resolution-candidate-missing-review': {
      const present = candidate('candidate-present');
      return buildPlan({ parserResult: parserResult([present]), resolutionResult: resolutionResult([resolutionFor(c1, { candidateId: 'candidate-missing' })]) });
    }
    case 'source-candidate-status-review': {
      const amb = candidate('candidate-0001', { status: 'AMBIGUOUS' });
      return buildPlan({ parserResult: parserResult([amb]), resolutionResult: resolutionResult([resolutionFor(amb)]) });
    }
    case 'patient-payable-not-aggregated': {
      const main = candidate('candidate-0001', { quantityNormalized: 2, quantityRaw: '2', lineNumbers: [1] });
      const patientPayable = candidate('candidate-0002', { quantityNormalized: 9, quantityRaw: '9', section: 'PATIENT_PAYABLE', lineNumbers: [2] });
      return buildPlan({ parserResult: parserResult([main, patientPayable]), resolutionResult: resolutionResult([resolutionFor(main, { quantity: 2 }), resolutionFor(patientPayable, { quantity: 9 })]) });
    }
    case 'legitimate-repeat-different-line-aggregates': {
      const a = candidate('candidate-0001', { quantityNormalized: 1, quantityRaw: '1', lineNumbers: [1] });
      const b = candidate('candidate-0002', { quantityNormalized: 1, quantityRaw: '1', lineNumbers: [2] });
      return buildPlan({ parserResult: parserResult([a, b]), resolutionResult: resolutionResult([resolutionFor(a, { quantity: 1 }), resolutionFor(b, { quantity: 1 })]) });
    }
    case 'same-code-different-rule-separated': {
      const otherRule = { ...DEFAULT_RULE_SET.rules.find((rule) => rule.ruleId === DEFAULT_RULE_ID), ruleId: 'PHASE5_SECOND_VALIDATED_RULE', status: 'VALIDATED' };
      const ruleSetContext = { ...DEFAULT_RULE_SET, rules: [...DEFAULT_RULE_SET.rules, otherRule] };
      const a = candidate('candidate-0001', { lineNumbers: [1] });
      const b = candidate('candidate-0002', { lineNumbers: [2] });
      return buildPlan({ parserResult: parserResult([a, b]), resolutionResult: resolutionResult([resolutionFor(a), resolutionFor(b, { ruleId: 'PHASE5_SECOND_VALIDATED_RULE' })]), ruleSetContext });
    }
    case 'review-preserves-required-evidence':
      return buildPlan({ parserResult: parser, resolutionResult: resolutionResult([resolutionFor(c1, { quantity: null })]) });
    case 'excluded-preserves-evidence': {
      const p = candidate('candidate-0001', { section: 'PATIENT_PAYABLE' });
      return buildPlan({ parserResult: parserResult([p]), resolutionResult: resolutionResult([resolutionFor(p)]) });
    }
    case 'direct-registry-unverified-review': {
      const direct = candidate('candidate-0001', { codeRaw: 'LB126', description: 'Ferritin' });
      return buildPlan({ parserResult: parserResult([direct]), resolutionResult: resolutionResult([directResolution(direct, { finalCode: 'LB126', authorityStatus: AUTHORITY_STATUSES.UNVERIFIED })]) });
    }
    default:
      throw new Error(`Unhandled matrix scenario ${scenario}`);
  }
}

function assertExpected(plan, expected) {
  if (expected.status) assert.equal(plan.status, expected.status);
  if (expected.readiness) assert.equal(plan.readiness, expected.readiness);
  if (expected.actions != null) assert.equal(plan.actions.length, expected.actions);
  if (expected.reviews != null) assert.equal(plan.reviewItems.length, expected.reviews);
  if (expected.excluded != null) assert.equal(plan.excludedItems.length, expected.excluded);
  if (expected.quantity != null) assert.equal(plan.actions.reduce((sum, action) => sum + Number(action.resolved.quantity || 0), 0), expected.quantity);
  if (expected.finalCode) assert.equal(plan.actions[0]?.resolved.finalCode, expected.finalCode);
  if (expected.reasonCode) assert.equal(plan.reviewItems[0]?.reasonCode, expected.reasonCode);
  if (expected.blockingCode) assert.ok(plan.diagnostics.blockingReasons.some((item) => item.code === expected.blockingCode), expected.blockingCode);
  if (expected.requiredEvidenceIncludes) assert.ok(plan.reviewItems[0]?.requiredEvidence?.includes(expected.requiredEvidenceIncludes));
  if (expected.evidence) assert.ok(plan.excludedItems[0]?.sourceEvidence?.text);
}

test('P5-25 50-case EnhancementPlan matrix gates actions, reviews, exclusions, and blocks deterministically', () => {
  assert.equal(matrix.cases.length, 50);
  for (const item of matrix.cases) {
    const plan = planForScenario(item.scenario);
    assertExpected(plan, item.expected);
    assert.equal(plan.schemaVersion, 1, item.id);
    assert.equal(plan.planVersion, '5.0.0', item.id);
    assert.match(plan.planSha256, /^[a-f0-9]{64}$/, item.id);
    assert.ok(plan.planId.startsWith('plan-'), item.id);
    assert.equal(Object.prototype.hasOwnProperty.call(plan, 'portalAction'), false, item.id);
  }
});

test('P5-26 golden validated plan is reproducible and hash verified', () => {
  const golden = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'plans', 'validated-plan.golden.json'), 'utf8'));
  const plan = planForScenario('validated-c008');
  assert.deepEqual(plan, golden);
  assert.equal(computePlanHash(plan), plan.planSha256);
  assert.equal(new EnhancementPlanValidator({ ruleSetContext: DEFAULT_RULE_SET }).validate(plan, { billSessionId: DEFAULT_BILL_SESSION, sourceBillId: DEFAULT_BILL_SESSION, sourceCandidateIds: ['candidate-0001'] }).status, 'PASS');
});

test('P5-27 validator independently rejects hash tampering, unsafe fields, and source-candidate drift', () => {
  const plan = planForScenario('validated-c008');
  const validator = new EnhancementPlanValidator({ ruleSetContext: DEFAULT_RULE_SET });
  const tampered = { ...plan, actions: [{ ...plan.actions[0], description: 'Tampered description' }] };
  assert.ok(validator.validate(tampered, { billSessionId: DEFAULT_BILL_SESSION, sourceBillId: DEFAULT_BILL_SESSION, sourceCandidateIds: ['candidate-0001'] }).issues.some((issue) => issue.code === 'PLAN_HASH_MISMATCH'));
  const unsafe = { ...plan, credentialToken: 'never-store-this' };
  assert.ok(validator.validate(unsafe, { billSessionId: DEFAULT_BILL_SESSION, sourceBillId: DEFAULT_BILL_SESSION, sourceCandidateIds: ['candidate-0001'] }).issues.some((issue) => issue.code === 'PLAN_UNSAFE_FIELD'));
  assert.ok(validator.validate(plan, { billSessionId: DEFAULT_BILL_SESSION, sourceBillId: DEFAULT_BILL_SESSION, sourceCandidateIds: ['other-candidate'] }).issues.some((issue) => issue.code === 'ACTION_SOURCE_CANDIDATE_NOT_IN_SOURCE_BILL'));
});

test('P5-28 stale plan detection compares parser, registry, and rule-set context without repairing the plan', () => {
  const plan = planForScenario('validated-c008');
  const stale = detectStalePlan(plan, { parserVersion: '3.0.1', registryVersion: 'phase5-new-registry', registrySourceHash: 'new-hash', ruleSetVersion: '5.0.0' });
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.reasons.map((item) => item.field), ['parserVersion', 'registryVersion', 'registrySourceHash', 'ruleSetVersion']);
  const validation = new EnhancementPlanValidator({ ruleSetContext: DEFAULT_RULE_SET }).validate(plan, { billSessionId: DEFAULT_BILL_SESSION, sourceBillId: DEFAULT_BILL_SESSION, parserVersion: '3.0.1', registryVersion: 'phase5-new-registry', registrySourceHash: 'new-hash', ruleSetVersion: '5.0.0', sourceCandidateIds: ['candidate-0001'] });
  assert.equal(validation.valid, true);
  assert.ok(validation.issues.some((issue) => issue.code === 'PLAN_STALE'));
});

test('P5-29 plan identity and hash are deterministic and exclude transient timestamps and plan IDs', () => {
  const c1 = candidate('candidate-0001');
  const parser = parserResult([c1]);
  const resolution = resolutionResult([resolutionFor(c1)]);
  const first = buildPlan({ parserResult: parser, resolutionResult: resolution });
  const secondBuilder = new EnhancementPlanBuilder({ ruleSetContext: DEFAULT_RULE_SET, clock: () => new Date('2026-09-28T12:00:00.000Z') });
  const second = secondBuilder.build({ billSessionId: DEFAULT_BILL_SESSION, sourceBillId: DEFAULT_BILL_SESSION, parserResult: parser, resolutionResult: resolution, registryContext: DEFAULT_REGISTRY, ruleSetContext: DEFAULT_RULE_SET });
  assert.equal(first.planSha256, second.planSha256);
  assert.equal(first.planId, second.planId);
  assert.notEqual(first.createdAt, second.createdAt);
});

test('P5-30 quantity validation never defaults missing or invalid values to executable zero/one', () => {
  assert.equal(validateQuantity(null).reasonCode, 'QUANTITY_MISSING');
  assert.equal(validateQuantity(0).reasonCode, 'QUANTITY_ZERO');
  assert.equal(validateQuantity('abc').reasonCode, 'QUANTITY_INVALID');
  assert.equal(validateQuantity(1).quantity, 1);
});

test('P5-31 plan persistence writes source-bill enhancement plan and summary only under StorageService-managed paths', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase5-storage-'));
  const storage = new StorageService({ root, clock: () => new Date(FIXED_DATE), idFactory: () => 'phase5-storage' });
  assert.equal(storage.initialize().status, 'READY');
  const plan = planForScenario('validated-c008');
  const summary = createPlanSummary(plan);
  const written = storage.writeEnhancementPlan(DEFAULT_BILL_SESSION, plan, summary);
  assert.equal(written.status, 'SUCCESS');
  assert.equal(path.relative(root, written.path), path.join('Source_Bills', DEFAULT_BILL_SESSION, 'enhancement', 'plan.json'));
  assert.deepEqual(storage.readEnhancementPlan(DEFAULT_BILL_SESSION).plan, plan);
  assert.deepEqual(storage.readEnhancementPlanSummary(DEFAULT_BILL_SESSION).summary, summary);
});

test('P5-32 phase5 IPC contract exposes controlled plan operations but no execution bridge', () => {
  const { OPERATIONS, OPERATION_SET, validateOperationRequest } = require('../../src/desktop/ipc-contract');
  for (const op of [OPERATIONS.ENHANCEMENT_BUILD_PLAN, OPERATIONS.ENHANCEMENT_GET_PLAN, OPERATIONS.ENHANCEMENT_GET_PLAN_SUMMARY, OPERATIONS.ENHANCEMENT_VALIDATE_PLAN, OPERATIONS.ENHANCEMENT_REBUILD_PLAN]) {
    assert.equal(OPERATION_SET.has(op), true);
    assert.deepEqual(validateOperationRequest({ operation: op, payload: { billSessionId: DEFAULT_BILL_SESSION } }), { operation: op, payload: { billSessionId: DEFAULT_BILL_SESSION } });
  }
  assert.throws(() => validateOperationRequest({ operation: 'enhancement.executePortal', payload: { command: 'run' } }), /Unsupported IPC operation/);
});

test('P5-33 cross-bill candidates and resolution results fail closed before plan persistence', () => {
  const c1 = candidate('candidate-0001', { billSessionId: 'bill-session-other' });
  assert.throws(() => buildPlan({ parserResult: parserResult([c1], { billSessionId: 'bill-session-other' }), resolutionResult: resolutionResult([resolutionFor(c1)]) }), /billSessionId does not match/);
  const c2 = candidate('candidate-0001');
  assert.throws(() => buildPlan({ parserResult: parserResult([c2]), resolutionResult: resolutionResult([resolutionFor(c2, { billSessionId: 'bill-session-other' })], { billSessionId: 'bill-session-other' }) }), /billSessionId does not match/);
});

test('P5-34 EnhancementPlan contains no browser, Selenium, CDP, Python, shell, credential, or final-PDF state', () => {
  const plan = planForScenario('validated-c008');
  const serialized = JSON.stringify(plan).toLowerCase();
  for (const forbidden of ['selenium', 'cdp', 'cookie', 'credential', 'password', 'pythonprocess', 'shellcommand', 'finalpdf', 'browserwindow']) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
});
