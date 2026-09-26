'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApplicationStateStore, ENHANCEMENT_STATUS, FINAL_BILL_STATUS } = require('../../src/core/application-state-store');

function store() {
  let n = 0;
  return createApplicationStateStore({ idFactory: () => `id-${++n}`, clock: () => new Date(`2026-09-26T00:00:0${Math.min(n, 9)}.000Z`) });
}

test('P1-05 billSessionId is created for every active bill session', () => {
  const state = store();
  const id = state.startBillSession({ source: { file_name: 'a.pdf', sha256: 'hash-a' } });
  assert.match(id, /^bill-session-/);
  const snap = state.snapshot();
  assert.equal(snap.currentBill.billSessionId, id);
  assert.equal(snap.currentBill.status, 'LOADED');
});

test('P1-06 reset operations clear active bill, enhancement, final bill, and transient UI without deleting history', () => {
  const state = store();
  const id = state.startBillSession({ source: { file_name: 'a.pdf', sha256: 'hash-a' } });
  state.setEnhancement({ billSessionId: id, status: ENHANCEMENT_STATUS.READY, plan: { entries: [{ code: 'LB001' }] } });
  state.setFinalBill({ billSessionId: id, status: FINAL_BILL_STATUS.READY, source: { file_name: 'final.pdf' } });
  const before = state.snapshot().history.length;
  const snap = state.resetCurrentBill();
  assert.equal(snap.currentBill.status, 'NONE');
  assert.equal(snap.enhancement.plan, null);
  assert.equal(snap.finalBill.source, null);
  assert.ok(snap.history.length > before);
});

test('P1-07 cross-bill isolation prevents Bill A plan/results from appearing in Bill B active session', () => {
  const state = store();
  const a = state.startBillSession({ source: { file_name: 'a.pdf', sha256: 'hash-a' } });
  state.setEnhancement({ billSessionId: a, status: ENHANCEMENT_STATUS.READY, plan: { source: 'A', entries: [{ code: 'A001' }] }, results: { code: 'A001' } });
  const b = state.startBillSession({ source: { file_name: 'b.pdf', sha256: 'hash-b' } });
  const snap = state.snapshot();
  assert.notEqual(a, b);
  assert.equal(snap.currentBill.source.file_name, 'b.pdf');
  assert.equal(snap.enhancement.billSessionId, b);
  assert.equal(snap.enhancement.plan, null);
  assert.equal(snap.enhancement.results, null);
  assert.equal(snap.finalBill.billSessionId, b);
  assert.equal(snap.history.some((record) => record.source_reference?.source?.file_name === 'a.pdf' || record.source_reference?.file_name === 'a.pdf'), true);
});

test('P1-08 invalid billSessionId is rejected before mutating session-owned state', () => {
  const state = store();
  const id = state.startBillSession({ source: { file_name: 'a.pdf', sha256: 'hash-a' } });
  assert.throws(() => state.setEnhancement({ billSessionId: 'wrong', status: ENHANCEMENT_STATUS.READY }), /active bill session/);
  assert.equal(state.snapshot().currentBill.billSessionId, id);
});
