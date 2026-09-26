'use strict';

const DATE = '(\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}(?:\\s+\\d{1,2}:\\d{2}(?:\\s*[AP]M)?)?)';
const ROW = new RegExp(`^${DATE}\\s+(?:to\\s+)?${DATE}\\s+([\\d.]+(?:\\s*(?:days?|hrs?|hours?))?)\\s+([A-Z0-9/-]+)\\s+(.+)$`, 'i');

function parseBedDetails(sections) {
  const beds = [];
  for (const section of sections.filter((value) => value.section_type === 'BED_DETAILS')) {
    for (const entry of section.content) {
      let match = entry.text.match(ROW);
      if (match) {
        beds.push({
          from_date: match[1], to_date: match[2], duration: match[3], bed_number: match[4], bed_category: match[5].trim(),
          source_page: entry.page_number, source_line: entry.line_number, raw_source_context: entry.text, semantic_context: section.context, included_in_primary_bill: section.included_in_primary_bill
        });
        continue;
      }
      const labeled = entry.text.match(/from\s*[:=]\s*(.+?)\s*[|;]\s*to\s*[:=]\s*(.+?)\s*[|;]\s*duration\s*[:=]\s*(.+?)\s*[|;]\s*bed\s*(?:no|number)?\s*[:=]\s*(.+?)\s*[|;]\s*(?:bed\s*)?category\s*[:=]\s*(.+)$/i);
      if (labeled) beds.push({
        from_date: labeled[1].trim(), to_date: labeled[2].trim(), duration: labeled[3].trim(), bed_number: labeled[4].trim(), bed_category: labeled[5].trim(),
        source_page: entry.page_number, source_line: entry.line_number, raw_source_context: entry.text, semantic_context: section.context, included_in_primary_bill: section.included_in_primary_bill
      });
    }
  }
  return beds;
}

module.exports = { parseBedDetails };
