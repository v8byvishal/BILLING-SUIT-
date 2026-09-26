'use strict';

const { parseCompoundCode } = require('./compound-code-parser');

const BASE_TOKEN = '[A-Z]{1,5}\\s*\\d{2,6}';
const EXPRESSION_TOKEN = `${BASE_TOKEN}(?:\\s*\\+\\s*[A-Z0-9]{1,8})*`;
const LABELED_EXPRESSION = new RegExp(`^\\s*(${EXPRESSION_TOKEN}(?:\\s*\\/\\s*${EXPRESSION_TOKEN})*)`, 'i');
const STANDALONE_EXPRESSION = new RegExp(`^\\s*(${EXPRESSION_TOKEN}(?:\\s*\\/\\s*${EXPRESSION_TOKEN})*)\\s*$`, 'i');
const DELIMITED_EXPRESSION = new RegExp(`(?:^|[|;])\\s*(${EXPRESSION_TOKEN}(?:\\s*\\/\\s*${EXPRESSION_TOKEN})*)\\s*(?=[|;]|$)`, 'i');

function detectCodeExpression(text) {
  const value = String(text || '');
  const labeled = value.match(/(?:tariff\s+alias|service\s+code|cghs\s+code|code)\s*[:=-]\s*([^|;]+)/i);
  let match = labeled?.[1]?.match(LABELED_EXPRESSION);
  if (!match) match = value.match(STANDALONE_EXPRESSION) || value.match(DELIMITED_EXPRESSION);
  if (!match) return null;
  return parseCompoundCode(match[1]);
}

module.exports = { detectCodeExpression };
