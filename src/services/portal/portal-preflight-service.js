'use strict';

const crypto = require('node:crypto');
const { EnhancementPlanValidator, computePlanHash } = require('../cghs/plan-validator');
const { CdpHealthCheck } = require('./cdp-health-check');
const {
  AUDIT_EVENTS,
  CHECK_SEVERITIES,
  CHECK_STATUSES,
  FAILURE_CODES,
  PREFLIGHT_STATUSES
} = require('./portal-contract');

function iso(clock) { return (clock || (() => new Date()))().toISOString(); }

function check(name, status, severity, message, observed = null, errorCode = null, clock = null) {
  return { name, status, severity, message, observed, errorCode, timestamp: iso(clock) };
}

function blockingReasonFromCheck(item) {
  return item.severity === CHECK_SEVERITIES.BLOCKING && item.status === CHECK_STATUSES.FAIL
    ? { code: item.errorCode || item.name, check: item.name, message: item.message }
    : null;
}

function defaultPortalInspector() {
  return {
    async inspect({ cdp }) {
      const target = cdp?.portalTarget || null;
      const targetText = `${target?.title || ''} ${target?.url || ''}`.toLowerCase();
      const treatmentPlan = /treatment\s*plan/.test(targetText);
      const login = /login|signin|sign-in|auth/.test(targetText);
      return {
        identity: treatmentPlan
          ? { status: 'PASS', marker: 'Treatment Plan target title/url', observed: { title: target.title, url: target.url } }
          : { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_IDENTITY_UNVERIFIED, marker: 'Treatment Plan target title/url not observed', observed: target ? { title: target.title, url: target.url } : null },
        authentication: treatmentPlan && !login
          ? { status: 'PASS', marker: 'Active target is not a login route and matches Treatment Plan identity', observed: { title: target.title, url: target.url } }
          : { status: 'FAIL', errorCode: FAILURE_CODES.AUTHENTICATION_UNVERIFIED, marker: 'Authenticated state cannot be proven from the available target metadata', observed: target ? { title: target.title, url: target.url } : null },
        controls: { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_CONTROLS_UNAVAILABLE, marker: 'Procedure, speciality, quantity, reason and plus controls require trusted DOM/Selenium inspection; CDP target metadata alone is insufficient.', observed: null },
        blockingState: { status: 'PASS', marker: 'No blocking state reported by inspector', observed: null },
        billContext: { status: 'FAIL', errorCode: FAILURE_CODES.CONTEXT_UNVERIFIED, marker: 'Current bill/patient context cannot be independently verified by default inspector.', observed: null }
      };
    }
  };
}

function planPermitsPortal(plan) {
  return plan && plan.readiness === 'READY_FOR_PORTAL_VALIDATION' && ['VALIDATED', 'VALIDATED_WITH_REVIEW'].includes(plan.status);
}

class PortalPreflightService {
  constructor(options = {}) {
    this.storageService = options.storageService;
    this.ruleSetContext = options.ruleSetContext || null;
    this.contextProvider = options.contextProvider || (() => ({}));
    this.cdpHealthCheck = options.cdpHealthCheck || new CdpHealthCheck(options.cdp || {});
    this.portalInspector = options.portalInspector || defaultPortalInspector();
    this.clock = options.clock || (() => new Date());
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    this.audit = options.audit || ((record) => this.storageService?.appendAudit(record));
  }

  addCheck(checks, name, passed, message, observed = null, errorCode = null, severity = CHECK_SEVERITIES.BLOCKING) {
    const item = check(name, passed ? CHECK_STATUSES.PASS : CHECK_STATUSES.FAIL, severity, message, observed, passed ? null : errorCode, this.clock);
    checks.push(item);
    return item;
  }

  addWarn(checks, name, message, observed = null, errorCode = null) {
    const item = check(name, CHECK_STATUSES.WARN, CHECK_SEVERITIES.WARNING, message, observed, errorCode, this.clock);
    checks.push(item);
    return item;
  }

