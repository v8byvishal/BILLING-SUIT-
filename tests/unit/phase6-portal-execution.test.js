'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const golden = require('../fixtures/portal/phase6-golden-cases.json');
const { StorageService } = require('../../src/core/storage');
const { AUTHORITY_STATUSES } = require('../../src/services/cghs/registry');
const { RULE_SET_VERSION, getDefaultRuleSet, RESOLUTION_STATUSES } = require('../../src/services/cghs/rule-resolution');
const { EnhancementPlanBuilder, createPlanSummary } = require('../../src/services/cghs/plan-builder');
const { computePlanHash } = require('../../src/services/cghs/plan-validator');
const { PortalPreflightService } = require('../../src/services/portal/portal-preflight-service');
const { PortalExecutionGate } = require('../../src/services/portal/portal-execution-gate');
const { PortalExecutionService, validateExecutionAction } = require('../../src/services/portal/safe-portal-execution-service');
const { CdpHealthCheck } = require('../../src/services/portal/cdp-health-check');
const { LegacyPortalAdapter, legacyRequestForAction } = require('../../src/services/portal/legacy-portal-adapter');
const { MockPortalAdapter } = require('../helpers/mock-portal-adapter');
const { ACTION_STATES, FAILURE_CODES, PREFLIGHT_STATUSES, RUN_STATES } = require('../../src/services/portal/portal-contract');

const FIXED_DATE = '2026-09-27T00:00:00.000Z';
const BILL_SESSION = 'bill-session-phase6';
const RULE_SET = getDefaultRuleSet();
const REGISTRY = { status: 'READY', registryVersion: 'phase6-test-registry', registrySourceHash: 'phase6-test-registry-hash', authorityStatus: AUTHORITY_STATUSES.TEST_ONLY, source: { type: 'TEST', file: 'phase6.json' } };

function storage() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase6-'));
  const service = new StorageService({ root, clock: () => new Date(FIXED_DATE), idFactory: () => 'phase6-id' });
  assert.equal(service.initialize().status, 'READY');
  const source = path.join(root, 'source.pdf');
  fs.writeFileSync(source, '%PDF-1.4 synthetic non-phi portal fixture');
  const imported = service.importSourceBill(source, { billSessionId: BILL_SESSION, originalFileName: 'synthetic-phase6.pdf' });
  assert.equal(imported.status, 'IMPORTED');
  return { root, service };
}

function candidate(id, overrides = {}) {
  const codeRaw = overrides.codeRaw || 'C008';
  const description = overrides.description || 'Blood Transfusion Charge';
  return {
    candidateId: id,
    billSessionId: BILL_SESSION,
    runId: 'parser-run-phase6',
    pageNumber: overrides.pageNumber || 1,
    section: overrides.section || 'PROCEDURES',
    description,
    rawText: overrides.rawText || `${description} (${codeRaw}) Qty ${overrides.quantityRaw || '1'}`,
    codeRaw,
    codeNormalizedCandidate: codeRaw,
    quantityRaw: overrides.quantityRaw || '1',
    quantityNormalized: Object.prototype.hasOwnProperty.call(overrides, 'quantityNormalized') ? overrides.quantityNormalized : 1,
    evidence: { pageNumber: 1, sourceSection: overrides.section || 'PROCEDURES', sourceText: overrides.rawText || `${description} (${codeRaw})`, lineNumbers: overrides.lineNumbers || [1] },
    status: overrides.status || 'VALID_EVIDENCE'
  };
}

