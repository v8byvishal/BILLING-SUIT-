'use strict';

const { createEnhancementPlan } = require('../enhancement-plan');
const { CODE_STATUS } = require('../rate-list/repository');
const { collectRoomEvidence } = require('./room-evidence');
const { evaluateCn002 } = require('./cn002');
const { evaluateCc001 } = require('./cc001');
const { evaluateWc001 } = require('./wc001');
const { evaluateCc002 } = require('./cc002');

const ROOM_RULE_CODES = new Set(['CN002', 'CC001', 'WC001']);
const OXYGEN_CODES = new Set(['CC002', 'C002']);

function provenanceForAggregate(bill, aggregate) {
  const ids = new Set(aggregate.occurrence_ids || []);
  return (bill.items || []).filter((item) => ids.has(item.id)).map((item) => ({
    occurrence_id: item.id,
    source_page: item.source_page,
    source_section: item.section,
    raw_source_context: item.raw_source_context,
    raw_code_expression: item.raw_code_expression
  }));
}

function applyRate(entry, rateRepository) {
  const lookup = rateRepository.lookup(entry.code);
  const record = lookup.record;
  const rate = record?.rate ?? null;
  const sourceAuthoritative = rateRepository.isFinanciallyAuthoritative();
  let status = entry.quantity_status;
  const warnings = [...(entry.warnings || [])];
  if (lookup.status === CODE_STATUS.UNKNOWN) status = 'UNKNOWN_CODE';
  else if (lookup.status === CODE_STATUS.INVALID_FORMAT) status = 'REVIEW_REQUIRED';
  else if (rate == null) { status = 'REVIEW_REQUIRED'; warnings.push('RATE_MISSING'); }
  else if (!sourceAuthoritative && lookup.status === CODE_STATUS.VALID) {
    status = 'REVIEW_REQUIRED';
    warnings.push('RATE_SOURCE_UNDEFINED');
  }
  const amount = Number.isFinite(entry.quantity) && rate != null && (sourceAuthoritative || lookup.status === CODE_STATUS.CUSTOM_LOCAL)
    ? Number((entry.quantity * rate).toFixed(2))
    : null;
  return {
    ...entry,
    status,
    code_validation: lookup.status,
    description: record?.description ?? null,
    rate,
    amount,
    rate_source: lookup.status === CODE_STATUS.CUSTOM_LOCAL ? 'CUSTOM_LOCAL' : rateRepository.provenance.source_kind,
    rate_authority_status: lookup.status === CODE_STATUS.CUSTOM_LOCAL ? 'CUSTOM_LOCAL' : rateRepository.provenance.authority_status,
    warnings
  };
}

function reject(plan, aggregate, bill, reason, ruleId) {
  plan.rejected_candidates.push({
    code: aggregate.normalized_code_expression,
    source_page: aggregate.source_pages?.[0] ?? null,
    source_section: aggregate.section,
    raw_occurrence_count: aggregate.raw_occurrence_count,
    provenance: provenanceForAggregate(bill, aggregate),
    status: 'REJECTED_BY_RULE',
    reason,
    rule_id: ruleId,
    action: 'NOT_INCLUDED_IN_ENHANCEMENT_PLAN'
  });
}

