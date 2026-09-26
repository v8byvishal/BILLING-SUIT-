'use strict';

const SECTION_MARKERS = Object.freeze([
  ['BLOOD_BANK_PROCEDURE', /^blood\s+bank\s+procedure(?:\s*\(.*\))?$/i],
  ['CONSULTATION', /^consultation(?:\s*\(.*\))?$/i],
  ['EQUIPMENT', /^equipment(?:\s*\(.*\))?$/i],
  ['INVESTIGATIONS', /^investigations?(?:\s*\(.*\))?$/i],
  ['IP_PHARMACY', /^ip\s+pharmacy(?:\s*\(.*\))?$/i],
  ['OP_PHARMACY', /^op\s+pharmacy(?:\s*\(.*\))?$/i],
  ['NON_INVASIVE_PROCEDURE', /^non\s+invasive\s+procedure(?:\s*\(.*\))?$/i],
  ['OT_CONSUMABLES', /^ot\s+consumables?(?:\s*\(.*\))?$/i],
  ['OT_PHARMACY', /^ot\s+pharmacy(?:\s*\(.*\))?$/i],
  ['PHYSIOTHERAPY', /^physiotherapy(?:\s*\(.*\))?$/i],
  ['PROFILE', /^profile(?:\s+(?:breakup|details))?(?:\s*\(.*\))?$/i],
  ['ROOM_RENT', /^room\s+rent(?:\s*\(.*\))?$/i],
  ['HOSPITAL_SERVICES', /^hospital\s+services?(?:\s*\(.*\))?$/i],
  ['MEDICAL_SERVICES', /^medical\s+services?(?:\s*\(.*\))?$/i],
  ['WARDS_OTHERS', /^wards?\s+others?(?:\s*\(.*\))?$/i],
  ['WARD_CONSUMABLES', /^(?:ward|room)\s+consumables?(?:\s*\(.*\))?$/i],
  ['CATHLAB_CONSUMABLES', /^cath\s*lab\s+consumables?(?:\s*\(.*\))?$/i],
  ['CONSUMABLES', /^consumables?(?:\s*\(.*\))?$/i],
  ['OTHER_CONSUMABLES', /^(?!.*\bpharmacy\b)(?!.*\/)[A-Za-z][A-Za-z &-]{1,40}\s+consumables?(?:\s*\(.*\))?$/i],
  ['BED_DETAILS', /^bed\s+details?$/i]
]);

function markerFor(line) {
  const clean = line.replace(/\s+/g, ' ').trim().replace(/\s*:\s*$/, '');
  for (const [type, regex] of SECTION_MARKERS) if (regex.test(clean)) return type;
  const department = clean.match(/^([A-Za-z][A-Za-z &/-]{1,60})\s*\(\s*999311\s*\)$/i);
  return department ? department[1].trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_') : null;
}

function detectSections(pages) {
  const sections = [];
  let active = null;
  let context = 'PRIMARY_BILL';
  let sequence = 0;

  function closeAt(pageNumber, lineNumber) {
    if (!active) return;
    active.end = { page_number: pageNumber, line_number: Math.max(0, lineNumber) };
    active.raw_context = active.content.map((entry) => entry.text).join('\n');
    sections.push(active);
    active = null;
  }

  function open(type, heading, pageNumber, lineNumber, sectionContext = context) {
    closeAt(pageNumber, lineNumber - 1);
    active = {
      id: `section-${++sequence}`,
      section_type: type,
      heading,
      context: sectionContext,
      included_in_primary_bill: sectionContext === 'PRIMARY_BILL',
      start: { page_number: pageNumber, line_number: lineNumber },
      end: null,
      content: [],
      raw_context: ''
    };
  }

  for (const page of pages) {
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = page.lines[index];
      const lineNumber = index + 1;
      if (/^patient\s+payable\s+total\b/i.test(line)) {
        if (active) active.content.push({ page_number: page.page_number, line_number: lineNumber, text: line });
        closeAt(page.page_number, lineNumber);
        context = 'PRIMARY_BILL';
        continue;
      }
      if (/^patient\s+payable\s*:?$/i.test(line)) {
        context = 'PATIENT_PAYABLE';
        open('PATIENT_PAYABLE', line, page.page_number, lineNumber, context);
        continue;
      }
      const marker = markerFor(line);
      if (marker) {
        open(marker, line, page.page_number, lineNumber, context);
        continue;
      }
      if (active) active.content.push({ page_number: page.page_number, line_number: lineNumber, text: line });
    }
  }
  const finalPage = pages[pages.length - 1];
  closeAt(finalPage.page_number, finalPage.lines.length);
  return sections;
}

module.exports = { SECTION_MARKERS, detectSections, markerFor };