function resolutionFor(c, overrides = {}) {
  return {
    schemaVersion: 1,
    candidateId: overrides.candidateId || c.candidateId,
    billSessionId: BILL_SESSION,
    runId: 'resolution-run-phase6',
    registryVersion: REGISTRY.registryVersion,
    registrySourceHash: REGISTRY.registrySourceHash,
    ruleSetVersion: RULE_SET_VERSION,
    status: overrides.status || RESOLUTION_STATUSES.VALIDATED_MAPPING,
    input: { codeRaw: c.codeRaw, description: c.description, quantity: c.quantityNormalized, section: c.section },
    output: { finalCode: Object.prototype.hasOwnProperty.call(overrides, 'finalCode') ? overrides.finalCode : 'CC008', quantity: Object.prototype.hasOwnProperty.call(overrides, 'quantity') ? overrides.quantity : c.quantityNormalized, unit: null },
    ruleId: Object.prototype.hasOwnProperty.call(overrides, 'ruleId') ? overrides.ruleId : 'CGHS_C_008_BLOOD_TRANSFUSION',
    registryEntryId: overrides.registryEntryId || null,
    authorityStatus: overrides.authorityStatus || AUTHORITY_STATUSES.PROJECT_APPROVED,
    reason: overrides.reason || 'Phase 6 synthetic validated action.',
    evidence: [{ type: 'PARSER_CANDIDATE', candidateId: c.candidateId, pageNumber: c.pageNumber, section: c.section, sourceText: c.rawText, lineNumbers: c.evidence.lineNumbers }],
    conflicts: overrides.conflicts || []
  };
}

function parserResult(candidates) { return { billSessionId: BILL_SESSION, runId: 'parser-run-phase6', parserVersion: '3.0.0', status: 'COMPLETED', candidateCount: candidates.length, candidates }; }
function resolutionResult(results) { return { schemaVersion: 1, billSessionId: BILL_SESSION, runId: 'resolution-run-phase6', parserRunId: 'parser-run-phase6', parserVersion: '3.0.0', registryVersion: REGISTRY.registryVersion, registrySourceHash: REGISTRY.registrySourceHash, registryAuthorityStatus: AUTHORITY_STATUSES.TEST_ONLY, ruleSetVersion: RULE_SET_VERSION, status: 'COMPLETED', resultCount: results.length, results, counts: {} }; }

function writePlan(service, options = {}) {
  const candidates = options.candidates || [candidate('candidate-0001', { quantityNormalized: options.quantity || 1, quantityRaw: String(options.quantity || 1) })];
  const parser = parserResult(candidates);
  service.writeParseResult(BILL_SESSION, parser);
  const results = options.results || candidates.map((c, index) => resolutionFor(c, { finalCode: options.finalCodes?.[index] || (index === 0 ? 'CC008' : `CC0${10 + index}`), quantity: c.quantityNormalized, ruleId: index === 0 ? 'CGHS_C_008_BLOOD_TRANSFUSION' : 'CGHS_C_010_ENDOTRACHEAL_INTUBATION' }));
  const resolution = resolutionResult(results);
  service.writeResolutionResult(BILL_SESSION, resolution);
  const plan = new EnhancementPlanBuilder({ ruleSetContext: RULE_SET, clock: () => new Date(FIXED_DATE) }).build({ billSessionId: BILL_SESSION, sourceBillId: BILL_SESSION, parserResult: parser, resolutionResult: resolution, registryContext: options.registryContext || REGISTRY, ruleSetContext: RULE_SET });
  service.writeEnhancementPlan(BILL_SESSION, plan, createPlanSummary(plan));
  return plan;
}

function contextProvider(overrides = {}) {
  return (_billSessionId, plan) => ({ parserVersion: overrides.parserVersion || '3.0.0', registryVersion: overrides.registryVersion || plan.createdAgainst.registryVersion, registrySourceHash: overrides.registrySourceHash || plan.createdAgainst.registrySourceHash, ruleSetVersion: overrides.ruleSetVersion || RULE_SET_VERSION, sourceCandidateIds: plan.diagnostics.sourceCandidateIds || ['candidate-0001'], sourceExists: overrides.sourceExists !== false });
}

function services(service, adapter = new MockPortalAdapter(), options = {}) {
  const preflight = new PortalPreflightService({ storageService: service, ruleSetContext: RULE_SET, contextProvider: contextProvider(options.context || {}), cdpHealthCheck: adapter.cdpHealthCheck(), portalInspector: adapter.portalInspector(), clock: () => new Date(FIXED_DATE), idFactory: () => 'phase6-preflight' });
  const gate = new PortalExecutionGate({ storageService: service, ruleSetContext: RULE_SET, contextProvider: contextProvider(options.context || {}), clock: () => new Date(FIXED_DATE), preflightMaxAgeMs: 600000 });
  const execution = new PortalExecutionService({ storageService: service, preflightService: preflight, gate, adapter, clock: () => new Date(FIXED_DATE), idFactory: () => 'phase6-run', maxRetries: options.maxRetries ?? 1 });
  return { preflight, gate, execution };
}

