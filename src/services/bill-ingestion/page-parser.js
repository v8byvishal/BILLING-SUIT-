'use strict';

function normalizePages(pages) {
  if (!Array.isArray(pages) || pages.length === 0) throw new Error('At least one extracted page is required');
  return pages.map((page, index) => {
    const pageNumber = Number(page.page_number ?? index + 1);
    const rawText = String(page.raw_text ?? '');
    const lines = Array.isArray(page.lines)
      ? page.lines.map((line) => String(line).replace(/\s+/g, ' ').trim()).filter(Boolean)
      : rawText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
    return { page_number: pageNumber, raw_text: rawText, lines };
  });
}

module.exports = { normalizePages };
