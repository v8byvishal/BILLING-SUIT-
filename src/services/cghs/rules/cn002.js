'use strict';

const RULE_ID = 'CN002_ROOM_BED';

function evaluateCn002(evidence) {
  const icu = evidence.filter((row) => row.classification === 'ICU');
  const ward = evidence.filter((row) => row.classification === 'WARD');
  const ambiguous = evidence.filter((row) => row.classification === 'AMBIGUOUS');
  const calculated = (icu.length * 3) + (ward.length * 2);
  return {
    code: 'CN002',
    quantity: ambiguous.length ? null : calculated,
    rule_id: RULE_ID,
    source: 'RULE_DERIVED_CODE',
    quantity_status: ambiguous.length ? 'REVIEW_REQUIRED' : (evidence.length ? 'RULE_VERIFIED' : 'REVIEW_REQUIRED'),
    inputs: { icu_rows: icu.length, ward_rows: ward.length, icu_units_per_row: 3, ward_units_per_row: 2, calculated_quantity: calculated },
    provenance: evidence,
    warnings: [
      ...(evidence.length ? [] : ['NO_ROOM_OR_BED_EVIDENCE']),
      ...ambiguous.map((row) => `${row.reason}:${row.evidence_id}`)
    ],
    legacy_source: 'app (1).py: CN002 = ICU row count * 3 + ward row count * 2'
  };
}

module.exports = { RULE_ID, evaluateCn002 };
