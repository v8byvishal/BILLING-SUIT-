'use strict';

const { ingestBillPdf } = require('../bill-ingestion');
const { createCompletedBill, resolveFinalBillMatch } = require('./completed-bill');
const { saveCompletedBill } = require('./completed-bill-storage');
const { extractFinalSections } = require('./final-section-extractor');
const { reconcileFinalBill } = require('./reconcile-final-bill');

async function ingestFinalBill(filePath, context) {
  const finalBill = await ingestBillPdf(filePath);
  const completedBill = createCompletedBill({ ...context, finalBill });
  return { finalBill, completedBill };
}

module.exports = { createCompletedBill, extractFinalSections, ingestFinalBill, reconcileFinalBill, resolveFinalBillMatch, saveCompletedBill };
