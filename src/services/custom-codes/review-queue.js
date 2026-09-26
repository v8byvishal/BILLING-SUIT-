'use strict';

const crypto = require('node:crypto');

const REVIEW_STATUSES = new Set(['UNKNOWN_CODE', 'INVALID_FORMAT', 'UNRESOLVED_COMPOUND', 'RULE_UNDEFINED', 'REVIEW_REQUIRED']);

function idFor(record) {
  return `review-${crypto.createHash('sha256').update(JSON.stringify(record)).digest('hex').slice(0, 16)}`;
}

function evidence(record) {
  const first = record.provenance?.[0] || {};
  return {
    raw_text: record.raw_source_context || first.raw_source_context || record.raw_code_expression || record.code || null,
    normalized_text: record.normalized_value || record.code || null,
    source_page: record.source_page ?? first.source_page ?? null,
    section: record.source_section || first.source_section || null,
    quantity: record.quantity ?? record.requested_quantity ?? null,
    parser_decision: record.parser_decision || first.parser_decision || null,
    rule_decision: record.rule_id || null
  };
}

function createReviewQueue(plan, discrepancies = []) {
  const records = [];
  for (const entry of plan.entries || []) {
    if (!REVIEW_STATUSES.has(entry.status) && entry.code_validation !== 'UNKNOWN' && entry.code_validation !== 'UNRESOLVED_COMPOUND') continue;
    const item = { code: entry.code || null, status: entry.status, reason: entry.warnings?.join(', ') || entry.code_validation || entry.status, ...evidence(entry) };
    records.push({ review_id: idFor(item), scope: 'BILL_SPECIFIC', current_status: 'OPEN', available_actions: ['REVIEW', ...(entry.code && !String(entry.code).includes('+') && !String(entry.code).includes('/') ? ['ADD_CUSTOM_CODE'] : []), 'DISMISS'], ...item });
  }
  for (const candidate of [...(plan.rejected_candidates || []), ...(plan.excluded_candidates || [])]) {
    if (candidate.status === 'EXCLUDED_BY_SECTION') continue;
    const item = { code: candidate.code || null, status: candidate.status, reason: candidate.reason || candidate.status, ...evidence(candidate) };
    records.push({ review_id: idFor(item), scope: 'BILL_SPECIFIC', current_status: 'OPEN', available_actions: ['REVIEW', ...(candidate.code && /^[A-Z]{1,5}\d{2,6}$/.test(candidate.code) ? ['ADD_CUSTOM_CODE'] : []), 'DISMISS'], ...item });
  }
  for (const finding of discrepancies) {
    const item = { code: finding.code || null, status: finding.type, reason: finding.reason, raw_text: finding.evidence?.raw_text || null,
      normalized_text: finding.evidence?.normalized_value || finding.code || null, source_page: finding.evidence?.page || null,
      section: finding.evidence?.section || finding.section || null, quantity: finding.actual_quantity ?? null,
      parser_decision: finding.actual_status || null, rule_decision: finding.layer || null };
    records.push({ review_id: finding.discrepancy_id || idFor(item), scope: 'VALIDATION', current_status: finding.review_status || 'NEEDS_REVIEW',
      available_actions: ['REVIEW', 'DISMISS'], validation_discrepancy: true, ...item });
  }
  return records;
}

module.exports = { REVIEW_STATUSES, createReviewQueue };
