'use strict';

const crypto = require('node:crypto');

const EXECUTABLE_STATUSES = new Set(['SOURCE_VERIFIED', 'RULE_VERIFIED', 'CUSTOM_VALID']);
const BLOCKED_STATUSES = new Set(['UNKNOWN_CODE', 'UNRESOLVED_COMPOUND', 'RULE_UNDEFINED', 'REVIEW_REQUIRED', 'INVALID_FORMAT']);
const PRIORITY = Object.freeze({ CC001: 1, WC001: 2, CN002: 3, CC002: 4 });

function hasPatientPayable(entry) {
  if (entry.semantic_context === 'PATIENT_PAYABLE' || entry.source_section === 'PATIENT_PAYABLE') return true;
  return (entry.provenance || []).some((source) => source.semantic_context === 'PATIENT_PAYABLE' || source.source_section === 'PATIENT_PAYABLE');
}

function blockedRecord(entry, reason, status = 'BLOCKED') {
  return {
    code: entry.code || entry.raw_code_expression || null,
    requested_quantity: entry.quantity ?? null,
    action_status: status,
    blocked: true,
    reason,
    rule_id: entry.rule_id || null,
    source: entry.source || null,
    source_evidence: entry.provenance || [],
    code_classification: entry.code_validation || entry.status || null,
    raw_code_expression: entry.raw_code_expression || null,
    verification_result: 'NOT_SENT_TO_PORTAL'
  };
}

function validateExecutable(entry) {
  if (!entry || typeof entry !== 'object') return 'MALFORMED_PLAN_ENTRY';
  if (hasPatientPayable(entry)) return 'PATIENT_PAYABLE_EXCLUDED';
  if (BLOCKED_STATUSES.has(entry.status) || BLOCKED_STATUSES.has(entry.code_validation)) return entry.status || entry.code_validation;
  if (!EXECUTABLE_STATUSES.has(entry.status)) return `STATUS_NOT_EXECUTABLE:${entry.status || 'MISSING'}`;
  if (!/^[A-Z]{1,5}\d{2,6}$/.test(String(entry.code || ''))) return 'INVALID_FORMAT';
  if (!Number.isInteger(entry.quantity) || entry.quantity <= 0) return 'INVALID_QUANTITY';
  if (entry.code_validation === 'UNKNOWN' || entry.code_validation === 'UNRESOLVED_COMPOUND') return entry.code_validation;
  return null;
}

function actionFromEntry(entry, index) {
  return {
    action_id: `action-${index + 1}`,
    code: entry.code,
    quantity: entry.quantity,
    section: entry.provenance?.[0]?.source_section || null,
    source: entry.source,
    source_evidence: entry.provenance || [],
    reason: entry.rule_id || 'DIRECT_VALIDATED_CODE',
    rule_id: entry.rule_id || null,
    code_classification: entry.code_validation,
    derived: entry.source === 'RULE_DERIVED_CODE',
    plan_status: entry.status,
    audit_metadata: {
      description: entry.description || null,
      rate_source: entry.rate_source || null,
      warnings: entry.warnings || []
    }
  };
}

function sortActions(actions) {
  return actions.sort((a, b) => (PRIORITY[a.code] || 100) - (PRIORITY[b.code] || 100) || a.code.localeCompare(b.code) || a.action_id.localeCompare(b.action_id));
}

function assertPlanRegistryCurrent(plan, currentSnapshot) {
  const context = plan?.custom_registry;
  if (!context || !currentSnapshot) return;
  const staleCodes = Object.entries(context.relevant_record_hashes || {})
    .filter(([code, plannedHash]) => (currentSnapshot.record_hashes?.[code] || null) !== plannedHash)
    .map(([code]) => code);
  if (staleCodes.length) {
    const error = new Error(`PLAN_STALE: custom code registry changed for ${staleCodes.join(', ')}`);
    error.code = 'PLAN_STALE';
    error.stale_codes = staleCodes;
    throw error;
  }
}

function adaptEnhancementPlan(plan, options = {}) {
  if (!plan || !Array.isArray(plan.entries) || !plan.plan_version) throw new Error('Valid Phase 3 EnhancementPlan required');
  assertPlanRegistryCurrent(plan, options.registrySnapshot);
  const blocked = [];
  const actions = [];
  for (const [index, entry] of plan.entries.entries()) {
    const reason = validateExecutable(entry);
    if (reason) blocked.push(blockedRecord(entry, reason, reason === 'REVIEW_REQUIRED' || reason === 'RULE_UNDEFINED' ? 'REVIEW_REQUIRED' : 'BLOCKED'));
    else actions.push(actionFromEntry(entry, index));
  }
  for (const excluded of plan.excluded_candidates || []) blocked.push(blockedRecord(excluded, 'PATIENT_PAYABLE_EXCLUDED'));
  for (const rejected of plan.rejected_candidates || []) blocked.push(blockedRecord(rejected, rejected.reason || 'REJECTED_BY_RULE'));
  return {
    contract_version: '1.0.0',
    operation: 'execute_plan_action_batch',
    run_id: options.runId || crypto.randomUUID(),
    requested_at: options.timestamp || new Date().toISOString(),
    plan_version: plan.plan_version,
    custom_registry: plan.custom_registry || null,
    bill: plan.bill || {},
    actions: sortActions(actions),
    blocked,
    source_plan_warnings: plan.warnings || []
  };
}

module.exports = { BLOCKED_STATUSES, EXECUTABLE_STATUSES, adaptEnhancementPlan, assertPlanRegistryCurrent, validateExecutable };
