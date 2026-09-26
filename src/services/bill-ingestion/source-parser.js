'use strict';

const crypto = require('node:crypto');
const path = require('node:path');
const { loadPdf } = require('./pdf-loader');

const PARSER_VERSION = '3.0.0';
const PARSER_STATUSES = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  READING: 'READING',
  EXTRACTING: 'EXTRACTING',
  VALIDATING: 'VALIDATING',
  COMPLETED: 'COMPLETED',
  COMPLETED_WITH_WARNINGS: 'COMPLETED_WITH_WARNINGS',
  PARSER_COMPLETED_NO_CANDIDATES: 'PARSER_COMPLETED_NO_CANDIDATES',
  FAILED: 'FAILED'
});

const CANDIDATE_STATUSES = Object.freeze({
  CANDIDATE: 'CANDIDATE',
  VALID_EVIDENCE: 'VALID_EVIDENCE',
  AMBIGUOUS: 'AMBIGUOUS',
  INCOMPLETE: 'INCOMPLETE',
  IGNORED: 'IGNORED'
});

const CODE_PATTERN = '[A-Z]{1,5}\\s*\\d{3}';
const PAREN_CODE_GLOBAL = new RegExp(`([^();\\n][^;\\n()]{2,}?)\\s*\\(\\s*(${CODE_PATTERN})\\s*\\)([^;\\n]*)`, 'gi');
const PAREN_CODE_ONLY = new RegExp(`^\\s*\\(\\s*(${CODE_PATTERN})\\s*\\)\\s*(.*)$`, 'i');
const CODE_CONTEXT_WORDS = /\b(?:procedure|service|charge|test|investigation|therapy|transfusion|medicine|pharmacy|consumable|ward|room|rent|ot|cath\s*lab|consultation|equipment|profile|blood|dialysis|surgery|operation|bed)\b/i;

const SECTION_PATTERNS = Object.freeze([
  ['PATIENT_PAYABLE', /^patient\s+payable\b/i],
  ['ENHANCEMENT', /^enhancements?\b/i],
  ['MAIN_BILL', /^(?:main\s+bill|bill\s+details|hospital\s+bill)\b/i],
  ['PROCEDURES', /^(?:procedures?|non\s+invasive\s+procedure|blood\s+bank\s+procedure|hospital\s+services?|medical\s+services?)\s*:?(?:\s*\(.*\))?$/i],
  ['MEDICINES', /^medicines?\s*:?(?:\s*\(.*\))?$/i],
  ['PHARMACY', /^(?:ip|op|ot)?\s*pharmacy\s*:?(?:\s*\(.*\))?$/i],
  ['CONSUMABLES', /^.*consumables?\s*:?(?:\s*\(.*\))?$/i],
  ['WARD', /^(?:ward|room\s+rent|bed\s+details?)\s*:?(?:\s*\(.*\))?$/i],
  ['OT', /^(?:ot|operation\s+theatre)\s*:?(?:\s*\(.*\))?$/i],
  ['CATHLAB', /^cath\s*lab\s*:?(?:\s*\(.*\))?$/i]
]);

function normalizeText(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t\f\v]+/g, ' ').replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .trim();
}

