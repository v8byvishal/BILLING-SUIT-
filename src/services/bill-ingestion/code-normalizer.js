'use strict';

const { parseCompoundCode } = require('./compound-code-parser');

const EXPRESSION_TOKEN = '[A-Z]{1,5}\\d{2,6}(?:\\s*\\+\\s*[A-Z0-9]{1,8})?';
const EXPRESSION = new RegExp(`(${EXPRESSION_TOKEN}(?:\\s*\\/\\s*${EXPRESSION_TOKEN})*)`, 'i');

function detectCodeExpression(text) {
  const value = String(text || '');
  const labeled = value.match(/(?:tariff\s+alias|service\s+code|cghs\s+code|code)\s*[:=-]\s*([^|;]+)/i);
  const searchWithin = labeled ? labeled[1] : value;
  const match = searchWithin.match(EXPRESSION);
  if (!match) return null;
  return parseCompoundCode(match[1]);
}

module.exports = { detectCodeExpression };
