'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { StorageService } = require('../../src/core/storage');
const {
  PARSER_VERSION,
  detectSourceSections,
  normalizeText,
  parseSourcePdf,
  parseStoredSourceBill
} = require('../../src/services/bill-ingestion/source-parser');

function tmp(name = 'phase3-parser-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

async function createPdf(file, pages) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (const pageLines of pages) {
    const page = pdf.addPage([612, 792]);
    let y = 740;
    for (const line of pageLines) {
      page.drawText(line, { x: 48, y, size: 11, font });
      y -= 22;
    }
  }
  fs.writeFileSync(file, await pdf.save());
  return file;
}

async function fixturePdf(name, pages) {
  const file = path.join(tmp('phase3-fixture-'), name);
  return createPdf(file, pages);
}

function service(root = path.join(tmp('phase3-storage-'), 'Storage')) {
  let n = 0;
  const s = new StorageService({ root, idFactory: () => `p3-${++n}`, clock: () => new Date('2026-09-27T00:00:00.000Z') });
  s.initialize();
  return s;
}

function firstCandidate(result) {
  assert.ok(result.candidates.length >= 1, 'expected at least one candidate');
  return result.candidates[0];
}

test('P3-01 valid PDF opens and stores parser version', async () => {
  const file = await fixturePdf('synthetic_valid_open.pdf', [['Procedures', 'Blood Transfusion Charge (C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-valid', runId: 'run-valid' });
  assert.equal(result.parserVersion, PARSER_VERSION);
  assert.equal(result.status, 'COMPLETED');
  assert.equal(result.pageCount, 1);
});

test('P3-02 invalid PDF fails safely with structured error', async () => {
  const file = path.join(tmp('phase3-invalid-'), 'invalid.pdf');
  fs.writeFileSync(file, 'not a pdf');
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-invalid', runId: 'run-invalid' });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, 'INVALID_SOURCE_PDF');
  assert.equal(result.candidateCount, 0);
});

test('P3-03 empty PDF fails safely as PDF_EMPTY', async () => {
  const file = path.join(tmp('phase3-empty-'), 'empty.pdf');
  fs.writeFileSync(file, '');
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-empty', runId: 'run-empty' });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, 'PDF_EMPTY');
});

test('P3-04 missing PDF fails safely as unreadable', async () => {
  const result = await parseSourcePdf(path.join(tmp('phase3-missing-'), 'missing.pdf'), { billSessionId: 'bill-session-missing', runId: 'run-missing' });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, 'PDF_UNREADABLE');
});

test('P3-05 single-page extraction preserves raw and normalized text', async () => {
  const file = await fixturePdf('synthetic_single_page.pdf', [['Procedures', 'Blood   Transfusion   Charge (C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-one', runId: 'run-one' });
  assert.equal(result.pages.length, 1);
  assert.match(result.pages[0].rawText, /Blood/);
  assert.match(result.pages[0].normalizedText, /Blood Transfusion Charge \(C008\)/);
  assert.equal(result.pages[0].extractionStatus, 'OK');
});

test('P3-06 multi-page extraction preserves page ordering', async () => {
  const file = await fixturePdf('synthetic_multi_page.pdf', [['Procedures', 'First Procedure (C008)'], ['Procedures', 'Second Procedure (LB126)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-multi', runId: 'run-multi' });
  assert.deepEqual(result.pages.map((page) => page.pageNumber), [1, 2]);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.pageNumber), [1, 2]);
});

