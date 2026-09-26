'use strict';

const PLAN_VERSION = '1.0.0';

function createEnhancementPlan(bill, rateRepository) {
  return {
    plan_version: PLAN_VERSION,
    bill: {
      source_file: bill.source?.file_name || null,
      source_sha256: bill.source?.sha256 || null,
      bill_number: bill.billing?.bill_number || null,
      uhid: bill.patient?.uhid || null
    },
    rate_source: rateRepository.provenance,
    entries: [],
    rejected_candidates: [],
    excluded_candidates: [],
    unknown_codes: [],
    unresolved_codes: [],
    warnings: [],
    rule_audit: [],
    custom_registry: null,
    execution_summary: { executable: [], blocked: [], review_required: [] }
  };
}

module.exports = { PLAN_VERSION, createEnhancementPlan };
