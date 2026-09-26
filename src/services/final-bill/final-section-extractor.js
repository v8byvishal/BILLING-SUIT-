'use strict';

const { buildLogicalRows } = require('../bill-ingestion/logical-row-builder');
const { parseItemLine, parseNumber, matchField } = require('../bill-ingestion/field-parser');
const { CODE_STATUS } = require('../cghs/rate-list/repository');

const PHARMACY_SECTIONS = new Set(['IP_PHARMACY', 'OP_PHARMACY', 'OT_PHARMACY']);
const CONSUMABLE_SECTIONS = new Set(['OT_CONSUMABLES', 'WARD_CONSUMABLES', 'CATHLAB_CONSUMABLES', 'CONSUMABLES', 'OTHER_CONSUMABLES']);

function classifyCode(item, rateRepository) {
  if (!item) return { status: 'REVIEW_REQUIRED', code_classification: null, reason: 'EXPLICIT_CODE_NOT_PRESENT' };
  const validation = rateRepository.validateCodeNormalization(item.code_normalization);
  if (validation.status === CODE_STATUS.UNRESOLVED_COMPOUND) return { status: 'REVIEW_REQUIRED', code_classification: validation.status, reason: 'COMPOUND_SEMANTICS_NOT_INFERRED' };
  if (validation.status === CODE_STATUS.CUSTOM_LOCAL) return { status: 'CUSTOM_VALID', code_classification: validation.status, reason: 'EXPLICIT_ACTIVE_CUSTOM_CODE' };
  if (validation.status === CODE_STATUS.VALID) return { status: 'VALID', code_classification: validation.status, reason: 'EXPLICIT_REFERENCE_CODE' };
  if (validation.status === CODE_STATUS.UNKNOWN) return { status: 'REVIEW_REQUIRED', code_classification: validation.status, reason: 'UNKNOWN_EXPLICIT_CODE' };
  return { status: 'REVIEW_REQUIRED', code_classification: validation.status, reason: 'INVALID_EXPLICIT_CODE' };
}

function fallbackRow(entry, section) {
  const description = matchField(entry.text, [/(?:item|product|medicine|service|description)\s*[:=]\s*([^|;]+)/i]);
  const quantity = parseNumber(matchField(entry.text, [/(?:qty|quantity)\s*[:=]\s*([\d,.]+)/i]));
  if (!description && quantity == null) return null;
  return {
    section: section.section_type, semantic_context: section.context, included_in_primary_bill: section.included_in_primary_bill,
    source_page: entry.page_number, source_line: entry.line_number, service_name: description,
    raw_code_expression: null, code_normalization: null, quantity,
    raw_source_context: entry.text, source_lines: entry.source_lines || [entry]
  };
}

function aggregate(records) {
  const groups = new Map();
  for (const record of records) {
    const identity = record.normalized_code || record.description?.trim().toUpperCase() || `ROW:${record.source_page}:${record.source_line}`;
    const key = JSON.stringify([record.section, identity, record.status]);
    if (!groups.has(key)) groups.set(key, { ...record, quantity: 0, quantity_status: 'SUMMED', source_evidence: [], occurrence_count: 0 });
    const group = groups.get(key); group.occurrence_count += 1; group.source_evidence.push(...record.source_evidence);
    if (record.quantity == null) group.quantity_status = 'REVIEW_REQUIRED'; else group.quantity += record.quantity;
  }
  return [...groups.values()].map((record) => ({ ...record, quantity: record.quantity_status === 'SUMMED' ? record.quantity : null }));
}

function detectAmbiguousHeadings(finalBill) {
  const knownHeadings = new Set([...(finalBill.sections || []), ...(finalBill.excluded_sections || [])].map((section) => `${section.start.page_number}:${section.start.line_number}`));
  const reviews = [];
  for (const page of finalBill.pages || []) page.lines.forEach((line, index) => {
    if (/pharmacy|consumables?/i.test(line) && !knownHeadings.has(`${page.page_number}:${index + 1}`)
      && /^[A-Za-z &/-]{3,80}$/.test(line.trim()) && !/\b(?:service|item|qty|quantity|code)\b/i.test(line)) {
      reviews.push({ status: 'REVIEW_REQUIRED', reason: 'AMBIGUOUS_FINAL_SECTION_HEADING', raw_text: line, source_page: page.page_number, source_line: index + 1 });
    }
  });
  return reviews;
}

function extractFinalSections(finalBill, rateRepository) {
  const pharmacy = [];
  const consumables = [];
  const excluded = [];
  const audit = [];
  const allSections = [...(finalBill.sections || []), ...(finalBill.excluded_sections || [])];
  for (const section of allSections) {
    const kind = PHARMACY_SECTIONS.has(section.section_type) ? 'PHARMACY' : CONSUMABLE_SECTIONS.has(section.section_type) ? 'CONSUMABLE' : null;
    if (!kind) continue;
    for (const entry of buildLogicalRows(section.content || [])) {
      const parsed = parseItemLine(entry, section) || fallbackRow(entry, section);
      if (!parsed) continue;
      const decision = classifyCode(parsed.code_normalization ? parsed : null, rateRepository);
      const component = parsed.code_normalization?.components?.[0];
      const record = {
        section: section.section_type, category: kind, description: parsed.service_name,
        code: parsed.raw_code_expression, normalized_code: parsed.code_normalization?.is_compound ? parsed.code_normalization.normalized_expression : component?.base_code || null,
        quantity: parsed.quantity, unit: matchField(entry.text, [/(?:unit|uom)\s*[:=]\s*([^|;]+)/i]),
        status: decision.status, code_classification: decision.code_classification, reason: decision.reason,
        source_page: parsed.source_page, source_line: parsed.source_line,
        source_evidence: [{ page: parsed.source_page, line: parsed.source_line, section: section.section_type, raw_text: parsed.raw_source_context, source_lines: parsed.source_lines }]
      };
      audit.push({ parser_decision: decision.reason, ...record });
      if (!section.included_in_primary_bill) excluded.push({ ...record, status: 'EXCLUDED_BY_SECTION', reason: 'PATIENT_PAYABLE_EXCLUDED' });
      else (kind === 'PHARMACY' ? pharmacy : consumables).push(record);
    }
  }
  const reviewRequired = [...pharmacy, ...consumables].filter((record) => record.status === 'REVIEW_REQUIRED');
  reviewRequired.push(...detectAmbiguousHeadings(finalBill));
  if (!allSections.some((section) => PHARMACY_SECTIONS.has(section.section_type) || CONSUMABLE_SECTIONS.has(section.section_type))) {
    reviewRequired.push({ status: 'REVIEW_REQUIRED', reason: 'NO_FINAL_PHARMACY_OR_CONSUMABLE_SECTIONS', raw_text: null, source_page: null, source_line: null });
  }
  return {
    pharmacy_records: aggregate(pharmacy), consumable_records: aggregate(consumables),
    excluded_records: excluded, review_required_records: reviewRequired,
    extracted_sections: allSections.filter((section) => PHARMACY_SECTIONS.has(section.section_type) || CONSUMABLE_SECTIONS.has(section.section_type))
      .map((section) => ({ id: section.id, section: section.section_type, context: section.context, start: section.start, end: section.end })),
    extraction_audit: audit
  };
}

module.exports = { CONSUMABLE_SECTIONS, PHARMACY_SECTIONS, extractFinalSections };
