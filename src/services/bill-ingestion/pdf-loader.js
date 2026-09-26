'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const MAX_PDF_BYTES = 100 * 1024 * 1024;

function validatePdfPath(filePath) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('PDF path must be absolute');
  if (path.extname(filePath).toLowerCase() !== '.pdf') throw new Error('Selected file must be a PDF');
  let stat;
  try { stat = fs.statSync(filePath); } catch (error) { throw new Error(`PDF does not exist or is unreadable: ${error.message}`); }
  if (!stat.isFile()) throw new Error('Selected PDF path is not a file');
  if (stat.size === 0) throw new Error('Selected PDF is empty');
  if (stat.size > MAX_PDF_BYTES) throw new Error(`PDF exceeds ${MAX_PDF_BYTES / 1024 / 1024} MB ingestion limit`);
  fs.accessSync(filePath, fs.constants.R_OK);
  return stat;
}

function textItemsToLines(items) {
  const lines = [];
  let current = '';
  for (const item of items) {
    const value = String(item.str || '').trim();
    if (value) current += `${current ? ' ' : ''}${value}`;
    if (item.hasEOL && current) { lines.push(current); current = ''; }
  }
  if (current) lines.push(current);
  return lines;
}

async function loadPdf(filePath) {
  const stat = validatePdfPath(filePath);
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('Selected file does not have a valid PDF signature');

  let pdfjs;
  try { pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); }
  catch (error) { throw new Error(`PDF extraction library unavailable: ${error.message}`); }

  const pdfjsRoot = path.dirname(require.resolve('pdfjs-dist/package.json'));
  let document;
  try {
    document = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
      standardFontDataUrl: path.join(pdfjsRoot, 'standard_fonts') + path.sep
    }).promise;
  }
  catch (error) { throw new Error(`Unable to open PDF: ${error.message}`); }

  const pages = [];
  try {
    for (let index = 1; index <= document.numPages; index += 1) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const lines = textItemsToLines(content.items);
      pages.push({ page_number: index, raw_text: lines.join('\n'), lines });
      page.cleanup();
    }
  } finally {
    await document.destroy();
  }

  return {
    source: {
      file_path: path.resolve(filePath),
      file_name: path.basename(filePath),
      byte_size: stat.size,
      sha256: crypto.createHash('sha256').update(buffer).digest('hex')
    },
    pages
  };
}

module.exports = { MAX_PDF_BYTES, loadPdf, textItemsToLines, validatePdfPath };