async function readyPreflight(service, plan, adapter = new MockPortalAdapter(), options = {}) {
  const svc = services(service, adapter, options).preflight;
  return svc.preflight({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256 });
}

async function start(service, plan, adapter = new MockPortalAdapter(), options = {}) {
  const svc = services(service, adapter, options).execution;
  return svc.startExecution({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256, operatorConfirmed: true });
}

test('P6-01 portal audit fixtures enumerate required golden cases', () => {
  assert.equal(golden.cases.length, 10);
  assert.deepEqual(golden.cases.map((item) => item.id), ['portal-01', 'portal-02', 'portal-03', 'portal-04', 'portal-05', 'portal-06', 'portal-07', 'portal-08', 'portal-09', 'portal-10']);
});

test('P6-02 preflight blocks when plan is missing', async () => {
  const { service } = storage();
  const result = await services(service).preflight.preflight({ billSessionId: BILL_SESSION, planId: 'missing', planSha256: 'missing' });
  assert.notEqual(result.status, PREFLIGHT_STATUSES.READY);
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.PLAN_NOT_FOUND));
});

test('P6-03 preflight blocks stale plan context', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await services(service, new MockPortalAdapter(), { context: { parserVersion: '3.0.1' } }).preflight.preflight({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256 });
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.PLAN_STALE));
});

test('P6-04 preflight blocks plan hash mismatch', async () => {
  const { service } = storage(); const plan = writePlan(service); plan.actions[0].description = 'tampered'; service.writeEnhancementPlan(BILL_SESSION, plan, createPlanSummary(plan));
  const result = await services(service).preflight.preflight({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256 });
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.PLAN_HASH_MISMATCH));
});

test('P6-05 preflight blocks source bill hash mismatch', async () => {
  const { service } = storage(); const plan = writePlan(service); fs.appendFileSync(path.join(service.getSourceBillDirectory(BILL_SESSION), 'source.pdf'), 'changed');
  const result = await services(service).preflight.preflight({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256 });
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.SOURCE_BILL_CHANGED));
});

test('P6-06 preflight blocks no-action plans', async () => {
  const { service } = storage();
  const c = candidate('candidate-0001'); const plan = writePlan(service, { candidates: [c], results: [resolutionFor(c, { status: RESOLUTION_STATUSES.NO_MATCH, finalCode: null, quantity: null, ruleId: null, authorityStatus: AUTHORITY_STATUSES.UNVERIFIED })] });
  const result = await services(service).preflight.preflight({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256 });
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.PLAN_NOT_READY));
});

test('P6-07 preflight preserves partial registry as warning when actions are validated by rules', async () => {
  const { service } = storage(); const plan = writePlan(service, { registryContext: { ...REGISTRY, authorityStatus: AUTHORITY_STATUSES.UNVERIFIED } });
  const result = await readyPreflight(service, plan);
  assert.equal(result.status, PREFLIGHT_STATUSES.READY);
  assert.ok(result.checks.some((item) => item.name === 'REGISTRY_AUTHORITY_PARTIAL' && item.status === 'WARN'));
});

test('P6-08 preflight blocks CDP unavailable', async () => {
  const { service } = storage(); const plan = writePlan(service); const adapter = new MockPortalAdapter({ targets: [] });
  const result = await readyPreflight(service, plan, adapter);
  assert.equal(result.status, PREFLIGHT_STATUSES.UNAVAILABLE);
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.CDP_UNAVAILABLE || item.code === FAILURE_CODES.CDP_TARGET_NOT_FOUND));
});

test('P6-09 CDP malformed response fails closed', async () => {
  const cdp = new CdpHealthCheck({ fetchTargets: async () => ({ not: 'array' }) });
  const result = await cdp.check();
  assert.equal(result.status, 'FAIL');
  assert.equal(result.errorCode, FAILURE_CODES.CDP_UNAVAILABLE);
});

test('P6-10 preflight blocks missing portal target', async () => {
  const { service } = storage(); const plan = writePlan(service); const adapter = new MockPortalAdapter({ targets: [{ id: 'x', type: 'page', title: 'Blank', url: 'https://example.test/blank' }] });
  adapter.cdpHealthCheck = () => ({ check: async () => ({ status: 'FAIL', endpoint: 'mock', message: 'target missing', targets: [], errorCode: FAILURE_CODES.CDP_TARGET_NOT_FOUND }) });
  const result = await readyPreflight(service, plan, adapter);
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.CDP_TARGET_NOT_FOUND));
});

