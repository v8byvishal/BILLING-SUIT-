'use strict';

const { aggregateItems } = require('./aggregator');
const { parseBedDetails } = require('./bed-details-parser');
const { parseDocumentFields, parseItemLine } = require('./field-parser');
const { createBillDocument } = require('./normalized-model');
const { normalizePages } = require('./page-parser');
const { detectSections } = require('./section-detector');
const { buildLogicalRows } = require('./logical-row-builder');

function parseBillDocument(input) {
  if (!input?.source || !Array.isArray(input.pages)) throw new Error('Structured PDF input with source and pages is required');
  const pages = normalizePages(input.pages);
  const model = createBillDocument({ source: input.source, pages });
  model.metadata.document_type = 'HOSPITAL_BILL';
  model.metadata.page_count = pages.length;
  const fields = parseDocumentFields(pages);
  Object.assign(model.patient, fields.patient);
  Object.assign(model.admission, fields.admission);
  Object.assign(model.billing, fields.billing);

  const detected = detectSections(pages);
  let occurrence = 0;
  for (const section of detected) {
    section.items = [];
    const destination = section.included_in_primary_bill ? model.sections : model.excluded_sections;
    destination.push(section);
    model.parsing_audit.sections_detected.push({ id: section.id, type: section.section_type, context: section.context, page: section.start.page_number });
    if (!section.included_in_primary_bill) {
      model.parsing_audit.excluded_patient_payable_sections.push({ id: section.id, type: section.section_type, start: section.start, end: section.end });
    }
    for (const entry of buildLogicalRows(section.content)) {
      const item = parseItemLine(entry, section);
      if (!item) {
        if (/\b(?:CGHS\s+code|service\s+code|tariff\s+alias|code)\s*[:=-]/i.test(entry.text)) {
          model.parsing_audit.rejected_tokens.push({
            page: entry.page_number,
            section: section.section_type,
            raw: entry.text,
            reason: 'No syntactically recognizable code expression',
            parser_decision: 'INVALID_FORMAT'
          });
        } else if (/\bservice\s*[:=][^|;]+(?:[|;].*)?\b(?:qty|quantity)\s*[:=]\s*[\d,.]+/i.test(entry.text)) {
          model.parsing_audit.review_candidates.push({
            page: entry.page_number,
            section: section.section_type,
            raw: entry.text,
            normalized: null,
            reason: 'POSSIBLY_MISSING_CODE',
            parser_decision: 'REVIEW_REQUIRED'
          });
        }
        continue;
      }
      item.id = `occurrence-${++occurrence}`;
      model.parsing_audit.raw_items_detected += 1;
      if (item.normalization_status !== 'UNRESOLVED') model.parsing_audit.normalized_items += 1;
      else model.parsing_audit.rejected_tokens.push({ page: item.source_page, raw: item.raw_code_expression, reason: 'Syntactic code expression unresolved' });
      if (item.code_normalization.is_compound) model.parsing_audit.compound_expressions.push({ occurrence_id: item.id, page: item.source_page, raw: item.raw_code_expression, normalized: item.code_normalization.normalized_expression });
      model.parsing_audit.transformations.push({ occurrence_id: item.id, raw: item.raw_code_expression, normalized: item.code_normalization.normalized_expression, status: item.normalization_status });
      section.items.push(item);
      if (item.included_in_primary_bill) model.items.push(item);
    }
  }
  model.bed_details = parseBedDetails(detected);
  model.aggregates = aggregateItems(model.items);
  if (!detected.length) model.parsing_audit.warnings.push('No recognized semantic bill sections were detected');
  return model;
}

module.exports = { parseBillDocument };
