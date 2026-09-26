'use strict';

const { loadPdf } = require('./pdf-loader');
const { parseBillDocument } = require('./bill-parser');

async function ingestBillPdf(filePath) {
  const extracted = await loadPdf(filePath);
  return parseBillDocument(extracted);
}

module.exports = { ingestBillPdf, loadPdf, parseBillDocument };