test('P6-11 preflight blocks wrong portal identity', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await readyPreflight(service, plan, new MockPortalAdapter({ identity: false }));
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.PORTAL_IDENTITY_UNVERIFIED));
});

test('P6-12 preflight blocks unauthenticated portal state', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await readyPreflight(service, plan, new MockPortalAdapter({ authenticated: false }));
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.AUTHENTICATION_UNVERIFIED));
});

test('P6-13 preflight blocks missing required controls', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await readyPreflight(service, plan, new MockPortalAdapter({ controls: false }));
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.PORTAL_CONTROLS_UNAVAILABLE));
});

test('P6-14 all preflight checks pass with trusted mock adapter', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await readyPreflight(service, plan);
  assert.equal(result.status, PREFLIGHT_STATUSES.READY);
  assert.equal(result.blockingReasons.length, 0);
  assert.equal(service.readPortalPreflightSnapshot(BILL_SESSION, result.preflightId).snapshot.status, PREFLIGHT_STATUSES.READY);
});

test('P6-15 validated action executes only after preflight and explicit operator start', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await start(service, plan);
  assert.equal(result.status, RUN_STATES.COMPLETED);
  assert.equal(result.actions[0].state, ACTION_STATES.SUCCESS);
});

test('P6-16 gate rejects when operator did not explicitly start execution', async () => {
  const { service } = storage(); const plan = writePlan(service); const { preflight, gate } = services(service); const snap = await preflight.preflight({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256 });
  const result = gate.evaluate({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256, preflightId: snap.preflightId, operatorConfirmed: false });
  assert.equal(result.allowed, false);
  assert.ok(result.blockingReasons.some((item) => item.code === FAILURE_CODES.OPERATOR_CONFIRMATION_REQUIRED));
});

test('P6-17 review-only plan is rejected and review items never execute', async () => {
  const { service } = storage(); const c = candidate('candidate-0001'); const plan = writePlan(service, { candidates: [c], results: [resolutionFor(c, { status: RESOLUTION_STATUSES.REVIEW_REQUIRED, finalCode: null, quantity: null })] });
  const result = await start(service, plan);
  assert.equal(result.status, RUN_STATES.BLOCKED);
  assert.equal(result.actions.length, 0);
});

test('P6-18 unresolved action is rejected by plan/preflight before execution', async () => {
  const { service } = storage(); const c = candidate('candidate-0001'); const plan = writePlan(service, { candidates: [c], results: [resolutionFor(c, { status: RESOLUTION_STATUSES.UNRESOLVED_MAPPING, finalCode: null, quantity: null })] });
  const result = await start(service, plan);
  assert.equal(result.status, RUN_STATES.BLOCKED);
});

test('P6-19 raw alias direct action model is rejected without a validated rule', () => {
  const result = validateExecutionAction({ executionActionId: 'x', actionId: 'a', code: 'C002', quantity: 1, ruleId: null });
  assert.equal(result.ok, false);
});

test('P6-20 missing final code action model is rejected', () => {
  assert.equal(validateExecutionAction({ executionActionId: 'x', actionId: 'a', code: '', quantity: 1 }).ok, false);
});

test('P6-21 invalid quantity action model is rejected', () => {
  assert.equal(validateExecutionAction({ executionActionId: 'x', actionId: 'a', code: 'CC008', quantity: 1.5 }).ok, false);
});

test('P6-22 exact code matching applies the validated final code only', async () => {
  const { service } = storage(); const plan = writePlan(service); const adapter = new MockPortalAdapter();
  const result = await start(service, plan, adapter);
  assert.deepEqual(adapter.applied.map((item) => item.code), ['CC008']);
  assert.equal(adapter.applied.some((item) => item.code === 'C008'), false);
});

test('P6-23 ambiguous portal match blocks action', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await start(service, plan, new MockPortalAdapter({ ambiguousCodes: ['CC008'] }));
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.AMBIGUOUS_MATCH);
});

test('P6-24 code not found blocks action', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await start(service, plan, new MockPortalAdapter({ notFoundCodes: ['CC008'] }));
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.CODE_NOT_FOUND);
});

