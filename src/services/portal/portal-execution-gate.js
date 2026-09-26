'use strict';

const { EnhancementPlanValidator, computePlanHash } = require('../cghs/plan-validator');
const { FAILURE_CODES, PREFLIGHT_STATUSES } = require('./portal-contract');
const { planPermitsPortal } = require('./portal-preflight-service');

const DEFAULT_PREFLIGHT_MAX_AGE_MS = 5 * 60 * 1000;

function reason(code, message, details = {}) { return { code, message, details }; }

class PortalExecutionGate {
  constructor(options = {}) {
    this.storageService = options.storageService;
    this.ruleSetContext = options.ruleSetContext || null;
    this.contextProvider = options.contextProvider || (() => ({}));
    this.clock = options.clock || (() => new Date());
    this.preflightMaxAgeMs = options.preflightMaxAgeMs || DEFAULT_PREFLIGHT_MAX_AGE_MS;
  }

  evaluate(input = {}) {
    const blockingReasons = [];
    const billSessionId = input.billSessionId || null;
    if (input.operatorConfirmed !== true) blockingReasons.push(reason(FAILURE_CODES.OPERATOR_CONFIRMATION_REQUIRED, 'Operator must explicitly start portal execution.'));
    if (!this.storageService) blockingReasons.push(reason('STORAGE_UNAVAILABLE', 'StorageService is required.'));
    if (!billSessionId) blockingReasons.push(reason(FAILURE_CODES.SOURCE_BILL_CHANGED, 'billSessionId is required.'));
    if (blockingReasons.length) return { allowed: false, blockingReasons, plan: null, preflight: null, validation: null };

    const loaded = this.storageService.readEnhancementPlan(billSessionId);
    if (loaded.status !== 'SUCCESS') blockingReasons.push(reason(FAILURE_CODES.PLAN_NOT_FOUND, 'Persisted EnhancementPlan was not found.', { status: loaded.status }));
    const plan = loaded.plan || null;
    if (plan) {
      if (input.planId && plan.planId !== input.planId) blockingReasons.push(reason(FAILURE_CODES.PLAN_ID_MISMATCH, 'Requested planId does not match persisted plan.', { requested: input.planId, actual: plan.planId }));
      const expectedHash = computePlanHash(plan);
      if (expectedHash !== plan.planSha256 || (input.planSha256 && input.planSha256 !== plan.planSha256)) blockingReasons.push(reason(FAILURE_CODES.PLAN_HASH_MISMATCH, 'Plan hash does not match persisted canonical content.', { requested: input.planSha256 || null, stored: plan.planSha256, expectedHash }));
      const context = this.contextProvider(billSessionId, plan) || {};
      const validation = new EnhancementPlanValidator({ ruleSetContext: this.ruleSetContext || context.ruleSetContext }).validate(plan, { ...context, billSessionId, sourceBillId: plan.sourceBillId });
      if (!validation.valid) blockingReasons.push(reason(FAILURE_CODES.INVALID_ACTION, 'Independent plan validation failed.', { issues: validation.issues }));
      if (validation.stale?.stale) blockingReasons.push(reason(FAILURE_CODES.PLAN_STALE, 'Plan was generated against stale parser/registry/rule context.', { stale: validation.stale }));
      if (!planPermitsPortal(plan)) blockingReasons.push(reason(FAILURE_CODES.PLAN_NOT_READY, 'Plan readiness does not permit portal validation.', { status: plan.status, readiness: plan.readiness }));
      if (!Array.isArray(plan.actions) || !plan.actions.length) blockingReasons.push(reason(FAILURE_CODES.PLAN_NOT_READY, 'Plan has no validated actions to execute.'));
      for (const action of plan.actions || []) {
        if (action.state !== 'VALIDATED_ACTION' || !['VALIDATED_MAPPING', 'DIRECT_REGISTRY_MATCH'].includes(action.resolution?.status)) {
          blockingReasons.push(reason(FAILURE_CODES.INVALID_ACTION, 'Plan contains an action that is not validated.', { actionId: action.actionId }));
        }
      }
      const sourceRecord = this.storageService.getSourceBillRecord(billSessionId, { verifyHash: true });
      if (sourceRecord.status !== 'SUCCESS') blockingReasons.push(reason(FAILURE_CODES.SOURCE_BILL_CHANGED, 'Source bill is missing or hash verification failed.', { status: sourceRecord.status }));
      const preflightResult = this.storageService.readPortalPreflightSnapshot(billSessionId, input.preflightId || 'latest');
      const preflight = preflightResult.status === 'SUCCESS' ? preflightResult.snapshot : null;
      if (!preflight) blockingReasons.push(reason(FAILURE_CODES.PREFLIGHT_NOT_READY, 'READY preflight snapshot was not found.', { status: preflightResult.status }));
      else {
        if (preflight.status !== PREFLIGHT_STATUSES.READY) blockingReasons.push(reason(FAILURE_CODES.PREFLIGHT_NOT_READY, 'Preflight snapshot is not READY.', { status: preflight.status, blockingReasons: preflight.blockingReasons }));
        if (preflight.planId !== plan.planId || preflight.planSha256 !== plan.planSha256) blockingReasons.push(reason(FAILURE_CODES.PORTAL_STATE_CHANGED, 'Preflight snapshot does not match current plan identity.', { preflightPlanId: preflight.planId, planId: plan.planId }));
        const age = this.clock().getTime() - new Date(preflight.timestamp).getTime();
        if (!Number.isFinite(age) || age > this.preflightMaxAgeMs) blockingReasons.push(reason(FAILURE_CODES.PREFLIGHT_EXPIRED, 'Preflight snapshot is too old and must be rerun.', { ageMs: age, maxAgeMs: this.preflightMaxAgeMs }));
      }
      return { allowed: blockingReasons.length === 0, blockingReasons, plan, preflight, validation };
    }
    return { allowed: false, blockingReasons, plan: null, preflight: null, validation: null };
  }
}

module.exports = { DEFAULT_PREFLIGHT_MAX_AGE_MS, PortalExecutionGate };
