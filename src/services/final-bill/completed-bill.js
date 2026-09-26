'use strict';

const crypto = require('node:crypto');
const { extractFinalSections } = require('./final-section-extractor');
const { reconcileFinalBill } = require('./reconcile-final-bill');

function sourceReference(bill) {
  return { file_name: bill.source?.file_name || null, sha256: bill.source?.sha256 || null, byte_size: bill.source?.byte_size || null };
}

function createCompletedBill({ initialBill, finalBill, enhancementPlan, executionAudit = null, rateRepository, runId, timestamp }) {
  if (!initialBill || !finalBill || !enhancementPlan || !rateRepository) throw new Error('Initial bill, final bill, EnhancementPlan, and rate repository are required');
  if (initialBill.source?.sha256 && finalBill.source?.sha256 && initialBill.source.sha256 === finalBill.source.sha256) {
    throw new Error('Final bill source must be distinct from the initial bill source');
  }
  const reconciliation = reconcileFinalBill(initialBill, finalBill);
  const extraction = extractFinalSections(finalBill, rateRepository);
  const reviewRequired = reconciliation.status !== 'MATCHED' || extraction.review_required_records.length > 0;
  return {
    model_version: '1.0.0', run_id: runId || crypto.randomUUID(), created_at: timestamp || new Date().toISOString(),
    status: reconciliation.status !== 'MATCHED' ? 'MATCH_REQUIRED' : reviewRequired ? 'REVIEW_REQUIRED' : 'PARSED',
    original_bill_reference: { source: sourceReference(initialBill), bill_number: initialBill.billing?.bill_number || null, uhid: initialBill.patient?.uhid || null, ip_number: initialBill.patient?.ip_number || null },
    final_bill_reference: { source: sourceReference(finalBill), bill_number: finalBill.billing?.bill_number || null, uhid: finalBill.patient?.uhid || null, ip_number: finalBill.patient?.ip_number || null },
    patient_metadata: { uhid: finalBill.patient?.uhid || initialBill.patient?.uhid || null, ip_number: finalBill.patient?.ip_number || initialBill.patient?.ip_number || null },
    admission_metadata: { admission_date: finalBill.admission?.admission_date || initialBill.admission?.admission_date || null, discharge_date: finalBill.admission?.discharge_date || null },
    enhancement_plan_reference: { plan_version: enhancementPlan.plan_version, bill: enhancementPlan.bill, custom_registry: enhancementPlan.custom_registry || null },
    enhancement_execution_reference: executionAudit ? { run_id: executionAudit.run_id || null, status: executionAudit.status || null, completed_at: executionAudit.completed_at || null } : null,
    final_extracted_sections: extraction.extracted_sections,
    excluded_sections: extraction.excluded_records,
    pharmacy_records: extraction.pharmacy_records,
    consumable_records: extraction.consumable_records,
    derived_records: [],
    review_required_records: extraction.review_required_records,
    reconciliation,
    audit: { extraction: extraction.extraction_audit, storage: null }
  };
}

function resolveFinalBillMatch(completedBill, decision) {
  if (completedBill.status !== 'MATCH_REQUIRED') throw new Error('Completed bill is not awaiting match resolution');
  if (!String(decision?.operator || '').trim() || !String(decision?.reason || '').trim()) throw new Error('Operator and reason are required for manual match resolution');
  const resolved = structuredClone(completedBill);
  resolved.reconciliation = { ...resolved.reconciliation, status: 'MATCHED', decision: 'MANUAL_EXPLICIT_MATCH', manual_resolution: {
    operator: String(decision.operator).trim(), reason: String(decision.reason).trim(), timestamp: decision.timestamp || new Date().toISOString()
  } };
  resolved.status = resolved.review_required_records.length ? 'REVIEW_REQUIRED' : 'PARSED';
  return resolved;
}

module.exports = { createCompletedBill, resolveFinalBillMatch, sourceReference };