test('P6-25 duplicate/already-satisfied portal row is not mutated again', async () => {
  const { service } = storage(); const plan = writePlan(service, { quantity: 2 }); const adapter = new MockPortalAdapter({ rows: [{ code: 'CC008', quantity: 2 }] });
  const result = await start(service, plan, adapter);
  assert.equal(result.actions[0].state, ACTION_STATES.DUPLICATE);
  assert.equal(adapter.applied.length, 0);
});

test('P6-26 quantity delta is applied instead of blindly applying desired quantity', async () => {
  const { service } = storage(); const plan = writePlan(service, { quantity: 5 }); const adapter = new MockPortalAdapter({ rows: [{ code: 'CC008', quantity: 2 }] });
  const result = await start(service, plan, adapter);
  assert.equal(result.actions[0].state, ACTION_STATES.SUCCESS);
  assert.deepEqual(adapter.applied, [{ code: 'CC008', delta: 3 }]);
});

test('P6-27 locked quantity blocks without repeated mutation attempts', async () => {
  const { service } = storage(); const plan = writePlan(service, { quantity: 3 }); const adapter = new MockPortalAdapter({ rows: [{ code: 'CC008', quantity: 1, locked: true }] });
  const result = await start(service, plan, adapter);
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.QUANTITY_LOCKED);
  assert.equal(adapter.applied.length, 0);
});

test('P6-28 unsupported quantity reduction is blocked', async () => {
  const { service } = storage(); const plan = writePlan(service, { quantity: 2 }); const adapter = new MockPortalAdapter({ rows: [{ code: 'CC008', quantity: 5 }] });
  const result = await start(service, plan, adapter);
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.REDUCTION_UNSUPPORTED);
});

test('P6-29 speciality synchronization failure is represented as action failure', async () => {
  const { service } = storage(); const plan = writePlan(service); const adapter = new MockPortalAdapter({ specialityFailures: ['CC008'] });
  const result = await start(service, plan, adapter);
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.SPECIALITY_SYNC_FAILED);
});

test('P6-30 post-action verification success is required for SUCCESS', async () => {
  const { service } = storage(); const plan = writePlan(service); const result = await start(service, plan);
  assert.equal(result.actions[0].verificationStatus, 'PORTAL_ROW_VERIFIED');
});

test('P6-31 verification failure does not report success', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const result = await start(service, plan, new MockPortalAdapter({ verifyFailureCodes: ['CC008'] }));
  assert.equal(result.actions[0].state, ACTION_STATES.FAILED);
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.VERIFICATION_FAILED);
});

test('P6-32 bounded retry reconciles state before repeating mutation', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const adapter = new MockPortalAdapter({ timeoutCodes: ['CC008'], mutationThenVerifyCodes: ['CC008'] });
  const result = await start(service, plan, adapter, { maxRetries: 1 });
  assert.equal(result.actions[0].state, ACTION_STATES.SUCCESS);
  assert.equal(result.actions[0].verificationStatus, 'RECONCILED_AFTER_TIMEOUT');
});

test('P6-33 uncertain timeout is not blindly retried after mutation uncertainty', async () => {
  const { service } = storage(); const plan = writePlan(service);
  const adapter = new MockPortalAdapter({ timeoutCodes: ['CC008'] });
  const result = await start(service, plan, adapter, { maxRetries: 2 });
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.PORTAL_TIMEOUT);
  assert.equal(adapter.applied.length, 0);
});

test('P6-34 timeout failure is structured', async () => {
  const { service } = storage(); const plan = writePlan(service); const result = await start(service, plan, new MockPortalAdapter({ timeoutCodes: ['CC008'] }));
  assert.equal(result.actions[0].errorCode, FAILURE_CODES.PORTAL_TIMEOUT);
});

