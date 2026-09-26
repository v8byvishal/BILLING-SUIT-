'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fixture = require('../fixtures/bills/production-structure.json');
const oxygenFixture = require('../fixtures/bills/oxygen-cases.json');
const staleBillB = require('../fixtures/bills/stale-bill-b.json');
const { parseBillDocument } = require('../../src/services/bill-ingestion/bill-parser');
const { detectCodeExpression } = require('../../src/services/bill-ingestion/code-normalizer');
const { parseCompoundCode } = require('../../src/services/bill-ingestion/compound-code-parser');
const { loadRateSource, RateRepository, evaluateBill } = require('../../src/services/cghs');
const { adaptEnhancementPlan } = require('../../src/adapters/legacy-portal/plan-adapter');

const rateSource = loadRateSource(path.join(__dirname, '..', 'fixtures', 'rates', 'authoritative-test-rates.json'));
function repository() { return new RateRepository(rateSource); }
function parseFixture() { return parseBillDocument(fixture); }
function planFixture() { const bill = parseFixture(); return { bill, plan: evaluateBill(bill, repository()) }; }
function singlePage(lines, name = 'case.pdf') {
  return { source: { file_name: name, sha256: `synthetic-${name}` }, pages: [{ page_number: 1, lines, raw_text: lines.join('\n') }] };
}
function oxygenBill(description) {
  return parseBillDocument(singlePage(['Hospital Services', `Service: ${description} | Code: CC002 | Qty: 1`], 'oxygen.pdf'));
}

