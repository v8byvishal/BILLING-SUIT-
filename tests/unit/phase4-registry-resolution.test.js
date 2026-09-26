'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { StorageService } = require('../../src/core/storage');
const { parseSourcePdf } = require('../../src/services/bill-ingestion/source-parser');
const {
  AUTHORITY_STATUSES,
  ActiveRegistryStore,
  createRegistry,
  loadRegistryFile,
  lookupRegistry,
  normalizeCode,
  validateRegistry
} = require('../../src/services/cghs/registry');
const {
  RAW_ALIAS_CODES,
  RESOLUTION_STATUSES,
  RULE_SET_VERSION,
  getDefaultRuleSet,
  resolveCandidate,
  resolveParseResult,
  resolveStoredSourceBill,
  splitCompoundExpression
} = require('../../src/services/cghs/rule-resolution');

const fixtureRegistry = path.join(__dirname, '..', 'fixtures', 'registry', 'phase4-valid-registry.json');

function tempRoot(prefix = 'phase4-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function storage() {
  const root = tempRoot();
  const service = new StorageService({ root, clock: () => new Date('2026-09-27T00:00:00.000Z'), idFactory: () => 'phase4-id' });
  const status = service.initialize();
  assert.equal(status.status, 'READY');
  return { root, service };
}

function entry(code, description = `${code} fixture`, extra = {}) {
  return {
    entryId: `REG-${normalizeCode(code)}-${extra.row || 1}`,
    code,
    description,
    category: 'TEST',
    unit: 'COUNT',
    rate: null,
    sourceReference: { file: 'phase4-test-registry.json', page: null, sheet: null, row: extra.row || 1 },
    authorityStatus: extra.authorityStatus || AUTHORITY_STATUSES.TEST_ONLY,
    effectiveFrom: extra.effectiveFrom || null,
    effectiveTo: extra.effectiveTo || null,
    ...extra
  };
}

function registry(entries, extra = {}) {
  return createRegistry({
    registryVersion: extra.registryVersion || 'phase4-test-registry',
    source: { type: 'TEST_ONLY_JSON', file: 'phase4-test-registry.json' },
    sourceHash: extra.sourceHash || 'phase4-test-source-hash',
    publishedDate: extra.publishedDate || '2026-09-27',
    importedAt: '2026-09-27T00:00:00.000Z',
    authorityStatus: extra.authorityStatus || AUTHORITY_STATUSES.TEST_ONLY,
    entries
  });
}

function candidate(codeRaw, description, extra = {}) {
  return {
    candidateId: extra.candidateId || 'candidate-0001',
    billSessionId: extra.billSessionId || 'bill-session-phase4',
    runId: extra.runId || 'parser-run-phase4',
    pageNumber: extra.pageNumber || 1,
    section: extra.section || 'PROCEDURES',
    description,
    rawText: extra.rawText || `${description || ''} (${codeRaw || ''})`,
    codeRaw,
    codeNormalizedCandidate: normalizeCode(codeRaw),
    quantityRaw: extra.quantityRaw ?? null,
    quantityNormalized: extra.quantityNormalized ?? null,
    evidence: extra.evidence || { pageNumber: extra.pageNumber || 1, sourceSection: extra.section || 'PROCEDURES', sourceText: extra.rawText || `${description || ''} (${codeRaw || ''})`, lineNumbers: [1] },
    status: 'VALID_EVIDENCE',
    ...extra
  };
}

async function fixturePdf(lines) {
  const dir = tempRoot('phase4-pdf-');
  const file = path.join(dir, 'synthetic-phase4.pdf');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  lines.forEach((line, index) => page.drawText(line, { x: 50, y: 740 - (index * 18), size: 12, font }));
  fs.writeFileSync(file, await doc.save());
  return file;
}

test('P4-01 valid registry load validates as PASS', () => {
  const loaded = loadRegistryFile(fixtureRegistry, { importedAt: '2026-09-27T00:00:00.000Z' });
  const report = validateRegistry(loaded);
  assert.equal(report.status, 'PASS');
  assert.equal(loaded.entries.length, 2);
});

test('P4-02 invalid registry load reports FAIL', () => {
  const report = validateRegistry({ schemaVersion: 1, registryVersion: 'bad', sourceHash: 'x', authorityStatus: 'TEST_ONLY', entries: 'not-array' });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'MISSING_ENTRIES'));
});

