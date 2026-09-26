'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { loadPdf } = require('../../src/services/bill-ingestion/pdf-loader');
const { parseBillDocument } = require('../../src/services/bill-ingestion/bill-parser');

// Synthetic PDF integration fixture. This is intentionally not reported as a real-bill regression.
test('local PDF ingestion extracts every page and passes page-aware input to parser', async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const first = pdf.addPage([600, 800]);
  first.drawText('Patient Name: SYNTHETIC TEST', { x: 40, y: 750, size: 12, font });
  first.drawText('IP Pharmacy', { x: 40, y: 720, size: 12, font });
  first.drawText('Service: Test Item | Code: B126 | Qty: 2 | Amount: 20.00', { x: 40, y: 690, size: 10, font });
  const second = pdf.addPage([600, 800]);
  second.drawText('Bed Details', { x: 40, y: 750, size: 12, font });
  second.drawText('From: 20/09/2026 | To: 21/09/2026 | Duration: 1 day | Bed No: W-1 | Category: General Ward', { x: 40, y: 720, size: 8, font });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vnext-synthetic-pdf-'));
  const file = path.join(dir, 'synthetic-bill.pdf');
  fs.writeFileSync(file, await pdf.save());

  const extracted = await loadPdf(file);
  assert.equal(extracted.pages.length, 2);
  assert.deepEqual(extracted.pages.map((page) => page.page_number), [1, 2]);
  assert.match(extracted.pages[0].raw_text, /SYNTHETIC TEST/);
  assert.match(extracted.pages[1].raw_text, /Bed Details/);
  const bill = parseBillDocument(extracted);
  assert.equal(bill.metadata.page_count, 2);
  assert.equal(bill.items[0].source_page, 1);
  assert.equal(bill.bed_details[0].source_page, 2);
});
