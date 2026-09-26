'use strict';

function aggregateItems(items) {
  const groups = new Map();
  for (const item of items.filter((value) => value.included_in_primary_bill)) {
    if (item.normalization_status === 'UNRESOLVED') continue;
    const key = JSON.stringify([item.section, item.code_normalization.normalized_expression]);
    if (!groups.has(key)) groups.set(key, {
      section: item.section,
      code: item.service_code,
      normalized_code_expression: item.code_normalization.normalized_expression,
      raw_occurrence_count: 0,
      normalized_quantity: 0,
      quantity_status: 'SUMMED',
      occurrence_ids: [],
      source_pages: [],
      normalization_information: []
    });
    const group = groups.get(key);
    group.raw_occurrence_count += 1;
    group.occurrence_ids.push(item.id);
    if (!group.source_pages.includes(item.source_page)) group.source_pages.push(item.source_page);
    group.normalization_information.push({ occurrence_id: item.id, raw: item.raw_code_expression, status: item.normalization_status });
    if (item.quantity == null) group.quantity_status = 'INCOMPLETE_SOURCE_QUANTITY';
    else group.normalized_quantity += item.quantity;
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    normalized_quantity: group.quantity_status === 'SUMMED' ? group.normalized_quantity : null
  }));
}

module.exports = { aggregateItems };
