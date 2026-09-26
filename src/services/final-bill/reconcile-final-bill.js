'use strict';

const IDENTIFIERS = [
  ['bill_number', (bill) => bill.billing?.bill_number],
  ['uhid', (bill) => bill.patient?.uhid],
  ['ip_number', (bill) => bill.patient?.ip_number]
];

function clean(value) { return value == null ? null : String(value).trim().toUpperCase(); }

function reconcileFinalBill(initialBill, finalBill) {
  const comparisons = IDENTIFIERS.map(([field, read]) => {
    const initial = clean(read(initialBill)); const final = clean(read(finalBill));
    return { field, initial, final, result: !initial || !final ? 'MISSING' : initial === final ? 'MATCH' : 'MISMATCH' };
  });
  const mismatches = comparisons.filter((item) => item.result === 'MISMATCH');
  const matches = comparisons.filter((item) => item.result === 'MATCH');
  if (mismatches.length) return { status: 'MATCH_REQUIRED', decision: 'STOPPED_MISMATCH', comparisons, reasons: mismatches.map((item) => `${item.field.toUpperCase()}_MISMATCH`) };
  if (!matches.length) return { status: 'MATCH_REQUIRED', decision: 'INSUFFICIENT_IDENTIFIERS', comparisons, reasons: ['NO_SHARED_DETERMINISTIC_IDENTIFIER'] };
  return { status: 'MATCHED', decision: 'DETERMINISTIC_IDENTIFIER_MATCH', comparisons, reasons: [] };
}

module.exports = { reconcileFinalBill };
