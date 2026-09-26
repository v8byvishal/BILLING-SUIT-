'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { adaptEnhancementPlan } = require('../../src/adapters/legacy-portal/plan-adapter');
const { executeEnhancementPlan } = require('../../src/services/portal/portal-execution-service');

function entry(code = 'AB123', extra = {}) {
  return { code, quantity: 1, status: 'SOURCE_VERIFIED', code_validation: 'KNOWN', source: 'BILL_CODE', rule_id: null, provenance: [{ source_section: 'PROCEDURES', page_number: 2, raw_text: code }], ...extra };
}
function plan(entries, extra = {}) {
  return { plan_version: '1.0.0', bill: { bill_id: 'bill-1', source_file: 'sample.pdf' }, entries, excluded_candidates: [], rejected_candidates: [], warnings: [], ...extra };
}
function runnerWith(results, extra = {}) { return { execute: async () => ({ executor: 'FAKE_LEGACY', completed_at: '2026-09-26T01:00:00.000Z', results, ...extra }) }; }
const opts = { runId: 'run-1', timestamp: '2026-09-26T00:00:00.000Z' };

// The cases are intentionally portal-free: each models an observable executor boundary outcome.
test('1 success requires executor verification', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), runnerWith([{ action_id: 'action-1', action_status: 'EXECUTED', verification_result: 'PORTAL_ROW_VERIFIED', retry_count: 0 }]), opts);
  assert.equal(audit.status, 'EXECUTED'); assert.equal(audit.results[0].verification_result, 'PORTAL_ROW_VERIFIED');
});
test('2 existing portal row remains ALREADY_PRESENT', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), runnerWith([{ action_id: 'action-1', action_status: 'ALREADY_PRESENT', verification_result: 'PORTAL_ROW_RECONCILED' }]), opts);
  assert.equal(audit.results[0].action_status, 'ALREADY_PRESENT');
});
test('3 executor failure is explicit', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), runnerWith([{ action_id: 'action-1', action_status: 'FAILED', error: 'option absent', verification_result: 'PORTAL_STATE_NOT_VERIFIED' }]), opts);
  assert.equal(audit.status, 'FAILED'); assert.match(audit.results[0].error, /option absent/);
});
test('4 mixed verified and failed results are PARTIAL', async () => {
  const audit = await executeEnhancementPlan(plan([entry('AB123'), entry('CD456')]), runnerWith([{ action_id: 'action-1', action_status: 'EXECUTED', verification_result: 'PORTAL_ROW_VERIFIED' }, { action_id: 'action-2', action_status: 'FAILED', verification_result: 'NOT_VERIFIED' }]), opts);
  assert.equal(audit.status, 'PARTIAL');
});
test('5 runner launch or CDP failure marks every action FAILED', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), { execute: async () => { throw new Error('CDP unavailable'); } }, opts);
  assert.equal(audit.results[0].action_status, 'FAILED'); assert.match(audit.executor_error, /CDP unavailable/);
});
test('6 missing executor record is UNKNOWN rather than success', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), runnerWith([]), opts);
  assert.equal(audit.status, 'FAILED'); assert.equal(audit.results[0].action_status, 'UNKNOWN');
});
test('7 unsupported executor terminal value is UNKNOWN', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), runnerWith([{ action_id: 'action-1', action_status: 'CLICKED' }]), opts);
  assert.equal(audit.results[0].verification_result, 'NOT_VERIFIED');
});
test('8 retry and diagnostics are retained in audit', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), runnerWith([{ action_id: 'action-1', action_status: 'EXECUTED', retry_count: 2, verification_result: 'PORTAL_ROW_VERIFIED', diagnostics: { screenshot: 'failure.png' } }]), opts);
  assert.equal(audit.results[0].retry_count, 2); assert.equal(audit.results[0].diagnostics.screenshot, 'failure.png');
});
test('9 reconciliation after exception is a distinct verified result', async () => {
  const audit = await executeEnhancementPlan(plan([entry()]), runnerWith([{ action_id: 'action-1', action_status: 'EXECUTED', portal_result: 'RECONCILED_PORTAL_ROWS:1', verification_result: 'RECONCILED_AFTER_EXCEPTION' }]), opts);
  assert.equal(audit.results[0].verification_result, 'RECONCILED_AFTER_EXCEPTION');
});
test('10 all unsafe records are blocked without invoking portal', async () => {
  let invoked = false;
  const unsafe = ['UNKNOWN_CODE', 'UNRESOLVED_COMPOUND', 'RULE_UNDEFINED', 'REVIEW_REQUIRED', 'INVALID_FORMAT'].map((status, i) => entry(`AB12${i}`, { status }));
  const audit = await executeEnhancementPlan(plan(unsafe), { execute: async () => { invoked = true; } }, opts);
  assert.equal(invoked, false); assert.equal(audit.counts.BLOCKED, 5); assert.equal(audit.portal_invoked, false);
});
test('11 Patient Payable and excluded candidates never become actions', () => {
  const adapted = adaptEnhancementPlan(plan([entry('AB123', { semantic_context: 'PATIENT_PAYABLE' })], { excluded_candidates: [{ code: 'RX999', quantity: 1, source_section: 'PATIENT_PAYABLE' }] }), opts);
  assert.equal(adapted.actions.length, 0); assert.equal(adapted.blocked.length, 2);
});
test('12 invalid quantity and malformed code are blocked', () => {
  const adapted = adaptEnhancementPlan(plan([entry('bad', { quantity: 1 }), entry('AB123', { quantity: 1.5 })]), opts);
  assert.deepEqual(adapted.blocked.map((x) => x.reason), ['INVALID_FORMAT', 'INVALID_QUANTITY']);
});
test('13 deterministic special-code order sends only final quantities', () => {
  const adapted = adaptEnhancementPlan(plan([entry('ZZ999'), entry('CC002', { quantity: 4 }), entry('CC001'), entry('CN002'), entry('WC001')]), opts);
  assert.deepEqual(adapted.actions.map((x) => x.code), ['CC001', 'WC001', 'CN002', 'CC002', 'ZZ999']); assert.equal(adapted.actions[3].quantity, 4);
});
test('14 audit preserves run bill plan source and rule identity', async () => {
  const audit = await executeEnhancementPlan(plan([entry('AB123', { status: 'RULE_VERIFIED', source: 'RULE_DERIVED_CODE', rule_id: 'CN002' })]), runnerWith([{ action_id: 'action-1', action_status: 'EXECUTED', verification_result: 'PORTAL_ROW_VERIFIED' }]), opts);
  assert.equal(audit.run_id, 'run-1'); assert.equal(audit.bill.bill_id, 'bill-1'); assert.equal(audit.plan_version, '1.0.0'); assert.equal(audit.results[0].rule_id, 'CN002');
});
