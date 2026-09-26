'use strict';

function matchField(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function parseNumber(value) {
  if (value == null) return null;
  const number = Number(String(value).replace(/[₹,\s]/g, ''));
  return Number.isFinite(number) ? number : null;
}

function parseDocumentFields(pages) {
  const text = pages.map((page) => page.raw_text).join('\n');
  return {
    patient: {
      name: matchField(text, [/(?:patient\s+name|name)\s*:\s*([^\n|]+)/i]),
      uhid: matchField(text, [/\bUHID\s*[:#-]?\s*([A-Z0-9\/-]+)/i]),
      ip_number: matchField(text, [/(?:IP\s*(?:No|Number)|IPD\s*(?:No|Number))\s*[:#-]?\s*([A-Z0-9\/-]+)/i])
    },
    admission: {
      admission_date: matchField(text, [/(?:admission|admit|DOA)\s*(?:date)?\s*[:#-]?\s*([^\n|]+)/i]),
      discharge_date: matchField(text, [/(?:discharge|DOD)\s*(?:date)?\s*[:#-]?\s*([^\n|]+)/i]),
      bed_number: matchField(text, [/bed\s*(?:no|number)\s*[:#-]?\s*([^\n|]+)/i]),
      ward_name: matchField(text, [/ward\s*(?:name)?\s*[:#-]?\s*([^\n|]+)/i]),
      speciality: matchField(text, [/specialit(?:y|ies)\s*[:#-]?\s*([^\n|]+)/i]),
      doctor: matchField(text, [/(?:doctor|consultant)\s*[:#-]?\s*([^\n|]+)/i])
    },
    billing: {
      bill_number: matchField(text, [/bill\s*(?:no|number)\s*[:#-]?\s*([A-Z0-9\/-]+)/i]),
      payer: matchField(text, [/payer\s*(?:name)?\s*[:#-]?\s*([^\n|]+)/i]),
      payer_payable: parseNumber(matchField(text, [/payer\s+payable\s*[:#-]?\s*([₹\d,.]+)/i])),
      department_subtotal: null,
      department_total: null,
      final_total: parseNumber(matchField(text, [/(?:grand|final|net)\s+total\s*[:#-]?\s*([₹\d,.]+)/i]))
    }
  };
}

function parseItemLine(entry, section) {
  const { detectCodeExpression } = require('./code-normalizer');
  const code = detectCodeExpression(entry.text);
  if (!code) return null;
  const quantity = parseNumber(matchField(entry.text, [/(?:qty|quantity)\s*[:=]\s*([\d,.]+)/i]));
  const duration = matchField(entry.text, [/duration\s*[:=]\s*([^|;]+)/i]);
  const amount = parseNumber(matchField(entry.text, [/(?:amount|total)\s*[:=]\s*([₹\d,.]+)/i]));
  const serviceName = matchField(entry.text, [/(?:service\s+name|service)\s*[:=]\s*([^|;]+)/i])
    || entry.text.split(/\b(?:CGHS|Code\s*:)/i)[0].trim()
    || null;
  const reference = matchField(entry.text, [/(?:reference|order)\s*(?:no|number)?\s*[:=]\s*([^|;]+)/i]);
  return {
    id: null,
    section_id: section.id,
    section: section.section_type,
    semantic_context: section.context,
    included_in_primary_bill: section.included_in_primary_bill,
    source_page: entry.page_number,
    source_line: entry.line_number,
    service_name: serviceName,
    service_code: code.components.length === 1 ? code.components[0].base_code : null,
    tariff_alias_code: null,
    raw_code_expression: code.raw_code_expression,
    code_normalization: code,
    quantity,
    duration,
    amount,
    start_date: null,
    end_date: null,
    reference_number: reference,
    payer_information: null,
    raw_source_context: entry.text,
    normalization_status: code.normalization_status
  };
}

module.exports = { matchField, parseDocumentFields, parseItemLine, parseNumber };
