'use strict';

// Join only strongly evidenced wrapped code fields. General adjacent bill text is never
// merged: that would risk turning descriptions, headers, or unrelated identifiers into codes.
const CODE_LABEL = /(?:tariff\s+alias|service\s+code|cghs\s+code|code)\s*[:=-]/i;
const INCOMPLETE_CODE = /(?:tariff\s+alias|service\s+code|cghs\s+code|code)\s*[:=-]\s*[A-Z]{1,5}\s*\d{0,6}(?:\s*\+\s*[A-Z0-9]{0,8})?(?:\s*\/\s*)?$/i;
const CODE_CONTINUATION = /^(?:[A-Z0-9]{1,8}(?:\s*\+\s*[A-Z0-9]{1,8})*(?:\s*\/\s*)?\s*)+(?:\||;|$)/i;

function buildLogicalRows(content) {
  const rows = [];
  for (let index = 0; index < content.length; index += 1) {
    const current = content[index];
    let text = current.text;
    const sourceLines = [{ page_number: current.page_number, line_number: current.line_number, text: current.text }];
    while (index + 1 < content.length && CODE_LABEL.test(text) && INCOMPLETE_CODE.test(text) && CODE_CONTINUATION.test(content[index + 1].text)) {
      const next = content[++index];
      text += ` ${next.text}`;
      sourceLines.push({ page_number: next.page_number, line_number: next.line_number, text: next.text });
    }
    rows.push({ ...current, text, source_lines: sourceLines });
  }
  return rows;
}

module.exports = { buildLogicalRows };
