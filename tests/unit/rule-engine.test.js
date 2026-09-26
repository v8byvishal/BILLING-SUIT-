'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const baseFixture = require('../fixtures/bill-text/semantic-bill.json');
const { parseBillDocument } = require('../../src/services/bill-ingestion/bill-parser');
const { loadRateSource } = require('../../src/services/cghs/rate-list/loader');
const { RateRepository } = require('../../src/services/cghs/rate-list/repository');
const { evaluateBill } = require('../../src/services/cghs/rules/rule-engine');

const ratePath = path.join(__dirname, '..', 'fixtures', 'rates', 'authoritative-test-rates.json');
const repo = new RateRepository(loadRateSource(ratePath));

function parseWithExtraSection(lines) {
  const fixture = structuredClone(baseFixture);
  fixture.pages[0].lines.push(...lines);
  fixture.pages[0].raw_text += `\n${lines.join('\n')}`;
  return parseBillDocument(fixture);
}

function entry(plan, code) { return plan.entries.find((item) => item.code === code); }

test('CN002, CC001 and WC001 derive deterministically from structured ICU/ward rows with provenance and amounts', () => {
  const bill = parseBillDocument(structuredClone(baseFixture));
  const first = evaluateBill(bill, repo);
  const second = evaluateBill(bill, repo);
  assert.deepEqual(first, second);
  assert.equal(entry(first, 'CN002').quantity, 5);
  assert.deepEqual(entry(first, 'CN002').inputs, { icu_rows: 1, ward_rows: 1, icu_units_per_row: 3, ward_units_per_row: 2, calculated_quantity: 5 });
  assert.equal(entry(first, 'CN002').amount, 1750);
  assert.equal(entry(first, 'CC001').quantity, 1);
  assert.equal(entry(first, 'CC001').amount, 5400);
  assert.equal(entry(first, 'WC001').quantity, 1);
  assert.equal(entry(first, 'WC001').amount, 1000);
  assert.equal(entry(first, 'CN002').provenance.length, 2);
  assert.ok(entry(first, 'CN002').provenance.every((row) => row.source_page === 2));
});

test('oxygen HALF DAY and FULL DAY derive CC002 row-by-row; ambiguous dual phrase requires review', () => {
  const bill = parseWithExtraSection([
    'Equipment',
    'Service: OXYGEN HALF DAY | Code: C002 | Qty: 1 | Amount: 0',
    'Service: OXYGEN FULL DAY | Code: CC002 | Qty: 1 | Amount: 0'
  ]);
  const plan = evaluateBill(bill, repo);
  assert.equal(entry(plan, 'CC002').quantity, 36);
  assert.equal(entry(plan, 'CC002').amount, 3240);
  assert.deepEqual(entry(plan, 'CC002').provenance.map((row) => row.units), [12, 24]);

  const ambiguous = parseWithExtraSection(['Equipment', 'Service: OXYGEN HALF DAY FULL DAY | Code: C002 | Qty: 1']);
  const ambiguousPlan = evaluateBill(ambiguous, repo);
  assert.equal(entry(ambiguousPlan, 'CC002').quantity, null);
  assert.equal(entry(ambiguousPlan, 'CC002').status, 'REVIEW_REQUIRED');
  assert.ok(entry(ambiguousPlan, 'CC002').warnings.includes('AMBIGUOUS_FULL_AND_HALF_DAY'));
});

test('raw special codes are rejected and never added on top of rule-derived quantities', () => {
  const bill = parseWithExtraSection([
    'Investigations',
    'Service: Raw consultation | Code: CN002 | Qty: 99',
    'Service: Raw ICU | Code: CC001 | Qty: 99',
    'Service: Raw ward | Code: WC001 | Qty: 99'
  ]);
  const plan = evaluateBill(bill, repo);
  assert.equal(entry(plan, 'CN002').quantity, 5);
  assert.equal(entry(plan, 'CC001').quantity, 1);
  assert.equal(entry(plan, 'WC001').quantity, 1);
  assert.deepEqual(plan.rejected_candidates.filter((item) => ['CN002', 'CC001', 'WC001'].includes(item.code)).map((item) => item.status), ['REJECTED_BY_RULE', 'REJECTED_BY_RULE', 'REJECTED_BY_RULE']);
  assert.ok(plan.rejected_candidates.some((item) => item.reason === 'DERIVE_CN002_FROM_ROOM_RENT'));
});

test('Patient Payable items remain excluded from direct/rule candidates and primary quantity', () => {
  const plan = evaluateBill(parseBillDocument(structuredClone(baseFixture)), repo);
  assert.ok(plan.excluded_candidates.some((item) => item.semantic_context === 'PATIENT_PAYABLE' && item.status === 'EXCLUDED_BY_SECTION'));
  const primaryB126 = plan.entries.find((item) => item.code === 'B126' && item.source === 'DIRECT_BILL_CODE');
  assert.equal(primaryB126.quantity, 2);
});

test('direct duplicates, unknowns, custom codes and compound expressions remain explicit', () => {
  const fixture = structuredClone(baseFixture);
  fixture.pages[0].lines = fixture.pages[0].lines.map((line) => line.replace(/Code: B126/g, 'Code: LB126'));
  fixture.pages[0].raw_text = fixture.pages[0].lines.join('\n');
  fixture.pages[0].lines.push('Service: Duplicate known | Code: LB126 | Qty: 4', 'Service: Unknown | Code: ZZ999 | Qty: 1', 'Service: Local | Code: LC001 | Qty: 2');
  fixture.pages[0].raw_text = fixture.pages[0].lines.join('\n');
  const customRepo = new RateRepository(loadRateSource(ratePath), [{ code: 'LC001', description: 'Local', rate: 50, audit: { reason: 'Test local', created_by: 'TESTER', created_at: '2026-09-26T00:00:00Z' } }]);
  const plan = evaluateBill(parseBillDocument(fixture), customRepo);
  const known = plan.entries.find((item) => item.code === 'LB126' && item.provenance.some((p) => /Duplicate known/.test(p.raw_source_context)));
  assert.equal(known.quantity, 7);
  assert.equal(known.amount, 2205);
  assert.equal(entry(plan, 'ZZ999').status, 'UNKNOWN_CODE');
  assert.ok(plan.unknown_codes.some((item) => item.code === 'ZZ999'));
  assert.equal(entry(plan, 'LC001').source, 'CUSTOM_CODE');
  assert.equal(entry(plan, 'LC001').amount, 100);
  const compound = plan.entries.find((item) => item.code === 'B068+L/B075+L/B126');
  assert.equal(compound.status, 'RULE_UNDEFINED');
  assert.equal(compound.raw_code_expression, 'B068+L / B075+L / B126');
  assert.equal(compound.components[0].lookup.status, 'VALID');
});

test('ambiguous HDU category blocks room-derived quantities for review instead of guessing', () => {
  const fixture = structuredClone(baseFixture);
  fixture.pages[1].lines[1] = 'From: 20/09/2026 | To: 21/09/2026 | Duration: 1 day | Bed No: HDU-01 | Category: HDU';
  fixture.pages[1].raw_text = fixture.pages[1].lines.join('\n');
  const plan = evaluateBill(parseBillDocument(fixture), repo);
  assert.equal(entry(plan, 'CN002').quantity, null);
  assert.equal(entry(plan, 'CN002').status, 'REVIEW_REQUIRED');
  assert.ok(entry(plan, 'CN002').warnings.some((warning) => warning.startsWith('HDU_RULE_UNDEFINED')));
});