test('P4-03 registry source hash is calculated from source file', () => {
  const dir = tempRoot('phase4-hash-');
  const file = path.join(dir, 'registry.json');
  fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, registryVersion: 'hash-v1', source: { file: 'registry.json', type: 'JSON' }, authorityStatus: 'TEST_ONLY', entries: [entry('LB001')] }));
  const loaded = loadRegistryFile(file, { importedAt: '2026-09-27T00:00:00.000Z' });
  assert.match(loaded.sourceHash, /^[a-f0-9]{64}$/);
});

test('P4-04 duplicate code in overlapping effective range fails validation', () => {
  const report = validateRegistry(registry([entry('LB001', 'Same', { row: 1 }), entry('LB001', 'Same', { row: 2, entryId: 'REG-LB001-2' })]));
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'DUPLICATE_CODE'));
});

test('P4-05 conflicting duplicate code fails validation', () => {
  const report = validateRegistry(registry([entry('LB001', 'First', { row: 1 }), entry('LB001', 'Second', { row: 2, entryId: 'REG-LB001-2' })]));
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'CONFLICTING_CODE_DESCRIPTION'));
});

test('P4-06 missing authority status fails validation', () => {
  const report = validateRegistry({ schemaVersion: 1, registryVersion: 'missing-authority', source: { type: 'JSON', file: 'x.json' }, sourceHash: 'x', entries: [entry('LB001')] });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'UNSUPPORTED_AUTHORITY_STATUS'));
});

test('P4-07 missing source reference fails validation', () => {
  const report = validateRegistry({ schemaVersion: 1, registryVersion: 'missing-ref', source: { type: 'JSON' }, sourceHash: 'x', authorityStatus: 'TEST_ONLY', entries: [{ entryId: 'E1', code: 'LB001', description: 'No source ref', authorityStatus: 'TEST_ONLY' }] });
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'MISSING_SOURCE_REFERENCE'));
});

test('P4-08 effective date validation catches invalid ranges', () => {
  const report = validateRegistry(registry([entry('LB001', 'Date bad', { effectiveFrom: '2026-10-01', effectiveTo: '2026-09-01' })]));
  assert.equal(report.status, 'FAIL');
  assert.ok(report.issues.some((issue) => issue.code === 'INVALID_EFFECTIVE_RANGE'));
});

test('P4-09 active registry selection persists reference', () => {
  const { service } = storage();
  const store = new ActiveRegistryStore(service);
  const activated = store.activateRegistry(registry([entry('LB126')]), { activatedBy: 'TEST', reason: 'P4-09' });
  assert.equal(activated.active.registryVersion, 'phase4-test-registry');
  assert.equal(store.getActiveReference().active.registryVersion, 'phase4-test-registry');
});

test('P4-10 active registry survives store reload', () => {
  const { root, service } = storage();
  new ActiveRegistryStore(service).activateRegistry(registry([entry('LB126')]), { reason: 'P4-10' });
  const loaded = new ActiveRegistryStore(new StorageService({ root, clock: () => new Date('2026-09-27T00:00:00.000Z') })).loadActiveRegistry();
  assert.equal(loaded.status, 'SUCCESS');
  assert.equal(loaded.registry.entries[0].code, 'LB126');
});

test('P4-11 invalid registry cannot become active', () => {
  const { service } = storage();
  const store = new ActiveRegistryStore(service);
  assert.throws(() => store.activateRegistry(registry([entry('LB001'), entry('LB001', 'Duplicate', { row: 2, entryId: 'DUP' })])), /Invalid registry cannot be activated/);
});

test('P4-12 CSV registry import preserves row source references', () => {
  const dir = tempRoot('phase4-csv-');
  const file = path.join(dir, 'registry.csv');
  fs.writeFileSync(file, 'code,description,rate,authorityStatus\nLB126,CSV fixture,10,TEST_ONLY\n');
  const loaded = loadRegistryFile(file, { registryVersion: 'csv-v1', authorityStatus: 'TEST_ONLY', importedAt: '2026-09-27T00:00:00.000Z' });
  assert.equal(validateRegistry(loaded).status, 'PASS');
  assert.equal(loaded.entries[0].sourceReference.row, 2);
});

test('P4-13 syntactic code normalization does not perform C to CC semantic mapping', () => {
  assert.equal(normalizeCode(' c008 '), 'C008');
  assert.notEqual(normalizeCode(' c008 '), 'CC008');
});

test('P4-14 exact authoritative registry code match resolves directly', () => {
  const reg = registry([entry('LB126', 'Ferritin')]);
  const result = resolveCandidate(candidate('LB126', 'Ferritin', { quantityNormalized: 2 }), { registry: reg });
  assert.equal(result.status, RESOLUTION_STATUSES.DIRECT_REGISTRY_MATCH);
  assert.equal(result.output.finalCode, 'LB126');
  assert.equal(result.output.quantity, 2);
  assert.equal(result.registryEntryId, 'REG-LB126-1');
});