  async preflight(input = {}) {
    const billSessionId = input.billSessionId || null;
    const preflightId = input.preflightId || `preflight-${this.idFactory()}`;
    const timestamp = iso(this.clock);
    const checks = [];
    const warnings = [];
    let loadedPlan = null;
    let sourceRecord = null;
    let validation = null;
    let cdp = null;
    let portal = null;
    this.audit?.({ runId: preflightId, billSessionId, operation: AUDIT_EVENTS.PORTAL_PREFLIGHT_STARTED, stage: 'PORTAL_PREFLIGHT', status: 'STARTED', sourceRef: { planId: input.planId || null, planSha256: input.planSha256 || null } });

    if (!this.storageService) {
      this.addCheck(checks, 'STORAGE', false, 'StorageService is required for authoritative plan preflight.', null, 'STORAGE_UNAVAILABLE');
      return this.finish({ preflightId, billSessionId, timestamp, checks, warnings, loadedPlan, sourceRecord, validation, cdp, portal, input });
    }

    const planResult = billSessionId ? this.storageService.readEnhancementPlan(billSessionId) : { status: 'NOT_FOUND' };
    if (planResult.status !== 'SUCCESS') {
      this.addCheck(checks, 'PLAN_EXISTS', false, 'Persisted EnhancementPlan was not found.', { billSessionId, status: planResult.status }, FAILURE_CODES.PLAN_NOT_FOUND);
      return this.finish({ preflightId, billSessionId, timestamp, checks, warnings, loadedPlan, sourceRecord, validation, cdp, portal, input });
    }
    loadedPlan = planResult.plan;
    this.addCheck(checks, 'PLAN_EXISTS', true, 'Persisted EnhancementPlan loaded from Storage.', { planId: loadedPlan.planId });
    this.addCheck(checks, 'PLAN_ID', !input.planId || loadedPlan.planId === input.planId, 'Plan id matches requested execution plan.', { requested: input.planId || null, actual: loadedPlan.planId }, FAILURE_CODES.PLAN_ID_MISMATCH);

    const expectedHash = computePlanHash(loadedPlan);
    const hashOk = loadedPlan.planSha256 === expectedHash && (!input.planSha256 || input.planSha256 === loadedPlan.planSha256);
    this.addCheck(checks, 'PLAN_HASH', hashOk, 'Plan hash matches canonical persisted content.', { requested: input.planSha256 || null, stored: loadedPlan.planSha256, calculated: expectedHash }, FAILURE_CODES.PLAN_HASH_MISMATCH);

    const context = this.contextProvider(billSessionId, loadedPlan) || {};
    validation = new EnhancementPlanValidator({ ruleSetContext: this.ruleSetContext || context.ruleSetContext }).validate(loadedPlan, {
      ...context,
      billSessionId,
      sourceBillId: loadedPlan.sourceBillId
    });
    this.addCheck(checks, 'PLAN_VALIDATION', validation.valid, 'Independent EnhancementPlan validation must pass.', { status: validation.status, issueCount: validation.issues.length }, validation.issues.find((issue) => issue.severity === 'FAIL')?.code || FAILURE_CODES.INVALID_ACTION);
    this.addCheck(checks, 'PLAN_NOT_STALE', !validation.stale?.stale, 'Plan parser/registry/rule context is current.', validation.stale || null, FAILURE_CODES.PLAN_STALE);
    this.addCheck(checks, 'PLAN_READY', planPermitsPortal(loadedPlan), 'Plan readiness permits portal validation.', { status: loadedPlan.status, readiness: loadedPlan.readiness }, FAILURE_CODES.PLAN_NOT_READY);
    this.addCheck(checks, 'BILL_SESSION', loadedPlan.billSessionId === billSessionId && !!billSessionId, 'Plan billSessionId matches requested bill session.', { planBillSessionId: loadedPlan.billSessionId, billSessionId }, FAILURE_CODES.SOURCE_BILL_CHANGED);

    sourceRecord = this.storageService.getSourceBillRecord(billSessionId, { verifyHash: true });
    this.addCheck(checks, 'SOURCE_BILL', sourceRecord.status === 'SUCCESS', 'Source bill exists and hash is unchanged.', { status: sourceRecord.status, sha256: sourceRecord.metadata?.sha256 || null }, FAILURE_CODES.SOURCE_BILL_CHANGED);

    const actions = Array.isArray(loadedPlan.actions) ? loadedPlan.actions : [];
    this.addCheck(checks, 'EXECUTABLE_ACTIONS', actions.length > 0, 'Executable action list is non-empty.', { actionCount: actions.length }, FAILURE_CODES.PLAN_NOT_READY);
    const allValidated = actions.every((action) => action.state === 'VALIDATED_ACTION' && ['VALIDATED_MAPPING', 'DIRECT_REGISTRY_MATCH'].includes(action.resolution?.status));
    this.addCheck(checks, 'ACTIONS_VALIDATED', allValidated, 'All portal candidate actions are validated plan actions.', { actionCount: actions.length }, FAILURE_CODES.INVALID_ACTION);
    this.addCheck(checks, 'REGISTRY_RULE_CONTEXT', !!(loadedPlan.registryContext?.registryVersion && loadedPlan.registryContext?.registrySourceHash && loadedPlan.ruleContext?.ruleSetVersion), 'Registry and rule context are present.', { registryVersion: loadedPlan.registryContext?.registryVersion || null, ruleSetVersion: loadedPlan.ruleContext?.ruleSetVersion || null }, FAILURE_CODES.PLAN_NOT_READY);
    if (loadedPlan.registryContext?.authorityStatus && loadedPlan.registryContext.authorityStatus !== 'AUTHORITATIVE') {
      const warning = this.addWarn(checks, 'REGISTRY_AUTHORITY_PARTIAL', 'Registry authority is not official AUTHORITATIVE; only validated rule/direct-action gates may execute.', { authorityStatus: loadedPlan.registryContext.authorityStatus });
      warnings.push(warning.message);
    }

    cdp = await this.cdpHealthCheck.check();
    this.addCheck(checks, 'CDP_ENDPOINT', cdp.status === 'PASS', cdp.message, { endpoint: cdp.endpoint, targetCount: cdp.targets?.length || 0 }, cdp.errorCode || FAILURE_CODES.CDP_UNAVAILABLE);
    this.addCheck(checks, 'CDP_TARGET', !!cdp.portalTarget, 'Expected browser page target is discoverable from CDP.', cdp.portalTarget || null, FAILURE_CODES.CDP_TARGET_NOT_FOUND);

    if (cdp.status === 'PASS' && cdp.portalTarget) {
      if (typeof this.portalInspector.inspect === 'function') portal = await this.portalInspector.inspect({ cdp, plan: loadedPlan, sourceRecord, billSessionId });
      else if (typeof this.portalInspector.inspectPortalState === 'function') portal = await this.portalInspector.inspectPortalState({ cdp, plan: loadedPlan, sourceRecord, billSessionId });
      else portal = await defaultPortalInspector().inspect({ cdp, plan: loadedPlan, sourceRecord, billSessionId });
    } else {
      portal = { identity: { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_IDENTITY_UNVERIFIED }, authentication: { status: 'FAIL', errorCode: FAILURE_CODES.AUTHENTICATION_UNVERIFIED }, controls: { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_CONTROLS_UNAVAILABLE }, blockingState: { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_BLOCKING_STATE }, billContext: { status: 'FAIL', errorCode: FAILURE_CODES.CONTEXT_UNVERIFIED } };
    }

    this.addCheck(checks, 'PORTAL_IDENTITY', portal.identity?.status === 'PASS', portal.identity?.marker || 'Portal identity could not be independently verified.', portal.identity?.observed || null, portal.identity?.errorCode || FAILURE_CODES.PORTAL_IDENTITY_UNVERIFIED);
    this.addCheck(checks, 'AUTHENTICATION', portal.authentication?.status === 'PASS', portal.authentication?.marker || 'Authenticated portal state could not be independently verified.', portal.authentication?.observed || null, portal.authentication?.errorCode || FAILURE_CODES.AUTHENTICATION_UNVERIFIED);
    this.addCheck(checks, 'PORTAL_CONTROLS', portal.controls?.status === 'PASS', portal.controls?.marker || 'Required portal controls could not be independently verified.', portal.controls?.observed || null, portal.controls?.errorCode || FAILURE_CODES.PORTAL_CONTROLS_UNAVAILABLE);
    this.addCheck(checks, 'PORTAL_BLOCKING_STATE', portal.blockingState?.status === 'PASS', portal.blockingState?.marker || 'Known portal blocking state is active or unknown.', portal.blockingState?.observed || null, portal.blockingState?.errorCode || FAILURE_CODES.PORTAL_BLOCKING_STATE);
    this.addCheck(checks, 'PORTAL_BILL_CONTEXT', portal.billContext?.status === 'PASS', portal.billContext?.marker || 'Current portal bill/patient context could not be independently verified.', portal.billContext?.observed || null, portal.billContext?.errorCode || FAILURE_CODES.CONTEXT_UNVERIFIED);

    return this.finish({ preflightId, billSessionId, timestamp, checks, warnings, loadedPlan, sourceRecord, validation, cdp, portal, input });
  }