test('P3-07 page model never silently omits pages', async () => {
  const file = await fixturePdf('synthetic_three_page.pdf', [['Main Bill'], ['Procedures', 'Procedure One (C008)'], ['Other text only']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-pages', runId: 'run-pages' });
  assert.equal(result.pageCount, 3);
  assert.equal(result.pages.every((page) => page.extractionStatus === 'OK'), true);
});

test('P3-08 normalization preserves parentheses and code characters', () => {
  assert.equal(normalizeText(' Procedure   Description   (C008) \r\n Qty: 2 '), 'Procedure Description (C008)\nQty: 2');
});

test('P3-09 section detection reports detected and unknown sections honestly', () => {
  const pages = [{ pageNumber: 1, normalizedText: 'Procedures\nProcedure One (C008)\nUnexpected narrative', rawText: '', extractionStatus: 'OK' }];
  const sections = detectSourceSections(pages);
  assert.equal(sections[0].sectionType, 'PROCEDURES');
  assert.equal(sections[0].pageStart, 1);
  assert.equal(sections[0].status, 'DETECTED');
});

test('P3-10 Description (CODE) same-line regression produces non-zero candidate with raw C008', async () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/parser/description-code-basic.expected.json'), 'utf8')).expected;
  const file = await fixturePdf('synthetic_description_code_regression.pdf', [['Procedures', 'Blood Transfusion Charge (C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-regression', runId: 'run-regression' });
  const candidate = firstCandidate(result);
  assert.ok(result.candidateCount >= expected.candidateCountAtLeast);
  assert.match(candidate.description, /Blood Transfusion Charge/);
  assert.equal(candidate.codeRaw, expected.codeRaw);
  assert.equal(candidate.codeNormalizedCandidate, 'C008');
  assert.notEqual(candidate.codeNormalizedCandidate, 'CC008');
  assert.equal(candidate.pageNumber, expected.pageNumber);
  assert.ok(candidate.evidence.sourceText.includes('(C008)'));
});

test('P3-11 Description newline (CODE) regression produces non-zero candidate', async () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '../fixtures/parser/description-code-wrapped.expected.json'), 'utf8')).expected;
  const file = await fixturePdf('synthetic_description_code_wrapped_regression.pdf', [['Procedures', 'Blood Transfusion Charge', '(C008)', 'Qty: 2']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-wrapped', runId: 'run-wrapped' });
  const candidate = firstCandidate(result);
  assert.ok(result.candidateCount >= expected.candidateCountAtLeast);
  assert.match(candidate.description, /Blood Transfusion Charge/);
  assert.equal(candidate.codeRaw, expected.codeRaw);
  assert.equal(candidate.quantityNormalized, expected.quantityNormalized);
});

test('P3-12 Description + code + quantity extracts source-derived quantity only', async () => {
  const file = await fixturePdf('synthetic_description_code_quantity.pdf', [['Procedures', 'Procedure Description (C008) Qty 2']]);
  const candidate = firstCandidate(await parseSourcePdf(file, { billSessionId: 'bill-session-qty', runId: 'run-qty' }));
  assert.equal(candidate.quantityRaw, '2');
  assert.equal(candidate.quantityNormalized, 2);
});

