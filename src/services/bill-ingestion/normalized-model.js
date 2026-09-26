'use strict';

const MODEL_VERSION = '1.0.0';

function emptyObject(fields) {
  return Object.fromEntries(fields.map((field) => [field, null]));
}

function createBillDocument({ source, pages }) {
  return {
    model_version: MODEL_VERSION,
    source,
    metadata: emptyObject(['document_type', 'page_count']),
    patient: emptyObject(['name', 'uhid', 'ip_number']),
    admission: emptyObject(['admission_date', 'discharge_date', 'bed_number', 'ward_name', 'speciality', 'doctor']),
    billing: emptyObject(['bill_number', 'payer', 'payer_payable', 'department_subtotal', 'department_total', 'final_total']),
    pages,
    sections: [],
    items: [],
    aggregates: [],
    bed_details: [],
    excluded_sections: [],
    parsing_audit: {
      pages_processed: pages.length,
      sections_detected: [],
      raw_items_detected: 0,
      normalized_items: 0,
      compound_expressions: [],
      excluded_patient_payable_sections: [],
      rejected_tokens: [],
      review_candidates: [],
      transformations: [],
      warnings: []
    }
  };
}

module.exports = { MODEL_VERSION, createBillDocument };
