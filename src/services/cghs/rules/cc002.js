'use strict';

const RULE_ID = 'CC002_OXYGEN_ROW';

function classifyOxygenRow(item) {
  const text = `${item.service_name || ''} ${item.raw_source_context || ''}`.toUpperCase();
  if (!/\bOXYGEN\b/.test(text)) return null;
  const full = /FULL\s*DAY|FULLDAY|24\s*(?:HRS?|HOURS?)/.test(text);
  const half = /HALF\s*DAY|HALFDAY|12\s*(?:HRS?|HOURS?)/.test(text);
  if (full && half) return { status: 'REVIEW_REQUIRED', units: null, reason: 'AMBIGUOUS_FULL_AND_HALF_DAY' };
  if (full) return { status: 'RULE_VERIFIED', units: 24, reason: 'OXYGEN_FULL_DAY' };
  if (half) return { status: 'RULE_VERIFIED', units: 12, reason: 'OXYGEN_HALF_DAY' };
  return { status: 'RULE_VERIFIED', units: 1, reason: 'OXYGEN_UNQUALIFIED_LEGACY_SINGLE_UNIT' };
}

function evaluateCc002(items) {
  const provenance = [];
  let quantity = 0;
  let review = false;
  for (const item of items || []) {
    const classification = classifyOxygenRow(item);
    if (!classification) continue;
    const componentCodes = item.code_normalization?.components?.map((component) => component.base_code) || [];
    if (!componentCodes.some((code) => code === 'CC002' || code === 'C002')) continue;
    provenance.push({
      occurrence_id: item.id, source_page: item.source_page, source_section: item.section,
      raw_source_context: item.raw_source_context, raw_code_expression: item.raw_code_expression, ...classification
    });
    if (classification.units == null) review = true;
    else quantity += classification.units;
  }
  return {
    code: 'CC002', quantity: review ? null : quantity, rule_id: RULE_ID, source: 'RULE_DERIVED_CODE',
    quantity_status: review ? 'REVIEW_REQUIRED' : (provenance.length ? 'RULE_VERIFIED' : 'REVIEW_REQUIRED'),
    inputs: { oxygen_rows: provenance.length, calculated_quantity: quantity }, provenance,
    warnings: [...(provenance.length ? [] : ['NO_QUALIFYING_OXYGEN_EVIDENCE']), ...provenance.filter((row) => row.status === 'REVIEW_REQUIRED').map((row) => row.reason)],
    legacy_source: 'app (1).py: oxygen full day=24, half day=12, otherwise=1; requires oxygen context'
  };
}

module.exports = { RULE_ID, classifyOxygenRow, evaluateCc002 };
