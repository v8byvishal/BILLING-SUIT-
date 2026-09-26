'use strict';

const { loadBundledReferenceRates, loadRateSource } = require('./rate-list/loader');
const { RateRepository } = require('./rate-list/repository');
const { evaluateBill } = require('./rules/rule-engine');

function createBundledRateRepository(customEntries = []) {
  return new RateRepository(loadBundledReferenceRates(), customEntries);
}

module.exports = { createBundledRateRepository, evaluateBill, loadRateSource, RateRepository };