  finish({ preflightId, billSessionId, timestamp, checks, warnings, loadedPlan, sourceRecord, validation, cdp, portal, input }) {
    const blockingReasons = checks.map(blockingReasonFromCheck).filter(Boolean);
    let status = PREFLIGHT_STATUSES.READY;
    if (blockingReasons.length) status = blockingReasons.some((item) => [FAILURE_CODES.CDP_UNAVAILABLE, FAILURE_CODES.CDP_TARGET_NOT_FOUND].includes(item.code)) ? PREFLIGHT_STATUSES.UNAVAILABLE : PREFLIGHT_STATUSES.BLOCKED;
    if (!checks.length) status = PREFLIGHT_STATUSES.NOT_CHECKED;
    const snapshot = {
      preflightId,
      billSessionId,
      planId: loadedPlan?.planId || input.planId || null,
      planSha256: loadedPlan?.planSha256 || input.planSha256 || null,
      timestamp,
      status,
      checks,
      blockingReasons,
      warnings,
      diagnostics: {
        validation: validation ? { status: validation.status, issueCount: validation.issues.length, stale: validation.stale } : null,
        sourceBill: sourceRecord ? { status: sourceRecord.status, sourceBillId: sourceRecord.metadata?.sourceBillId || null, sha256: sourceRecord.metadata?.sha256 || null } : null,
        actionCount: loadedPlan?.actions?.length || 0,
        reviewCount: loadedPlan?.reviewItems?.length || 0
      },
      cdp: cdp ? { status: cdp.status, endpoint: cdp.endpoint, portalTarget: cdp.portalTarget || null, targetCount: cdp.targets?.length || 0, errorCode: cdp.errorCode || null } : null,
      portal: portal || null,
      authentication: portal?.authentication || null,
      controls: portal?.controls || null
    };
    if (this.storageService && billSessionId) this.storageService.writePortalPreflightSnapshot(billSessionId, snapshot);
    this.audit?.({ runId: preflightId, billSessionId, operation: status === PREFLIGHT_STATUSES.READY ? AUDIT_EVENTS.PORTAL_PREFLIGHT_COMPLETED : AUDIT_EVENTS.PORTAL_PREFLIGHT_BLOCKED, stage: 'PORTAL_PREFLIGHT', status, sourceRef: { preflightId, planId: snapshot.planId, planSha256: snapshot.planSha256, blockingReasons } });
    return snapshot;
  }
}

module.exports = { PortalPreflightService, check, defaultPortalInspector, planPermitsPortal };
