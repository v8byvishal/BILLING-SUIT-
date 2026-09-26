'use strict';

const { loadBundledReferenceRates, loadRateSource } = require('./rate-list/loader');
const { RateRepository } = require('./rate-list/repository');
const { evaluateBill } = require('./rules/rule-engine');

function createBundledRateRepository(customEntries = [], options = {}) {
  return new RateRepository(loadBundledReferenceRates(), customEntries, options);
}

module.exports = { createBundledRateRepository, evaluateBill, loadRateSource, RateRepository };
