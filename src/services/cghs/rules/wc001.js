'use strict';

const RULE_ID = 'WC001_WARD_ROOM_RENT';

function evaluateWc001(evidence) {
  const ward = evidence.filter((row) => row.classification === 'WARD');
  const ambiguous = evidence.filter((row) => row.classification === 'AMBIGUOUS');
  return {
    code: 'WC001', quantity: ambiguous.length ? null : ward.length, rule_id: RULE_ID, source: 'RULE_DERIVED_CODE',
    quantity_status: ambiguous.length ? 'REVIEW_REQUIRED' : (evidence.length ? 'RULE_VERIFIED' : 'REVIEW_REQUIRED'),
    inputs: { applicable_ward_rows: ward.length }, provenance: ward,
    warnings: [...(evidence.length ? [] : ['NO_ROOM_OR_BED_EVIDENCE']), ...ambiguous.map((row) => `${row.reason}:${row.evidence_id}`)],
    legacy_source: 'app (1).py: WC001 = count of non-ICU supported ward Room Rent rows'
  };
}

module.exports = { RULE_ID, evaluateWc001 };