test('P3-13 multiple parenthesized codes on one page become multiple candidates', async () => {
  const file = await fixturePdf('synthetic_multiple_candidates.pdf', [['Procedures', 'First Procedure (C008) Qty 1; Second Procedure (LB126) Qty 2']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-multiple', runId: 'run-multiple' });
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((item) => item.codeRaw), ['C008', 'LB126']);
});

test('P3-14 code preservation keeps C008 and does not globally transform to CC008', async () => {
  const file = await fixturePdf('synthetic_code_preservation.pdf', [['Procedures', 'Procedure Description (C008)']]);
  const candidate = firstCandidate(await parseSourcePdf(file, { billSessionId: 'bill-session-code', runId: 'run-code' }));
  assert.equal(candidate.codeRaw, 'C008');
  assert.equal(candidate.codeNormalizedCandidate, 'C008');
  assert.notEqual(candidate.codeNormalizedCandidate, 'CC008');
});

test('P3-15 ambiguous standalone code is represented as AMBIGUOUS, not parser failure', async () => {
  const file = await fixturePdf('synthetic_ambiguous.pdf', [['Procedures', '(C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-ambiguous', runId: 'run-ambiguous' });
  const candidate = firstCandidate(result);
  assert.equal(candidate.status, 'AMBIGUOUS');
  assert.equal(result.status, 'COMPLETED_WITH_WARNINGS');
});

test('P3-16 zero-candidate parsed PDF returns PARSER_COMPLETED_NO_CANDIDATES, not failure', async () => {
  const file = await fixturePdf('synthetic_zero_candidates.pdf', [['Main Bill', 'This bill contains no enhancement evidence.']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-zero', runId: 'run-zero' });
  assert.equal(result.status, 'PARSER_COMPLETED_NO_CANDIDATES');
  assert.equal(result.candidateCount, 0);
  assert.equal(result.errorCode, undefined);
});

test('P3-17 every candidate carries source evidence and provenance', async () => {
  const file = await fixturePdf('synthetic_evidence.pdf', [['Procedures', 'Evidence Procedure (C008) Qty 3']]);
  const candidate = firstCandidate(await parseSourcePdf(file, { billSessionId: 'bill-session-evidence', runId: 'run-evidence' }));
  assert.equal(candidate.evidence.pageNumber, 1);
  assert.equal(candidate.evidence.sourceSection, 'PROCEDURES');
  assert.match(candidate.evidence.sourceText, /Evidence Procedure/);
  assert.equal(candidate.evidence.textRange, null);
});

test('P3-18 parser result associates billSessionId and runId with pages and candidates', async () => {
  const file = await fixturePdf('synthetic_identity.pdf', [['Procedures', 'Identity Procedure (C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-identity', runId: 'run-identity' });
  assert.equal(result.billSessionId, 'bill-session-identity');
  assert.equal(result.runId, 'run-identity');
  assert.equal(result.candidates[0].billSessionId, 'bill-session-identity');
  assert.equal(result.candidates[0].runId, 'run-identity');
});

test('P3-19 sequential bill uploads keep parser state isolated by billSessionId', async () => {
  const s = service();
  const first = await fixturePdf('synthetic_a.pdf', [['Procedures', 'First Procedure (C008)']]);
  const second = await fixturePdf('synthetic_b.pdf', [['Procedures', 'Second Procedure (LB126)']]);
  const a = s.importSourceBill(first);
  const b = s.importSourceBill(second);
  const parsedA = await parseStoredSourceBill(s, a.billSessionId, { runId: 'run-a' });
  const parsedB = await parseStoredSourceBill(s, b.billSessionId, { runId: 'run-b' });
  assert.equal(parsedA.billSessionId, a.billSessionId);
  assert.equal(parsedB.billSessionId, b.billSessionId);
  assert.equal(parsedA.candidates[0].description.includes('First'), true);
  assert.equal(parsedB.candidates[0].description.includes('Second'), true);
});

test('P3-20 duplicate upload returns existing source session and does not create new parser identity', async () => {
  const s = service();
  const file = await fixturePdf('synthetic_duplicate.pdf', [['Procedures', 'Duplicate Procedure (C008)']]);
  const first = s.importSourceBill(file);
  await parseStoredSourceBill(s, first.billSessionId, { runId: 'run-first' });
  const duplicate = s.importSourceBill(file);
  assert.equal(duplicate.status, 'DUPLICATE_SOURCE_BILL');
  assert.equal(duplicate.billSessionId, first.billSessionId);
  assert.equal(s.listBillSessions().length, 1);
});

test('P3-21 failed parse followed by valid parse keeps failure isolated and valid parse succeeds', async () => {
  const s = service();
  const bad = path.join(tmp('phase3-bad-stored-'), 'bad.pdf');
  fs.writeFileSync(bad, 'bad pdf bytes');
  const badImport = s.importSourceBill(bad);
  const badParse = await parseStoredSourceBill(s, badImport.billSessionId, { runId: 'run-bad' });
  const good = await fixturePdf('synthetic_after_bad.pdf', [['Procedures', 'Good Procedure (C008)']]);
  const goodImport = s.importSourceBill(good);
  const goodParse = await parseStoredSourceBill(s, goodImport.billSessionId, { runId: 'run-good' });
  assert.equal(badParse.status, 'FAILED');
  assert.equal(goodParse.status, 'COMPLETED');
  assert.notEqual(badImport.billSessionId, goodImport.billSessionId);
});

test('P3-22 valid parse followed by failed parse does not corrupt prior parse-result', async () => {
  const s = service();
  const good = await fixturePdf('synthetic_before_bad.pdf', [['Procedures', 'Good Procedure (C008)']]);
  const goodImport = s.importSourceBill(good);
  await parseStoredSourceBill(s, goodImport.billSessionId, { runId: 'run-good-before' });
  const bad = path.join(tmp('phase3-bad-after-'), 'bad.pdf');
  fs.writeFileSync(bad, 'bad pdf bytes');
  const badImport = s.importSourceBill(bad);
  await parseStoredSourceBill(s, badImport.billSessionId, { runId: 'run-bad-after' });
  assert.equal(s.readParseResult(goodImport.billSessionId).result.status, 'COMPLETED');
  assert.equal(s.readParseResult(badImport.billSessionId).result.status, 'FAILED');
});

test('P3-23 reset followed by new upload is storage-safe and creates new session only for new content', async () => {
  const s = service();
  const first = s.importSourceBill(await fixturePdf('synthetic_reset_a.pdf', [['Procedures', 'Reset A Procedure (C008)']]));
  await parseStoredSourceBill(s, first.billSessionId, { runId: 'run-reset-a' });
  const second = s.importSourceBill(await fixturePdf('synthetic_reset_b.pdf', [['Procedures', 'Reset B Procedure (LB126)']]));
  await parseStoredSourceBill(s, second.billSessionId, { runId: 'run-reset-b' });
  assert.notEqual(first.billSessionId, second.billSessionId);
  assert.equal(fs.existsSync(first.paths.sourceFile), true);
  assert.equal(fs.existsSync(second.paths.sourceFile), true);
});

test('P3-24 parser status transitions include reading, extracting, validating, and terminal status', async () => {
  const file = await fixturePdf('synthetic_status.pdf', [['Procedures', 'Status Procedure (C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-status', runId: 'run-status' });
  const statuses = result.statusTimeline.map((entry) => entry.status);
  assert.deepEqual(statuses.slice(0, 3), ['READING', 'EXTRACTING', 'VALIDATING']);
  assert.equal(statuses.at(-1), 'COMPLETED');
});

test('P3-25 Unicode text is normalized conservatively without deleting parentheses', async () => {
  const file = await fixturePdf('synthetic_unicode.pdf', [['Procedures', 'Café Procedure (C008) Qty 1']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-unicode', runId: 'run-unicode' });
  const candidate = firstCandidate(result);
  assert.match(candidate.description.normalize('NFKC'), /Café Procedure/);
  assert.match(candidate.rawText, /\(C008\)/);
});

test('P3-26 negative parenthesized values do not become candidates', async () => {
  const file = await fixturePdf('synthetic_negative_parentheses.pdf', [['Main Bill', 'Invoice total (1234)', 'Reference value (ABCD)', 'Identifier (C123456)', 'random text']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-negative', runId: 'run-negative' });
  assert.equal(result.candidateCount, 0);
  assert.equal(result.status, 'PARSER_COMPLETED_NO_CANDIDATES');
});

test('P3-27 code-like unrelated text in unknown context is not treated as candidate', async () => {
  const file = await fixturePdf('synthetic_unrelated_code_like.pdf', [['Invoice Reference (C008)', 'Another note (LB126)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-unrelated', runId: 'run-unrelated' });
  assert.equal(result.candidateCount, 0);
});

test('P3-28 synthetic Description (CODE) regression fixture is clearly synthetic and matches golden output', async () => {
  const expectedPath = path.join(__dirname, '../fixtures/parser/description-code-basic.expected.json');
  const expected = JSON.parse(fs.readFileSync(expectedPath, 'utf8'));
  assert.equal(expected.synthetic, true);
  assert.match(expected.fixture, /^synthetic_/);
  const file = await fixturePdf(expected.fixture, [['Procedures', 'Blood Transfusion Charge (C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-golden', runId: 'run-golden' });
  assert.ok(result.candidateCount >= expected.expected.candidateCountAtLeast);
  assert.equal(result.candidates[0].codeRaw, expected.expected.codeRaw);
});

test('P3-29 parser result persists and reloads without depending on renderer memory', async () => {
  const root = path.join(tmp('phase3-persist-'), 'Storage');
  const s1 = service(root);
  const imported = s1.importSourceBill(await fixturePdf('synthetic_persist.pdf', [['Procedures', 'Persist Procedure (C008)']]));
  await parseStoredSourceBill(s1, imported.billSessionId, { runId: 'run-persist' });
  const s2 = service(root);
  const reloaded = s2.readParseResult(imported.billSessionId);
  assert.equal(reloaded.status, 'SUCCESS');
  assert.equal(reloaded.result.runId, 'run-persist');
  assert.equal(reloaded.result.candidateCount, 1);
});

test('P3-30 parser emits evidence candidates only and cannot trigger executable portal actions', async () => {
  const file = await fixturePdf('synthetic_no_actions.pdf', [['Procedures', 'Evidence Procedure (C008)']]);
  const result = await parseSourcePdf(file, { billSessionId: 'bill-session-no-actions', runId: 'run-no-actions' });
  assert.equal(Array.isArray(result.candidates), true);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'actions'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(result, 'executableActions'), false);
});

test('P3-31 parser failure is fail-closed and records failure artifact through StorageService', async () => {
  const s = service();
  const bad = path.join(tmp('phase3-fail-closed-'), 'bad.pdf');
  fs.writeFileSync(bad, 'bad pdf bytes');
  const imported = s.importSourceBill(bad);
  const result = await parseStoredSourceBill(s, imported.billSessionId, { runId: 'run-fail-closed' });
  assert.equal(result.status, 'FAILED');
  assert.equal(s.listFailures().some((failure) => failure.runId === 'run-fail-closed'), true);
  assert.equal(fs.existsSync(imported.paths.sourceFile), true);
});