function normalizeCode(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

function normalizeQuantity(value) {
  if (value == null || value === '') return null;
  const number = Number(String(value).replace(/[,\s]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function extractQuantity(...texts) {
  const text = texts.filter(Boolean).join(' ');
  const match = text.match(/\b(?:qty|quantity)\s*[:=]?\s*([0-9]+(?:\.[0-9]+)?)/i)
    || text.match(/(?:^|\s)[x×]\s*([0-9]+(?:\.[0-9]+)?)/i)
    || text.match(/^\s*[-|:]?\s*([0-9]+(?:\.[0-9]+)?)\s*$/);
  if (!match) return { quantityRaw: null, quantityNormalized: null, unit: null };
  return { quantityRaw: match[1], quantityNormalized: normalizeQuantity(match[1]), unit: null };
}

function sectionTypeForLine(line) {
  const normalized = String(line || '').replace(/\s+/g, ' ').trim().replace(/\s*:\s*$/, '');
  for (const [type, regex] of SECTION_PATTERNS) if (regex.test(normalized)) return type;
  return null;
}

function makePageModel(extractedPage, index) {
  const pageNumber = Number(extractedPage.page_number || index + 1);
  const rawText = String(extractedPage.raw_text || (Array.isArray(extractedPage.lines) ? extractedPage.lines.join('\n') : ''));
  return {
    pageNumber,
    rawText,
    normalizedText: normalizeText(rawText),
    extractionStatus: 'OK'
  };
}

function detectSourceSections(pages) {
  const sections = [];
  let active = null;
  let sequence = 0;

  function close(endPage, endLine) {
    if (!active) return;
    active.pageEnd = endPage;
    active.endLine = Math.max(0, endLine);
    active.evidence = active.lines.length ? active.lines[0].text : active.heading;
    active.status = active.sectionType === 'UNKNOWN_SECTION' ? 'UNKNOWN_SECTION' : 'DETECTED';
    active.confidence = active.sectionType === 'UNKNOWN_SECTION' ? 0.25 : 0.9;
    sections.push(active);
    active = null;
  }

  function open(sectionType, heading, pageNumber, lineNumber) {
    close(pageNumber, lineNumber - 1);
    active = {
      sectionId: `section-${++sequence}`,
      sectionType,
      pageStart: pageNumber,
      pageEnd: pageNumber,
      startLine: lineNumber,
      endLine: lineNumber,
      confidence: 0,
      status: 'DETECTED',
      evidence: heading,
      heading,
      lines: []
    };
  }

  for (const page of pages) {
    const lines = page.normalizedText ? page.normalizedText.split('\n').filter(Boolean) : [];
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;
      const marker = sectionTypeForLine(line);
      if (marker) {
        open(marker, line, page.pageNumber, lineNumber);
        continue;
      }
      if (!active) open('UNKNOWN_SECTION', 'Unknown section', page.pageNumber, lineNumber);
      active.lines.push({ pageNumber: page.pageNumber, lineNumber, text: line });
      active.pageEnd = page.pageNumber;
      active.endLine = lineNumber;
    }
  }
  const lastPage = pages[pages.length - 1] || { pageNumber: 0, normalizedText: '' };
  close(lastPage.pageNumber, (lastPage.normalizedText || '').split('\n').filter(Boolean).length);
  return sections;
}

function hasCandidateContext(description, sectionType) {
  if (!description || !/[A-Za-z]/.test(description)) return false;
  if (!['UNKNOWN_SECTION', 'MAIN_BILL'].includes(sectionType)) return true;
  return CODE_CONTEXT_WORDS.test(description);
}

function cleanDescription(value) {
  return String(value || '')
    .replace(/^[-–—|:;\s]+/, '')
    .replace(/[-–—|:;\s]+$/, '')
    .replace(/\b(?:qty|quantity)\s*[:=]?\s*[0-9]+(?:\.[0-9]+)?\s*$/i, '')
    .trim();
}

function makeCandidate({ billSessionId, runId, candidateNumber, section, line, description, codeRaw, tail = '', status = CANDIDATE_STATUSES.VALID_EVIDENCE, sourceText = null, sourceLines = null }) {
  const quantity = extractQuantity(tail, sourceLines?.[1]?.text, sourceLines?.[2]?.text);
  const codeNormalizedCandidate = codeRaw ? normalizeCode(codeRaw) : null;
  const evidenceLines = sourceLines || [line];
  const text = sourceText || evidenceLines.map((entry) => entry.text).join('\n');
  return {
    candidateId: `candidate-${String(candidateNumber).padStart(4, '0')}`,
    billSessionId,
    runId,
    pageNumber: line.pageNumber,
    section: section.sectionType,
    description: description || null,
    rawText: text,
    codeRaw: codeRaw ? normalizeCode(codeRaw) : null,
    codeNormalizedCandidate,
    quantityRaw: quantity.quantityRaw,
    quantityNormalized: quantity.quantityNormalized,
    unit: quantity.unit,
    evidence: {
      pageNumber: line.pageNumber,
      sourceSection: section.sectionType,
      sourceText: text,
      textRange: null,
      lineNumbers: evidenceLines.map((entry) => entry.lineNumber)
    },
    confidence: status === CANDIDATE_STATUSES.VALID_EVIDENCE ? 0.9 : 0.45,
    status
  };
}

function extractCandidatesFromSections(sections, { billSessionId, runId }) {
  const candidates = [];
  const warnings = [];
  let candidateNumber = 0;

  for (const section of sections) {
    const lines = section.lines;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      let matched = false;
      PAREN_CODE_GLOBAL.lastIndex = 0;
      let match;
      while ((match = PAREN_CODE_GLOBAL.exec(line.text)) !== null) {
        const description = cleanDescription(match[1]);
        const codeRaw = match[2];
        const tail = match[3] || '';
        if (!hasCandidateContext(description, section.sectionType)) continue;
        candidateNumber += 1;
        candidates.push(makeCandidate({ billSessionId, runId, candidateNumber, section, line, description, codeRaw, tail }));
        matched = true;
      }
      if (matched) continue;

      const next = lines[index + 1];
      const nextCode = next ? next.text.match(PAREN_CODE_ONLY) : null;
      if (nextCode) {
        const description = cleanDescription(line.text);
        if (hasCandidateContext(description, section.sectionType)) {
          const afterCode = nextCode[2] || '';
          const maybeQty = lines[index + 2] && /^\s*(?:qty|quantity|[x×])\b|^\s*\d+(?:\.\d+)?\s*$/i.test(lines[index + 2].text)
            ? lines[index + 2]
            : null;
          candidateNumber += 1;
          candidates.push(makeCandidate({
            billSessionId,
            runId,
            candidateNumber,
            section,
            line,
            description,
            codeRaw: nextCode[1],
            tail: afterCode,
            sourceLines: maybeQty ? [line, next, maybeQty] : [line, next]
          }));
          index += maybeQty ? 2 : 1;
          continue;
        }
      }

      const onlyCode = line.text.match(PAREN_CODE_ONLY);
      if (onlyCode) {
        candidateNumber += 1;
        candidates.push(makeCandidate({
          billSessionId,
          runId,
          candidateNumber,
          section,
          line,
          description: null,
          codeRaw: onlyCode[1],
          tail: onlyCode[2] || '',
          status: CANDIDATE_STATUSES.AMBIGUOUS
        }));
        warnings.push({ code: 'AMBIGUOUS_CODE_WITHOUT_DESCRIPTION', pageNumber: line.pageNumber, section: section.sectionType });
      }
    }
  }
  return { candidates, warnings };
}

function buildParserResult({ billSessionId, runId, source, pages, sections, candidates, warnings, startedAt, finishedAt, statusTimeline }) {
  const status = candidates.length === 0
    ? PARSER_STATUSES.PARSER_COMPLETED_NO_CANDIDATES
    : (warnings.length ? PARSER_STATUSES.COMPLETED_WITH_WARNINGS : PARSER_STATUSES.COMPLETED);
  return {
    schemaVersion: 1,
    billSessionId,
    runId,
    parserVersion: PARSER_VERSION,
    status,
    pageCount: pages.length,
    candidateCount: candidates.length,
    warnings,
    source: source ? { fileName: source.file_name || path.basename(source.file_path || ''), sha256: source.sha256 || null, byteSize: source.byte_size || null } : null,
    pages,
    sections: sections.map((section) => ({
      sectionId: section.sectionId,
      sectionType: section.sectionType,
      pageStart: section.pageStart,
      pageEnd: section.pageEnd,
      confidence: section.confidence,
      status: section.status,
      evidence: section.evidence
    })),
    candidates,
    metrics: {
      startedAt,
      finishedAt,
      durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)),
      pages: pages.length,
      candidateCount: candidates.length
    },
    statusTimeline
  };
}

