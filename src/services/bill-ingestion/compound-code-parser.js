'use strict';

const CODE_PART = /^[A-Z]{1,5}\d{2,6}$/;
const QUALIFIER = /^[A-Z0-9]{1,8}$/;

function parseComponent(raw) {
  const normalized = raw.toUpperCase().replace(/\s+/g, '').replace(/^[,;|]+|[,;|]+$/g, '');
  const tokens = normalized.split('+').filter(Boolean);
  const baseCode = tokens[0] && CODE_PART.test(tokens[0]) ? tokens[0] : null;
  const qualifiers = tokens.slice(1);
  const qualifiersSyntactic = qualifiers.every((value) => QUALIFIER.test(value));
  return {
    raw: raw.trim(),
    normalized,
    base_code: baseCode,
    qualifiers,
    semantic_status: qualifiers.length ? 'RULE_UNDEFINED' : 'NOT_APPLICABLE',
    syntactically_valid: Boolean(baseCode) && qualifiersSyntactic
  };
}

function parseCompoundCode(rawExpression) {
  const raw = String(rawExpression || '').trim();
  const normalizedExpression = raw.toUpperCase().replace(/\s*([/+])\s*/g, '$1').replace(/\s+/g, ' ');
  const parts = raw.split(/\s*\/\s*/).filter(Boolean).map(parseComponent);
  const compound = parts.length > 1 || parts.some((part) => part.qualifiers.length > 0);
  return {
    raw_code_expression: raw,
    normalized_expression: normalizedExpression,
    is_compound: compound,
    components: parts,
    normalization_status: parts.length && parts.every((part) => part.syntactically_valid)
      ? (compound ? 'SYNTACTIC_COMPOUND' : 'SYNTACTIC_SINGLE')
      : 'UNRESOLVED',
    semantic_interpretation: compound ? 'NOT_INFERRED' : 'NOT_REQUIRED'
  };
}

module.exports = { parseCompoundCode };