test('P6-35 cancellation persists partial result and never claims full success', async () => {
  const { service } = storage();
  const c1 = candidate('candidate-0001', { quantityNormalized: 1, quantityRaw: '1', lineNumbers: [1] });
  const c2 = candidate('candidate-0002', { codeRaw: 'C010', description: 'Endotracheal Intubation', quantityNormalized: 1, quantityRaw: '1', lineNumbers: [2] });
  const plan = writePlan(service, { candidates: [c1, c2], finalCodes: ['CC008', 'CC010'] });
  const adapter = new MockPortalAdapter();
  const svc = services(service, adapter).execution;
  const originalExecute = svc.executeOne.bind(svc);
  let count = 0;
  svc.executeOne = async (run, action) => { count += 1; const out = await originalExecute(run, action); if (count === 1) svc.cancelRequests.add(run.runId); return out; };
  const result = await svc.startExecution({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256, operatorConfirmed: true });
  assert.equal(result.status, RUN_STATES.CANCELLED);
  assert.equal(result.actions[1].state, ACTION_STATES.CANCELLED);
});

test('P6-36 partial execution is completed with failures', async () => {
  const { service } = storage();
  const c1 = candidate('candidate-0001', { quantityNormalized: 1, quantityRaw: '1', lineNumbers: [1] });
  const c2 = candidate('candidate-0002', { codeRaw: 'C010', description: 'Endotracheal Intubation', quantityNormalized: 1, quantityRaw: '1', lineNumbers: [2] });
  const plan = writePlan(service, { candidates: [c1, c2], finalCodes: ['CC008', 'CC010'] });
  const result = await start(service, plan, new MockPortalAdapter({ notFoundCodes: ['CC010'] }));
  assert.equal(result.status, RUN_STATES.COMPLETED_WITH_FAILURES);
  assert.equal(result.summary.success, 1);
  assert.equal(result.summary.failed, 1);
});

test('P6-37 interrupted runs are marked at startup and require explicit review', () => {
  const { service } = storage(); const run = { runId: 'run-interrupted', billSessionId: BILL_SESSION, status: RUN_STATES.RUNNING, startedAt: FIXED_DATE, actions: [], summary: { total: 0, success: 0, duplicate: 0, failed: 0, cancelled: 0, skipped: 0 }, diagnostics: [] };
  service.writePortalExecutionRun(BILL_SESSION, run, run.summary);
  const updated = service.markInterruptedPortalRuns(BILL_SESSION);
  assert.equal(updated[0].status, RUN_STATES.INTERRUPTED);
});

test('P6-38 concurrency lock prevents simultaneous starts for same bill session', async () => {
  const { service } = storage(); const plan = writePlan(service); const svc = services(service).execution; svc.activeRuns.set(BILL_SESSION, 'other-run');
  await assert.rejects(() => svc.startExecution({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256, operatorConfirmed: true }), /already active/);
});

test('P6-39 duplicate start request is rejected with structured code', async () => {
  const { service } = storage(); const plan = writePlan(service); const svc = services(service).execution; svc.activeRuns.set(BILL_SESSION, 'other-run');
  try { await svc.startExecution({ billSessionId: BILL_SESSION, planId: plan.planId, planSha256: plan.planSha256, operatorConfirmed: true }); assert.fail('expected rejection'); }
  catch (error) { assert.equal(error.code, FAILURE_CODES.EXECUTION_ALREADY_RUNNING); }
});

test('P6-40 execution run and summary are persisted', async () => {
  const { service } = storage(); const plan = writePlan(service); const result = await start(service, plan);
  assert.equal(service.readPortalExecutionRun(BILL_SESSION, result.runId).run.status, RUN_STATES.COMPLETED);
  assert.equal(service.readPortalExecutionSummary(BILL_SESSION, result.runId).summary.summary.success, 1);
});

test('P6-41 execution summary is calculated from terminal action states', async () => {
  const { service } = storage(); const plan = writePlan(service); const result = await start(service, plan, new MockPortalAdapter({ rows: [{ code: 'CC008', quantity: 1 }] }));
  assert.deepEqual(result.summary, { total: 1, success: 0, duplicate: 1, failed: 0, cancelled: 0, skipped: 0 });
});

test('P6-42 audit events are written once for preflight and execution milestones', async () => {
  const { service } = storage(); const plan = writePlan(service); await start(service, plan);
  const operations = service.listAuditRecords({ limit: 50 }).map((record) => record.operation);
  assert.ok(operations.includes('PORTAL_PREFLIGHT_STARTED'));
  assert.ok(operations.includes('PORTAL_PREFLIGHT_COMPLETED'));
  assert.ok(operations.includes('PORTAL_EXECUTION_STARTED'));
  assert.ok(operations.includes('PORTAL_ACTION_STARTED'));
  assert.ok(operations.includes('PORTAL_ACTION_VERIFIED'));
  assert.ok(operations.includes('PORTAL_EXECUTION_COMPLETED'));
});

