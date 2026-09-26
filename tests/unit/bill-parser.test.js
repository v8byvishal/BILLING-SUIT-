'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fixture = require('../fixtures/bill-text/semantic-bill.json');
const { parseBillDocument } = require('../../src/services/bill-ingestion/bill-parser');

test('normalized model preserves metadata, page traceability, sections, items, and Bed Details', () => {
  const bill = parseBillDocument(fixture);
  assert.equal(bill.metadata.page_count, 2);
  assert.equal(bill.pages[0].page_number, 1);
  assert.equal(bill.pages[1].raw_text.includes('Patient Payable'), true);
  assert.equal(bill.patient.name, 'TEST PATIENT');
  assert.equal(bill.patient.uhid, 'UH12345');
  assert.equal(bill.billing.bill_number, 'BILL-42');
  assert.equal(bill.bed_details.length, 2);
  assert.equal(bill.bed_details[0].bed_category, 'ICU');
  assert.equal(bill.bed_details[1].bed_category, 'AC Multibeds');
  assert.ok(bill.items.every((item) => item.source_page && item.raw_source_context));
});

test('Patient Payable IP Pharmacy stays auditable but is excluded and never aggregates with primary IP Pharmacy', () => {
  const bill = parseBillDocument(fixture);
  const primary = bill.items.find((item) => item.service_name === 'Primary Medicine');
  const excluded = bill.excluded_sections.flatMap((section) => section.items).find((item) => item.service_name === 'Patient Payable Medicine');
  assert.equal(primary.section, 'IP_PHARMACY');
  assert.equal(primary.semantic_context, 'PRIMARY_BILL');
  assert.equal(primary.included_in_primary_bill, true);
  assert.equal(primary.quantity, 2);
  assert.equal(excluded.section, 'IP_PHARMACY');
  assert.equal(excluded.semantic_context, 'PATIENT_PAYABLE');
  assert.equal(excluded.included_in_primary_bill, false);
  assert.equal(excluded.quantity, 5);
  assert.equal(bill.items.some((item) => item.service_name === 'Patient Payable Medicine'), false);
  assert.ok(bill.excluded_sections.some((section) => section.section_type === 'IP_PHARMACY'));
  const pharmacyAggregate = bill.aggregates.find((item) => item.section === 'IP_PHARMACY' && item.normalized_code_expression === 'B126');
  assert.equal(pharmacyAggregate.normalized_quantity, 2);
  assert.equal(pharmacyAggregate.raw_occurrence_count, 1);
  assert.equal(bill.parsing_audit.excluded_patient_payable_sections.length >= 2, true);
});

test('exact-code duplicates aggregate safely within section while retaining occurrence references', () => {
  const bill = parseBillDocument(fixture);
  const investigation = bill.aggregates.find((item) => item.section === 'INVESTIGATIONS' && item.normalized_code_expression === 'B126');
  assert.equal(investigation.normalized_quantity, 3);
  assert.equal(investigation.raw_occurrence_count, 1);
  assert.equal(investigation.occurrence_ids.length, 1);
  const compound = bill.items.find((item) => item.raw_code_expression.includes('/'));
  assert.equal(compound.code_normalization.components.length, 3);
  assert.ok(bill.parsing_audit.compound_expressions.some((entry) => entry.occurrence_id === compound.id));
});

test('same exact code in repeated rows retains raw occurrences and sums only numeric quantities', () => {
  const input = structuredClone(fixture);
  input.pages[0].lines.push('Service: Repeat Again | Code: B126 | Qty: 4 | Amount: 250.00');
  input.pages[0].raw_text += '\nService: Repeat Again | Code: B126 | Qty: 4 | Amount: 250.00';
  const bill = parseBillDocument(input);
  const group = bill.aggregates.find((item) => item.section === 'INVESTIGATIONS' && item.normalized_code_expression === 'B126');
  assert.equal(group.raw_occurrence_count, 2);
  assert.equal(group.normalized_quantity, 7);
  assert.equal(group.occurrence_ids.length, 2);
});
