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

function createReviewQueue(plan) {
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
  return records;
}

module.exports = { REVIEW_STATUSES, createReviewQueue };