async function parseSourcePdf(filePath, options = {}) {
  const billSessionId = options.billSessionId;
  const runId = options.runId || `parser-run-${crypto.randomUUID()}`;
  if (!billSessionId) throw Object.assign(new Error('billSessionId is required for source parsing'), { code: 'INVALID_BILL_SESSION' });
  const clock = options.clock || (() => new Date());
  const startedAt = clock().toISOString();
  const statusTimeline = [{ status: PARSER_STATUSES.READING, timestamp: startedAt }];
  try {
    const extracted = await loadPdf(filePath);
    statusTimeline.push({ status: PARSER_STATUSES.EXTRACTING, timestamp: clock().toISOString() });
    const pages = extracted.pages.map(makePageModel);
    const sections = detectSourceSections(pages);
    const extraction = extractCandidatesFromSections(sections, { billSessionId, runId });
    statusTimeline.push({ status: PARSER_STATUSES.VALIDATING, timestamp: clock().toISOString() });
    const finishedAt = clock().toISOString();
    const result = buildParserResult({
      billSessionId,
      runId,
      source: extracted.source,
      pages,
      sections,
      candidates: extraction.candidates,
      warnings: extraction.warnings,
      startedAt,
      finishedAt,
      statusTimeline
    });
    statusTimeline.push({ status: result.status, timestamp: finishedAt });
    return result;
  } catch (error) {
    const finishedAt = clock().toISOString();
    return {
      schemaVersion: 1,
      billSessionId,
      runId,
      parserVersion: PARSER_VERSION,
      status: PARSER_STATUSES.FAILED,
      errorCode: parserErrorCode(error),
      message: error.message,
      pageCount: 0,
      candidateCount: 0,
      warnings: [],
      candidates: [],
      pages: [],
      sections: [],
      metrics: { startedAt, finishedAt, durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt)), pages: 0, candidateCount: 0 },
      statusTimeline: [...statusTimeline, { status: PARSER_STATUSES.FAILED, timestamp: finishedAt }]
    };
  }
}

