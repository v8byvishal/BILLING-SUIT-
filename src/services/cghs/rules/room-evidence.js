'use strict';

const ICU = /\b(?:ICU|CCU|PICU|MICU)\b/i;
const WARD = /\b(?:AC\s+MULTIBEDS?|SINGLE|GENERAL\s+WARD|WARD)\b/i;
const AMBIGUOUS = /\bHDU\b/i;

function classifyCategory(value) {
  const text = String(value || '').trim();
  if (!text) return { classification: 'AMBIGUOUS', reason: 'MISSING_BED_CATEGORY' };
  if (AMBIGUOUS.test(text)) return { classification: 'AMBIGUOUS', reason: 'HDU_RULE_UNDEFINED' };
  if (ICU.test(text)) return { classification: 'ICU', reason: 'STRUCTURED_ICU_CATEGORY' };
  if (WARD.test(text)) return { classification: 'WARD', reason: 'STRUCTURED_WARD_CATEGORY' };
  return { classification: 'AMBIGUOUS', reason: 'UNSUPPORTED_BED_CATEGORY' };
}

function collectRoomEvidence(bill) {
  const structured = (bill.bed_details || []).filter((row) => row.included_in_primary_bill !== false);
  if (structured.length) return structured.map((row, index) => ({
    evidence_id: `bed-${index + 1}`,
    source_type: 'BED_DETAILS',
    source_page: row.source_page,
    source_line: row.source_line,
    raw_source_context: row.raw_source_context,
    bed_category: row.bed_category,
    from_date: row.from_date,
    to_date: row.to_date,
    duration: row.duration,
    ...classifyCategory(row.bed_category)
  }));

  const sections = (bill.sections || []).filter((section) => section.section_type === 'ROOM_RENT');
  const rows = sections.flatMap((section) => section.content || []).filter((entry) => /ROOM\s+RENT/i.test(entry.text));
  return rows.map((row, index) => ({
    evidence_id: `room-${index + 1}`,
    source_type: 'ROOM_RENT',
    source_page: row.page_number,
    source_line: row.line_number,
    raw_source_context: row.text,
    bed_category: row.text,
    from_date: null,
    to_date: null,
    duration: null,
    ...classifyCategory(row.text)
  }));
}

module.exports = { classifyCategory, collectRoomEvidence };
