'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { detectCodeExpression } = require('../../src/services/bill-ingestion/code-normalizer');
const { parseCompoundCode } = require('../../src/services/bill-ingestion/compound-code-parser');

test('compound expression is preserved and split syntactically without inventing +L semantics', () => {
  const result = parseCompoundCode('B068+L / B075+L / B126');
  assert.equal(result.raw_code_expression, 'B068+L / B075+L / B126');
  assert.equal(result.normalized_expression, 'B068+L/B075+L/B126');
  assert.equal(result.is_compound, true);
  assert.deepEqual(result.components.map((part) => part.base_code), ['B068', 'B075', 'B126']);
  assert.deepEqual(result.components[0].qualifiers, ['L']);
  assert.equal(result.components[0].semantic_status, 'RULE_UNDEFINED');
  assert.equal(result.semantic_interpretation, 'NOT_INFERRED');
  assert.equal(result.normalization_status, 'SYNTACTIC_COMPOUND');
});

test('plus sign does not cause an otherwise syntactic code to be rejected', () => {
  const result = detectCodeExpression('Service: Test | CGHS Code: B068+L | Qty: 1');
  assert.ok(result);
  assert.equal(result.normalization_status, 'SYNTACTIC_COMPOUND');
  assert.equal(result.components[0].base_code, 'B068');
});