function parserErrorCode(error) {
  const message = String(error?.message || error || '');
  if (/empty/i.test(message)) return 'PDF_EMPTY';
  if (/does not exist|unreadable/i.test(message)) return 'PDF_UNREADABLE';
  if (/must be a PDF|signature/i.test(message)) return 'INVALID_SOURCE_PDF';
  if (/open PDF|Invalid PDF|corrupt|malformed/i.test(message)) return 'PDF_CORRUPT';
  return 'PDF_PARSE_FAILED';
}

async function parseStoredSourceBill(storageService, billSessionId, options = {}) {
  const runId = options.runId || `parser-run-${crypto.randomUUID()}`;
  const sourceRecord = storageService.getSourceBillRecord(billSessionId, { verifyHash: true });
  if (sourceRecord.status !== 'SUCCESS') {
    const failure = storageService.appendFailure({
      runId,
      billSessionId,
      stage: 'PDF_PARSE',
      code: sourceRecord.status,
      message: sourceRecord.error || 'Stored source bill is not available for parsing',
      recoverable: true
    });
    return { schemaVersion: 1, billSessionId, runId, parserVersion: PARSER_VERSION, status: PARSER_STATUSES.FAILED, errorCode: sourceRecord.status, failure, pageCount: 0, candidateCount: 0, warnings: [], candidates: [], pages: [], sections: [] };
  }
  storageService.appendAudit({ runId, billSessionId, operation: 'PDF_PARSE_STARTED', stage: 'PDF_PARSE', status: 'READING', sourceRef: { sha256: sourceRecord.metadata.sha256, fileSize: sourceRecord.metadata.fileSize } });
  const started = Date.now();
  const result = await parseSourcePdf(sourceRecord.paths.sourceFile, { billSessionId, runId, clock: options.clock });
  storageService.writeParseResult(billSessionId, result);
  storageService.updateBillSession(billSessionId, { status: result.status, sourcePath: sourceRecord.paths.sourceFile });
  if (result.status === PARSER_STATUSES.FAILED) {
    const failure = storageService.appendFailure({ runId, billSessionId, stage: 'PDF_PARSE', code: result.errorCode, message: result.message, recoverable: true });
    storageService.appendAudit({ runId, billSessionId, operation: 'PDF_PARSE_FAILED', stage: 'PDF_PARSE', status: 'FAILED', durationMs: Date.now() - started, errorCode: result.errorCode, sourceRef: { sha256: sourceRecord.metadata.sha256, failureId: failure.failureId } });
  } else if (result.status === PARSER_STATUSES.PARSER_COMPLETED_NO_CANDIDATES) {
    storageService.appendAudit({ runId, billSessionId, operation: 'PARSER_ZERO_CANDIDATES', stage: 'PDF_PARSE', status: result.status, durationMs: Date.now() - started, sourceRef: { pageCount: result.pageCount } });
  } else {
    if (result.warnings.length) storageService.appendAudit({ runId, billSessionId, operation: 'PDF_PARSE_WARNING', stage: 'PDF_PARSE', status: 'WARNING', durationMs: Date.now() - started, sourceRef: { warningCount: result.warnings.length } });
    storageService.appendAudit({ runId, billSessionId, operation: 'PDF_PARSE_COMPLETED', stage: 'PDF_PARSE', status: result.status, durationMs: Date.now() - started, sourceRef: { pageCount: result.pageCount, candidateCount: result.candidateCount } });
  }
  return result;
}

module.exports = {
  CANDIDATE_STATUSES,
  PARSER_STATUSES,
  PARSER_VERSION,
  detectSourceSections,
  extractCandidatesFromSections,
  normalizeText,
  parseSourcePdf,
  parseStoredSourceBill,
  parserErrorCode
};
