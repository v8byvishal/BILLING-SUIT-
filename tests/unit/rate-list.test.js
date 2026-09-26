'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseCompoundCode } = require('../../src/services/bill-ingestion/compound-code-parser');
const { loadBundledReferenceRates, loadRateSource } = require('../../src/services/cghs/rate-list/loader');
const { CODE_STATUS, RateRepository } = require('../../src/services/cghs/rate-list/repository');
const { applyRate } = require('../../src/services/cghs/rules/rule-engine');

const testRates = path.join(__dirname, '..', 'fixtures', 'rates', 'authoritative-test-rates.json');

function repository(custom = []) { return new RateRepository(loadRateSource(testRates), custom); }

test('bundled 1998-record HFOS snapshot loads with checksum but remains RATE_SOURCE_UNDEFINED', () => {
  const source = loadBundledReferenceRates();
  assert.equal(source.records.length, 1998);
  assert.equal(source.provenance.authority_status, 'RATE_SOURCE_UNDEFINED');
  assert.equal(source.provenance.data_checksum, 'b596cdaf7b70787bd04a2a26d61bda5110de5de5160411152a6a21c52aeb3838');
  const repo = new RateRepository(source);
  assert.equal(repo.lookup('CN002').record.rate, 350);
  const evaluated = applyRate({ code: 'CN002', quantity: 2, quantity_status: 'RULE_VERIFIED', warnings: [] }, repo);
  assert.equal(evaluated.rate, 350);
  assert.equal(evaluated.amount, null);
  assert.equal(evaluated.status, 'REVIEW_REQUIRED');
  assert.ok(evaluated.warnings.includes('RATE_SOURCE_UNDEFINED'));
});

test('rate repository explicitly classifies known, unknown, malformed, missing-rate and compound codes', () => {
  const repo = repository();
  assert.equal(repo.lookup('LB126').status, CODE_STATUS.VALID);
  assert.equal(repo.lookup('LB126').record.rate, 315);
  assert.equal(repo.lookup('ZZ999').status, CODE_STATUS.UNKNOWN);
  assert.equal(repo.lookup('bad code').status, CODE_STATUS.INVALID_FORMAT);
  const compound = repo.validateCodeNormalization(parseCompoundCode('B068+L / B075+L / B126'));
  assert.equal(compound.status, CODE_STATUS.UNRESOLVED_COMPOUND);
  assert.deepEqual(compound.components.map((part) => part.lookup.status), [CODE_STATUS.VALID, CODE_STATUS.VALID, CODE_STATUS.VALID]);
  assert.ok(compound.components.every((part, i) => i === 2 || part.qualifiers[0] === 'L'));

  const missing = JSON.parse(fs.readFileSync(testRates));
  missing.records[4].rate = null;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rates-missing-')), 'rates.json');
  fs.writeFileSync(file, JSON.stringify(missing));
  assert.equal(new RateRepository(loadRateSource(file)).lookup('LB126').record.rate, null);
});

test('custom/local entries are separate, auditable, and do not overwrite source records', () => {
  const custom = { code: 'LC001', description: 'Local only', rate: 77, category: 'LOCAL', aliases: [], audit: { reason: 'Hospital approved local slot', created_by: 'TESTER', created_at: '2026-09-26T00:00:00Z' } };
  const repo = repository([custom]);
  const result = repo.lookup('LC001');
  assert.equal(result.status, CODE_STATUS.CUSTOM_LOCAL);
  assert.equal(result.record.rate, 77);
  assert.equal(result.record.audit.reason, custom.audit.reason);
  assert.equal(repo.lookup('LB126').status, CODE_STATUS.VALID);
  assert.throws(() => repository([{ code: 'LC002', rate: 1, audit: {} }]), /requires reason/);
  assert.throws(() => repository([{ code: 'LB126', rate: 1, audit: { reason: 'Override', created_by: 'TESTER', created_at: '2026-09-26T00:00:00Z' } }]), /requires explicit override_authoritative/);
});

test('duplicate/conflicting records fail load instead of silently choosing a version', () => {
  const data = JSON.parse(fs.readFileSync(testRates));
  data.records.push({ ...data.records[0], rate: 999 });
  data.metadata.record_count += 1;
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rates-conflict-')), 'rates.json');
  fs.writeFileSync(file, JSON.stringify(data));
  assert.throws(() => new RateRepository(loadRateSource(file)), /Conflicting duplicate/);
});