test('P6-43 diagnostics artifact is recorded for significant action failure', async () => {
  const { service } = storage(); const plan = writePlan(service); const result = await start(service, plan, new MockPortalAdapter({ notFoundCodes: ['CC008'] }));
  assert.ok(result.actions[0].diagnosticReference);
  assert.ok(service.listFailures({ limit: 10 }).some((item) => item.code === FAILURE_CODES.CODE_NOT_FOUND));
});

test('P6-44 legacy Python bridge request is narrow and allowlisted', () => {
  const request = legacyRequestForAction({ executionActionId: 'exec-1', actionId: 'a1', code: 'CC008', quantity: 1, billSessionId: BILL_SESSION, planId: 'plan-1', planSha256: 'hash', sourceCandidateIds: [], ruleId: 'rule' }, { runId: 'run-1' });
  assert.equal(request.contract_version, '1.0.0');
  assert.equal(request.actions[0].code, 'CC008');
  assert.equal(Object.prototype.hasOwnProperty.call(request.actions[0], 'command'), false);
});

test('P6-45 legacy adapter maps Python executor failure without claiming success', async () => {
  const adapter = new LegacyPortalAdapter({ runner: { execute: async () => { const error = new Error('python failed'); error.code = 'PYTHON_EXECUTOR_FAILED'; throw error; } } });
  const result = await adapter.executeAction({ executionActionId: 'exec-1', code: 'CC008', quantity: 1 });
  assert.equal(result.terminal, 'FAILED');
  assert.equal(result.errorCode, FAILURE_CODES.PYTHON_EXECUTOR_FAILED);
});

test('P6-46 malformed Python response is rejected', async () => {
  const adapter = new LegacyPortalAdapter({ runner: { execute: async () => ({ results: [] }) } });
  const result = await adapter.executeAction({ executionActionId: 'exec-1', code: 'CC008', quantity: 1 });
  assert.equal(result.errorCode, FAILURE_CODES.PYTHON_RESPONSE_MALFORMED);
});

test('P6-47 arbitrary operation/command injection fields are not present in bridge request', () => {
  const request = legacyRequestForAction({ executionActionId: 'exec-1', actionId: 'a1', code: 'CC008', quantity: 1, billSessionId: BILL_SESSION, planId: 'plan-1', planSha256: 'hash' }, { runId: 'run-1' });
  assert.equal(JSON.stringify(request).includes('executeRaw'), false);
  assert.equal(JSON.stringify(request).includes('shell'), false);
});

test('P6-48 IPC contract has no raw shell, Python, or CDP command operation', () => {
  const { OPERATIONS, OPERATION_SET } = require('../../src/desktop/ipc-contract');
  for (const op of [OPERATIONS.PORTAL_PREFLIGHT, OPERATIONS.PORTAL_GET_PREFLIGHT, OPERATIONS.PORTAL_START_EXECUTION, OPERATIONS.PORTAL_GET_EXECUTION, OPERATIONS.PORTAL_CANCEL_EXECUTION, OPERATIONS.PORTAL_GET_EXECUTION_SUMMARY, OPERATIONS.PORTAL_REVALIDATE]) assert.equal(OPERATION_SET.has(op), true);
  assert.equal([...OPERATION_SET].some((op) => /executeRaw|runCommand|runPython|sendCdpCommand|shell/i.test(op)), false);
});

test('P6-49 credential material is never passed to portal adapter request', () => {
  const request = legacyRequestForAction({ executionActionId: 'exec-1', actionId: 'a1', code: 'CC008', quantity: 1, billSessionId: BILL_SESSION, planId: 'plan-1', planSha256: 'hash', description: 'safe' }, { runId: 'run-1' });
  assert.doesNotMatch(JSON.stringify(request), /password|credential|cookie|token|secret/i);
});

test('P6-50 discharge automation remains unavailable', () => {
  const { OPERATION_SET } = require('../../src/desktop/ipc-contract');
  assert.equal([...OPERATION_SET].some((op) => /discharge/i.test(op)), false);
});
