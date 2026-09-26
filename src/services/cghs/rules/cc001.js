'use strict';

const RULE_ID = 'CC001_ICU_ROOM_RENT';

function evaluateCc001(evidence) {
  const icu = evidence.filter((row) => row.classification === 'ICU');
  const ambiguous = evidence.filter((row) => row.classification === 'AMBIGUOUS');
  return {
    code: 'CC001', quantity: ambiguous.length ? null : icu.length, rule_id: RULE_ID, source: 'RULE_DERIVED_CODE',
    quantity_status: ambiguous.length ? 'REVIEW_REQUIRED' : (evidence.length ? 'RULE_VERIFIED' : 'REVIEW_REQUIRED'),
    inputs: { applicable_icu_rows: icu.length }, provenance: icu,
    warnings: [...(evidence.length ? [] : ['NO_ROOM_OR_BED_EVIDENCE']), ...ambiguous.map((row) => `${row.reason}:${row.evidence_id}`)],
    legacy_source: 'app (1).py: CC001 = count of ICU Room Rent rows'
  };
}

module.exports = { RULE_ID, evaluateCc001 };