// 24 high-value deterministic cases; all inputs are synthetic and contain no patient data.
test('P5-01 duplicate code aggregates across multiple pages', () => {
  const bill = parseFixture(); const aggregate = bill.aggregates.find((x) => x.section === 'IP_PHARMACY' && x.normalized_code_expression === 'B126');
  assert.equal(aggregate.normalized_quantity, 7); assert.deepEqual(aggregate.source_pages, [1, 2]);
});
test('P5-02 Patient Payable IP Pharmacy remains excluded', () => {
  const bill = parseFixture(); const excluded = bill.excluded_sections.flatMap((x) => x.items).find((x) => x.service_name === 'Patient medicine');
  assert.equal(excluded.quantity, 50); assert.equal(excluded.included_in_primary_bill, false);
});
test('P5-03 primary IP Pharmacy remains preserved', () => {
  const bill = parseFixture(); assert.equal(bill.items.filter((x) => x.section === 'IP_PHARMACY').reduce((n, x) => n + x.quantity, 0), 7);
});
test('P5-04 ICU evidence contributes three CN002 units', () => {
  const { plan } = planFixture(); assert.equal(plan.entries.find((x) => x.code === 'CN002').quantity, 5);
});
test('P5-05 ward evidence contributes two CN002 units', () => {
  const { plan } = planFixture(); const audit = plan.rule_audit.find((x) => x.code === 'CN002'); assert.equal(audit.inputs.ward_rows, 1); assert.equal(audit.inputs.ward_units_per_row, 2);
});
test('P5-06 ICU evidence derives CC001', () => {
  const { plan } = planFixture(); assert.equal(plan.entries.find((x) => x.code === 'CC001').quantity, 1);
});
test('P5-07 ward evidence derives WC001', () => {
  const { plan } = planFixture(); assert.equal(plan.entries.find((x) => x.code === 'WC001').quantity, 1);
});
test('P5-08 HALF DAY oxygen derives CC002 quantity 12', () => {
  const c = oxygenFixture.cases[0]; const p = evaluateBill(oxygenBill(c.description), repository()); const e = p.entries.find((x) => x.code === 'CC002'); assert.equal(e.quantity, c.expected_quantity); assert.equal(e.status, c.expected_status);
});
test('P5-09 FULL DAY oxygen derives CC002 quantity 24', () => {
  const c = oxygenFixture.cases[1]; const e = evaluateBill(oxygenBill(c.description), repository()).entries.find((x) => x.code === 'CC002'); assert.equal(e.quantity, 24);
});
test('P5-10 ambiguous oxygen remains REVIEW_REQUIRED', () => {
  const c = oxygenFixture.cases[2]; const e = evaluateBill(oxygenBill(c.description), repository()).entries.find((x) => x.code === 'CC002'); assert.equal(e.quantity, null); assert.equal(e.status, 'REVIEW_REQUIRED');
});
test('P5-11 B068+L remains syntactic but semantically unresolved', () => {
  const c = parseCompoundCode('B068+L'); assert.equal(c.components[0].base_code, 'B068'); assert.equal(c.semantic_interpretation, 'NOT_INFERRED');
});
test('P5-12 B075+L remains syntactic but semantically unresolved', () => {
  const c = parseCompoundCode('B075+L'); assert.equal(c.components[0].semantic_status, 'RULE_UNDEFINED');
});
test('P5-13 B042+043+044 preserves every qualifier without expansion', () => {
  const c = parseCompoundCode('B042+043+044'); assert.deepEqual(c.components[0].qualifiers, ['043', '044']); assert.equal(c.normalization_status, 'SYNTACTIC_COMPOUND');
});
test('P5-14 split wrapped compound joins only across labeled code continuation', () => {
  const bill = parseFixture(); const item = bill.items.find((x) => x.service_name === 'Wrapped package'); assert.equal(item.raw_code_expression, 'B068+ L / B075+L / B126'); assert.equal(item.source_lines.length, 2); assert.equal(item.code_normalization.components.length, 3);
});
test('P5-15 unknown code remains UNKNOWN_CODE and non-executable', () => {
  const bill = parseBillDocument(singlePage(['Investigations', 'Service: Unknown | Code: ZZZ999 | Qty: 1'])); const plan = evaluateBill(bill, repository()); const e = plan.entries.find((x) => x.code === 'ZZZ999'); assert.equal(e.status, 'UNKNOWN_CODE'); assert.equal(plan.execution_summary.blocked[0].code, 'ZZZ999');
});
test('P5-16 malformed labeled code is retained as INVALID_FORMAT', () => {
  const { plan } = planFixture(); assert.ok(plan.rejected_candidates.some((x) => x.status === 'INVALID_FORMAT' && /\?\?\?/.test(x.raw_source_context)));
});
test('P5-17 unsupported compound rule remains RULE_UNDEFINED', () => {
  const { plan } = planFixture(); const e = plan.entries.find((x) => x.raw_code_expression?.includes('B068')); assert.equal(e.status, 'RULE_UNDEFINED');
});
test('P5-18 code-like value in unrelated prose is not extracted', () => {
  const bill = parseFixture(); assert.equal(bill.items.some((x) => x.raw_source_context.includes('historical reference')), false);
});
test('P5-19 repeated section headers retain a single logical aggregation context', () => {
  const bill = parseFixture(); assert.equal(bill.sections.filter((x) => x.section_type === 'IP_PHARMACY').length, 2); assert.equal(bill.aggregates.filter((x) => x.section === 'IP_PHARMACY').length, 1);
});
test('P5-20 section continuation crosses page boundaries', () => {
  const input = { source: { file_name: 'continuation.pdf', sha256: 'synthetic' }, pages: [{ page_number: 1, lines: ['Investigations', 'Service: A | Code: B126 | Qty: 1'], raw_text: 'Investigations\nService: A | Code: B126 | Qty: 1' }, { page_number: 2, lines: ['Service: B | Code: B126 | Qty: 2'], raw_text: 'Service: B | Code: B126 | Qty: 2' }] };
  const bill = parseBillDocument(input); assert.equal(bill.aggregates[0].normalized_quantity, 3); assert.deepEqual(bill.aggregates[0].source_pages, [1, 2]);
});
test('P5-21 high-volume bill parses deterministically without lost rows', () => {
  const lines = ['Investigations', ...Array.from({ length: 1000 }, (_, i) => `Service: Row ${i} | Code: B126 | Qty: 1`)]; const bill = parseBillDocument(singlePage(lines, 'large.pdf')); assert.equal(bill.items.length, 1000); assert.equal(bill.aggregates[0].normalized_quantity, 1000);
});
test('P5-22 mixed executable and blocked records remain explicit', () => {
  const bill = parseBillDocument(singlePage(['Investigations', 'Service: Valid | Code: B126 | Qty: 2', 'Service: Unknown | Code: ZZZ999 | Qty: 1'])); const p = evaluateBill(bill, repository()); assert.ok(p.execution_summary.executable.some((x) => x.code === 'B126')); assert.ok(p.execution_summary.blocked.some((x) => x.code === 'ZZZ999'));
});
test('P5-23 missing-code evidence is advisory REVIEW_REQUIRED and never guessed', () => {
  const { plan } = planFixture(); const candidate = plan.rejected_candidates.find((x) => x.reason === 'POSSIBLY_MISSING_CODE'); assert.equal(candidate.status, 'REVIEW_REQUIRED'); assert.equal(candidate.code, null); assert.equal(candidate.rule_id, 'PHASE2_MISSING_CODE_ADVISORY');
});
test('P5-24 consecutive bill parses have no stale metadata, codes, sections, beds, or audit', () => {
  const first = parseFixture(); const second = parseBillDocument(staleBillB); assert.equal(first.billing.bill_number, 'SYN-500'); assert.equal(second.billing.bill_number, 'BILL-B'); assert.deepEqual(second.items.map((x) => x.service_code), ['B068']); assert.equal(second.bed_details.length, 0); assert.equal(second.excluded_sections.length, 0); assert.equal(second.parsing_audit.review_candidates.length, 0); const adapted = adaptEnhancementPlan(evaluateBill(second, repository()), { runId: 'phase5' }); assert.deepEqual(adapted.actions.map((x) => x.code), ['B068']);
});