test('P4-15 C004 validated mapping requires NIV machine per day context', () => {
  const result = resolveCandidate(candidate('C004', 'NIV Machine Per Day'));
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC004');
  assert.equal(result.ruleId, 'CGHS_C_004_NIV_MACHINE_PER_DAY');
});

test('P4-16 C008 validated mapping requires Blood Transfusion Charge context', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'resolution', 'description-c008.expected.json'), 'utf8'));
  const result = resolveCandidate(candidate(expected.input.codeRaw, expected.input.description));
  assert.equal(result.status, expected.expected.status);
  assert.equal(result.output.finalCode, expected.expected.finalCode);
  assert.equal(result.ruleId, expected.expected.ruleId);
});

test('P4-17 C010 validated mapping is explicit only', () => {
  const result = resolveCandidate(candidate('C010', 'Endotracheal Intubation'));
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC010');
});

test('P4-18 C011 validated mapping is explicit only', () => {
  const result = resolveCandidate(candidate('C011', 'Central Line'));
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC011');
});

test('P4-19 C012 validated mapping is explicit only', () => {
  const result = resolveCandidate(candidate('C012', 'Nebulizer Therapy'));
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC012');
});

test('P4-20 C014 validated mapping is explicit only', () => {
  const result = resolveCandidate(candidate('C014', 'Ryles Tube Insertion Charge'));
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC014');
});

test('P4-21 C002 oxygen half day maps to CC002 quantity 12', () => {
  const result = resolveCandidate(candidate('C002', 'Oxygen Half Day'));
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC002');
  assert.equal(result.output.quantity, 12);
});

test('P4-22 C002 oxygen full day maps to CC002 quantity 24', () => {
  const result = resolveCandidate(candidate('C002', 'Oxygen Full Day'));
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC002');
  assert.equal(result.output.quantity, 24);
});

test('P4-23 C002 packed cells stays review-required', () => {
  const result = resolveCandidate(candidate('C002', 'Packed Cells Blood Bank'));
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.equal(result.output.finalCode, null);
  assert.equal(result.ruleId, 'C002_PACKED_CELLS_REVIEW');
});

test('P4-24 C003 ventilator remains review-required and never CC003', () => {
  const result = resolveCandidate(candidate('C003', 'Ventilator support'));
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.notEqual(result.output.finalCode, 'CC003');
});

test('P4-25 C003 Fresh Frozen Plasma remains review-required and never CC003', () => {
  const result = resolveCandidate(candidate('C003', 'Fresh Frozen Plasma'));
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.notEqual(result.output.finalCode, 'CC003');
});

test('P4-26 CC001 ICU derived rule requires ICU count evidence', () => {
  const result = resolveCandidate(candidate('CC001', 'ICU count'), { context: { counts: { icuCount: 2 } } });
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CC001');
  assert.equal(result.output.quantity, 2);
});

test('P4-27 WC001 ward derived rule requires ward count evidence', () => {
  const result = resolveCandidate(candidate('WC001', 'Ward count'), { context: { counts: { wardCount: 3 } } });
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'WC001');
  assert.equal(result.output.quantity, 3);
});

test('P4-28 CN002 formula derives ICU x3 plus ward x2', () => {
  const result = resolveCandidate(candidate('CN002', 'Inpatient consultation derived'), { context: { counts: { icuCount: 2, wardCount: 4 } } });
  assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(result.output.finalCode, 'CN002');
  assert.equal(result.output.quantity, 14);
});

