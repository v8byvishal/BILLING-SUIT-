'use strict';

const { loadBundledReferenceRates, loadRateSource } = require('./rate-list/loader');
const { RateRepository } = require('./rate-list/repository');
const { evaluateBill } = require('./rules/rule-engine');
const registry = require('./registry');
const ruleResolution = require('./rule-resolution');
const planBuilder = require('./plan-builder');
const planValidator = require('./plan-validator');

function createBundledRateRepository(customEntries = [], options = {}) {
  return new RateRepository(loadBundledReferenceRates(), customEntries, options);
}

module.exports = { createBundledRateRepository, evaluateBill, loadRateSource, RateRepository, registry, ruleResolution, planBuilder, planValidator };
