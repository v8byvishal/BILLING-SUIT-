'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { textItemsToLines, validatePdfPath } = require('../../src/services/bill-ingestion/pdf-loader');

test('PDF text items preserve explicit page-line boundaries', () => {
  const lines = textItemsToLines([
    { str: 'First', hasEOL: false }, { str: 'line', hasEOL: true }, { str: 'Second line', hasEOL: true }
  ]);
  assert.deepEqual(lines, ['First line', 'Second line']);
});

test('ingestion rejects missing and non-PDF paths clearly', () => {
  assert.throws(() => validatePdfPath(path.join(os.tmpdir(), 'missing.pdf')), /does not exist or is unreadable/);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vnext-ingest-')), 'bill.txt');
  fs.writeFileSync(file, 'not a pdf');
  assert.throws(() => validatePdfPath(file), /must be a PDF/);
});