function evaluateDirectCodes(bill, rateRepository, plan) {
  for (const aggregate of bill.aggregates || []) {
    const expression = aggregate.normalized_code_expression;
    if (ROOM_RULE_CODES.has(expression)) {
      reject(plan, aggregate, bill, `DERIVE_${expression}_FROM_ROOM_RENT`, `${expression}_SOURCE_POLICY`);
      continue;
    }
    if (OXYGEN_CODES.has(expression)) {
      reject(plan, aggregate, bill, /OXYGEN/i.test(provenanceForAggregate(bill, aggregate).map((x) => x.raw_source_context).join(' '))
        ? 'DERIVE_CC002_FROM_OXYGEN_CONTEXT'
        : 'CC002_REQUIRES_OXYGEN_CONTEXT', 'CC002_SOURCE_POLICY');
      continue;
    }
    const occurrence = (bill.items || []).find((item) => aggregate.occurrence_ids?.includes(item.id));
    const validation = occurrence?.code_normalization
      ? rateRepository.validateCodeNormalization(occurrence.code_normalization)
      : { status: CODE_STATUS.INVALID_FORMAT, components: [] };
    if (validation.status === CODE_STATUS.UNRESOLVED_COMPOUND) {
      const unresolved = {
        code: expression,
        raw_code_expression: occurrence.raw_code_expression,
        quantity: aggregate.normalized_quantity,
        source: 'DIRECT_BILL_CODE',
        rule_id: null,
        status: 'RULE_UNDEFINED',
        code_validation: CODE_STATUS.UNRESOLVED_COMPOUND,
        components: validation.components,
        provenance: provenanceForAggregate(bill, aggregate),
        warnings: ['COMPOUND_SEMANTICS_NOT_INFERRED']
      };
      plan.entries.push(unresolved);
      plan.unresolved_codes.push(unresolved);
      continue;
    }
    const code = occurrence?.service_code || expression;
    const entry = applyRate({
      code,
      quantity: aggregate.normalized_quantity,
      source: validation.status === CODE_STATUS.CUSTOM_LOCAL ? 'CUSTOM_CODE' : 'DIRECT_BILL_CODE',
      rule_id: null,
      quantity_status: aggregate.quantity_status === 'SUMMED' ? 'SOURCE_VERIFIED' : 'REVIEW_REQUIRED',
      provenance: provenanceForAggregate(bill, aggregate),
      warnings: aggregate.quantity_status === 'SUMMED' ? [] : [aggregate.quantity_status]
    }, rateRepository);
    plan.entries.push(entry);
    if (entry.code_validation === CODE_STATUS.UNKNOWN) plan.unknown_codes.push(entry);
  }
}

function addDerived(plan, result, rateRepository) {
  plan.rule_audit.push(result);
  if (!(result.quantity > 0) && result.quantity !== null) return;
  if (!result.provenance.length && result.quantity == null) return;
  const entry = applyRate(result, rateRepository);
  plan.entries.push(entry);
  if (entry.code_validation === CODE_STATUS.UNKNOWN) plan.unknown_codes.push(entry);
}

function addExclusions(bill, plan) {
  for (const section of bill.excluded_sections || []) {
    for (const item of section.items || []) plan.excluded_candidates.push({
      code: item.raw_code_expression,
      source_page: item.source_page,
      source_section: item.section,
      semantic_context: item.semantic_context,
      status: 'EXCLUDED_BY_SECTION',
      reason: 'PATIENT_PAYABLE_EXCLUDE_FROM_ENHANCEMENT',
      action: 'NOT_INCLUDED_IN_ENHANCEMENT_PLAN',
      provenance: [{ occurrence_id: item.id, raw_source_context: item.raw_source_context }]
    });
  }
}

function evaluateBill(bill, rateRepository) {
  if (!bill || !rateRepository) throw new Error('Normalized bill and rate repository are required');
  const plan = createEnhancementPlan(bill, rateRepository);
  addExclusions(bill, plan);
  evaluateDirectCodes(bill, rateRepository, plan);
  const roomEvidence = collectRoomEvidence(bill);
  addDerived(plan, evaluateCn002(roomEvidence), rateRepository);
  addDerived(plan, evaluateCc001(roomEvidence), rateRepository);
  addDerived(plan, evaluateWc001(roomEvidence), rateRepository);
  addDerived(plan, evaluateCc002(bill.items || []), rateRepository);
  for (const token of bill.parsing_audit?.rejected_tokens || []) plan.rejected_candidates.push({
    code: token.raw, source_page: token.page, source_section: token.section || null,
    status: 'INVALID_FORMAT', reason: token.reason, rule_id: 'PHASE2_SYNTAX_VALIDATION', action: 'REVIEW_REQUIRED'
  });
  if (!rateRepository.isFinanciallyAuthoritative()) plan.warnings.push('RATE_SOURCE_UNDEFINED');
  return plan;
}

module.exports = { applyRate, evaluateBill };