test('P4-29 category composition rules are explicit families only', () => {
  const cases = [
    ['B126', 'CGHS-L B126 Ferritin', 'LB126', 'CATEGORY_CGHS_L_B_TO_LB'],
    ['001', 'CGHS-RI 001 imaging', 'RI001', 'CATEGORY_CGHS_RI_NUMERIC_TO_RI'],
    ['002', 'CGHS-CI 002 cardiac', 'CI002', 'CATEGORY_CGHS_CI_NUMERIC_TO_CI'],
    ['P009', 'CGHS-G P009 procedure', 'GP009', 'CATEGORY_CGHS_G_P_TO_GP'],
    ['T005', 'CGHS-P T005 therapy', 'PT005', 'CATEGORY_CGHS_P_T_TO_PT']
  ];
  for (const [raw, text, finalCode, ruleId] of cases) {
    const result = resolveCandidate(candidate(raw, text, { rawText: text }));
    assert.equal(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
    assert.equal(result.output.finalCode, finalCode);
    assert.equal(result.ruleId, ruleId);
  }
});

test('P4-30 raw alias protection requires explicit rule before final code', () => {
  for (const raw of RAW_ALIAS_CODES) {
    const result = resolveCandidate(candidate(raw, 'Generic unsupported context'));
    assert.notEqual(result.status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
    assert.notEqual(result.output.finalCode, `CC${raw.slice(1)}`);
  }
});

test('P4-31 no blanket C to CC rule exists', () => {
  const result = resolveCandidate(candidate('C001', 'Generic C family charge'));
  assert.notEqual(result.output.finalCode, 'CC001');
  assert.equal(result.status, RESOLUTION_STATUSES.NO_MATCH);
});

test('P4-32 conflicting validated rules produce RULE_CONFLICT', () => {
  const ruleSet = getDefaultRuleSet();
  const conflictRule = { ...ruleSet.rules.find((rule) => rule.ruleId === 'CGHS_C_008_BLOOD_TRANSFUSION'), ruleId: 'CONFLICT_C008_TO_XX008', output: { finalCode: 'XX008', quantity: 'SOURCE_QUANTITY' }, priority: 901 };
  const result = resolveCandidate(candidate('C008', 'Blood Transfusion Charge'), { ruleSet: { ruleSetVersion: RULE_SET_VERSION, rules: [...ruleSet.rules, conflictRule] } });
  assert.equal(result.status, RESOLUTION_STATUSES.RULE_CONFLICT);
  assert.equal(result.conflicts.length, 2);
});

test('P4-33 unverified registry authority cannot produce direct validated mapping', () => {
  const reg = registry([entry('LB126', 'Ferritin', { authorityStatus: AUTHORITY_STATUSES.UNVERIFIED })], { authorityStatus: AUTHORITY_STATUSES.UNVERIFIED });
  const result = resolveCandidate(candidate('LB126', 'Ferritin'), { registry: reg });
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.equal(result.output.finalCode, null);
  assert.equal(result.authorityStatus, AUTHORITY_STATUSES.UNVERIFIED);
});

test('P4-34 insufficient C008 context stays review-required', () => {
  const result = resolveCandidate(candidate('C008', 'Procedure charge'));
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.equal(result.output.finalCode, null);
});

test('P4-35 repeated resolution is deterministic', () => {
  const input = candidate('C008', 'Blood Transfusion Charge', { quantityNormalized: 1 });
  const first = resolveCandidate(input);
  const second = resolveCandidate(input);
  assert.deepEqual({ status: first.status, output: first.output, ruleId: first.ruleId, reason: first.reason }, { status: second.status, output: second.output, ruleId: second.ruleId, reason: second.reason });
});

test('P4-36 registry version and source hash are recorded in resolution output', () => {
  const reg = registry([entry('LB126', 'Ferritin')], { registryVersion: 'version-repro', sourceHash: 'hash-repro' });
  const result = resolveCandidate(candidate('LB126', 'Ferritin'), { registry: reg });
  assert.equal(result.registryVersion, 'version-repro');
  assert.equal(result.registrySourceHash, 'hash-repro');
  assert.equal(result.ruleSetVersion, RULE_SET_VERSION);
});

test('P4-37 Patient Payable candidates remain separate from main pool', () => {
  const result = resolveCandidate(candidate('C008', 'Blood Transfusion Charge', { section: 'PATIENT_PAYABLE' }));
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.match(result.reason, /Patient Payable/);
  assert.equal(result.output.finalCode, null);
});

test('P4-38 compound expressions preserve components for review', () => {
  const input = candidate('LB001+LB002', 'Compound lab expression', { rawText: 'Compound lab expression LB001 + LB002' });
  const split = splitCompoundExpression(input);
  const result = resolveCandidate(input);
  assert.equal(split.isCompound, true);
  assert.equal(split.status, 'SPLIT');
  assert.deepEqual(split.components.map((item) => item.codeRaw), ['LB001', 'LB002']);
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.ok(result.evidence.some((item) => item.type === 'COMPOUND_EXPRESSION'));
});

test('P4-39 invented code prevention returns NO_MATCH instead of a guessed code', () => {
  const result = resolveCandidate(candidate('ZZ999', 'Plausible sounding service'));
  assert.equal(result.status, RESOLUTION_STATUSES.NO_MATCH);
  assert.equal(result.output.finalCode, null);
});

test('P4-40 unsupported raw alias remains review-required', () => {
  const result = resolveCandidate(candidate('N002', 'Generic nursing alias'));
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.equal(result.output.finalCode, null);
});

test('P4-41 fuzzy/description match cannot become validated mapping', () => {
  const reg = registry([entry('LB126', 'Serum Ferritin Test')]);
  const result = resolveCandidate(candidate('', 'Serum Ferritin', { codeRaw: '', codeNormalizedCandidate: '' }), { registry: reg });
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.equal(result.output.finalCode, null);
  assert.match(result.reason, /fuzzy|Description/i);
});

test('P4-42 effective-date unknown prevents silent direct resolution', () => {
  const reg = registry([entry('LB126', 'Ferritin dated', { effectiveFrom: '2025-01-01' })], { authorityStatus: AUTHORITY_STATUSES.AUTHORITATIVE });
  const result = resolveCandidate(candidate('LB126', 'Ferritin dated'), { registry: reg });
  assert.equal(result.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.equal(result.authorityStatus, AUTHORITY_STATUSES.DATE_UNVERIFIED);
});

test('P4-43 invalid active registry cannot resolve as active authority', () => {
  const { service } = storage();
  const store = new ActiveRegistryStore(service);
  const activated = store.activateRegistry(registry([entry('LB126')]), { reason: 'P4-43' });
  const absoluteRegistry = service.resolveManagedPath(activated.active.registryPath);
  const tampered = JSON.parse(fs.readFileSync(absoluteRegistry, 'utf8'));
  tampered.sourceHash = 'tampered';
  fs.writeFileSync(absoluteRegistry, JSON.stringify(tampered));
  const loaded = store.loadActiveRegistry();
  assert.equal(loaded.status, 'INVALID');
  const result = resolveCandidate(candidate('LB126', 'Ferritin'), { registry: loaded.status === 'SUCCESS' ? loaded.registry : null });
  assert.equal(result.status, RESOLUTION_STATUSES.NO_MATCH);
});

test('P4-44 parser candidate cannot directly become executable action', () => {
  const resolution = resolveParseResult({ billSessionId: 'bill-session-x', runId: 'parser-x', parserVersion: '3.0.0', candidates: [candidate('C008', 'Blood Transfusion Charge')] });
  assert.equal(resolution.results[0].status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(Object.prototype.hasOwnProperty.call(resolution.results[0], 'portalAction'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(resolution, 'actions'), false);
});

test('P4-45 Phase 3 Description (C008) parser output resolves only with matching context', async () => {
  const file = await fixturePdf(['Procedures', 'Blood Transfusion Charge (C008)']);
  const parse = await parseSourcePdf(file, { billSessionId: 'bill-session-parser-phase4', runId: 'parser-phase4', clock: () => new Date('2026-09-27T00:00:00.000Z') });
  assert.equal(parse.candidates[0].codeRaw, 'C008');
  const resolution = resolveParseResult(parse);
  assert.equal(resolution.results[0].status, RESOLUTION_STATUSES.VALIDATED_MAPPING);
  assert.equal(resolution.results[0].output.finalCode, 'CC008');

  const insufficient = resolveCandidate({ ...parse.candidates[0], description: 'Procedure charge', rawText: 'Procedure charge (C008)', evidence: { ...parse.candidates[0].evidence, sourceText: 'Procedure charge (C008)' } });
  assert.equal(insufficient.status, RESOLUTION_STATUSES.REVIEW_REQUIRED);
  assert.equal(insufficient.output.finalCode, null);
});

test('P4-46 resolution persistence writes one run per bill session', () => {
  const { service } = storage();
  const billSessionId = 'bill-session-resolution-persist';
  fs.mkdirSync(service.getSourceBillDirectory(billSessionId), { recursive: true });
  service.writeParseResult(billSessionId, { billSessionId, runId: 'parser-persist', parserVersion: '3.0.0', candidates: [candidate('C008', 'Blood Transfusion Charge', { billSessionId })] });
  const result = resolveStoredSourceBill(service, billSessionId);
  const loaded = service.readResolutionResult(billSessionId);
  assert.equal(result.resultCount, 1);
  assert.equal(loaded.status, 'SUCCESS');
  assert.equal(loaded.result.billSessionId, billSessionId);
  assert.equal(loaded.result.results[0].ruleId, 'CGHS_C_008_BLOOD_TRANSFUSION');
});

test('P4-47 default rule fixture lists locked mappings', () => {
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'rules', 'phase4-default-rules.expected.json'), 'utf8'));
  const ruleSet = getDefaultRuleSet();
  assert.equal(ruleSet.ruleSetVersion, expected.ruleSetVersion);
  assert.ok(ruleSet.rules.length >= expected.minimumRuleCount);
  for (const ruleId of expected.lockedRuleIds) assert.ok(ruleSet.rules.some((rule) => rule.ruleId === ruleId), ruleId);
});
