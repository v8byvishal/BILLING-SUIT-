'use strict';

const crypto = require('node:crypto');
const { ACTION_STATES, AUDIT_EVENTS, CODE_PATTERN, FAILURE_CODES, RUN_STATES, TERMINAL_ACTION_STATES } = require('./portal-contract');
const { PortalExecutionGate } = require('./portal-execution-gate');

const PROTECTED_RAW_ALIAS_CODES = new Set(['C002', 'C003', 'C008', 'C010', 'C011', 'C012', 'C014', 'N002', 'P001', 'T004', 'T005']);
const DEFAULT_MAX_RETRIES = 1;

function iso(clock) { return (clock || (() => new Date()))().toISOString(); }
function durationMs(started) { return Math.max(0, Date.now() - started); }

function createSummary(actions) {
  const summary = { total: actions.length, success: 0, duplicate: 0, failed: 0, cancelled: 0, skipped: 0 };
  for (const action of actions) {
    if (action.state === ACTION_STATES.SUCCESS) summary.success += 1;
    else if (action.state === ACTION_STATES.DUPLICATE) summary.duplicate += 1;
    else if (action.state === ACTION_STATES.CANCELLED) summary.cancelled += 1;
    else if ([ACTION_STATES.SKIPPED, ACTION_STATES.PREFLIGHT_BLOCKED].includes(action.state)) summary.skipped += 1;
    else if (TERMINAL_ACTION_STATES.has(action.state)) summary.failed += 1;
  }
  return summary;
}

function statusFromSummary(summary) {
  if (summary.cancelled && summary.success + summary.duplicate + summary.failed + summary.skipped === 0) return RUN_STATES.CANCELLED;
  if (summary.failed || summary.cancelled || summary.skipped) return RUN_STATES.COMPLETED_WITH_FAILURES;
  if (summary.total && summary.success + summary.duplicate === summary.total) return RUN_STATES.COMPLETED;
  return RUN_STATES.FAILED;
}

function actionFromPlanAction(planAction, index, plan) {
  const code = String(planAction.finalCode || planAction.resolved?.finalCode || '').trim().toUpperCase();
  const quantity = Number(planAction.quantity?.value ?? planAction.resolved?.quantity);
  return {
    executionActionId: `exec-action-${String(index + 1).padStart(4, '0')}`,
    actionId: planAction.actionId,
    executionOrder: index + 1,
    code,
    quantity,
    description: planAction.description || planAction.input?.description || null,
    sourceCandidateIds: planAction.aggregation?.sourceCandidateIds || planAction.provenance?.sourceCandidateIds || [],
    planId: plan.planId,
    planSha256: plan.planSha256,
    billSessionId: plan.billSessionId,
    ruleId: planAction.resolution?.ruleId || null,
    registryEntryId: planAction.resolution?.registryEntryId || null,
    state: ACTION_STATES.PENDING,
    startedAt: null,
    completedAt: null,
    durationMs: 0,
    existingQuantity: null,
    observedCode: null,
    observedQuantity: null,
    verificationStatus: 'NOT_VERIFIED',
    errorCode: null,
    error: null,
    diagnosticReference: null,
    retryCount: 0
  };
}

function validateExecutionAction(action) {
  if (!action.actionId || !action.executionActionId) return { ok: false, code: FAILURE_CODES.INVALID_ACTION, message: 'Action identity is missing.' };
  if (!CODE_PATTERN.test(action.code)) return { ok: false, code: FAILURE_CODES.INVALID_ACTION, message: 'Final action code format is invalid.' };
  if (PROTECTED_RAW_ALIAS_CODES.has(action.code) && !action.ruleId) return { ok: false, code: FAILURE_CODES.INVALID_ACTION, message: 'Protected raw alias cannot execute without a validated rule.' };
  if (!Number.isFinite(action.quantity) || action.quantity <= 0 || !Number.isInteger(action.quantity)) return { ok: false, code: FAILURE_CODES.INVALID_ACTION, message: 'Portal execution requires a positive integer quantity.' };
  return { ok: true };
}

class PortalExecutionService {
  constructor(options = {}) {
    this.storageService = options.storageService;
    this.preflightService = options.preflightService;
    this.gate = options.gate || new PortalExecutionGate(options);
    this.adapter = options.adapter;
    this.clock = options.clock || (() => new Date());
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.audit = options.audit || ((record) => this.storageService?.appendAudit(record));
    this.activeRuns = new Map();
    this.cancelRequests = new Set();
  }

  getExecution(billSessionId, runId) {
    if (!billSessionId || !runId || !this.storageService) return null;
    const loaded = this.storageService.readPortalExecutionRun(billSessionId, runId);
    return loaded.status === 'SUCCESS' ? loaded.run : null;
  }

  getExecutionSummary(billSessionId, runId) {
    const run = this.getExecution(billSessionId, runId);
    return run ? { runId: run.runId, planId: run.planId, billSessionId: run.billSessionId, preflightId: run.preflightId, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt, summary: run.summary } : null;
  }

  cancelExecution(billSessionId, runId) {
    if (!runId) return { status: 'NOT_FOUND', cancelled: false };
    this.cancelRequests.add(runId);
    const run = this.getExecution(billSessionId, runId);
    if (run && ![RUN_STATES.COMPLETED, RUN_STATES.COMPLETED_WITH_FAILURES, RUN_STATES.FAILED, RUN_STATES.CANCELLED].includes(run.status)) {
      const next = { ...run, status: RUN_STATES.CANCELLING, diagnostics: [...(run.diagnostics || []), { code: FAILURE_CODES.EXECUTION_CANCELLED, message: 'Operator requested cancellation.' }] };
      this.persistRun(next);
    }
    this.audit?.({ runId, billSessionId, operation: AUDIT_EVENTS.PORTAL_EXECUTION_CANCELLED, stage: 'PORTAL_EXECUTION', status: 'CANCELLING', sourceRef: { runId } });
    return { status: 'CANCELLING', cancelled: true, runId };
  }

  persistRun(run) {
    if (!this.storageService || !run?.billSessionId || !run?.runId) return null;
    run.summary = createSummary(run.actions || []);
    return this.storageService.writePortalExecutionRun(run.billSessionId, run, this.getExecutionSummaryFromRun(run));
  }

  getExecutionSummaryFromRun(run) {
    return { runId: run.runId, planId: run.planId, billSessionId: run.billSessionId, preflightId: run.preflightId, status: run.status, startedAt: run.startedAt, completedAt: run.completedAt, summary: run.summary || createSummary(run.actions || []) };
  }

  async startExecution(input = {}) {
    const billSessionId = input.billSessionId;
    if (!billSessionId) throw Object.assign(new Error('billSessionId is required'), { code: FAILURE_CODES.SOURCE_BILL_CHANGED });
    if (this.activeRuns.has(billSessionId)) throw Object.assign(new Error('A portal execution run is already active for this bill session'), { code: FAILURE_CODES.EXECUTION_ALREADY_RUNNING });
    const runId = input.runId || `portal-run-${this.idFactory()}`;
    this.activeRuns.set(billSessionId, runId);
    try {
      if (!this.preflightService) throw Object.assign(new Error('PortalPreflightService is required'), { code: FAILURE_CODES.PREFLIGHT_NOT_READY });
      const finalPreflight = await this.preflightService.preflight({ billSessionId, planId: input.planId, planSha256: input.planSha256 });
      const gateResult = this.gate.evaluate({ billSessionId, planId: input.planId, planSha256: input.planSha256, preflightId: finalPreflight.preflightId, operatorConfirmed: input.operatorConfirmed === true });
      if (!gateResult.allowed) {
        const blockedRun = this.blockedRun({ runId, billSessionId, planId: input.planId || finalPreflight.planId, planSha256: input.planSha256 || finalPreflight.planSha256, preflightId: finalPreflight.preflightId, blockingReasons: gateResult.blockingReasons });
        this.persistRun(blockedRun);
        return blockedRun;
      }
      const plan = gateResult.plan;
      const actions = (plan.actions || []).map((action, index) => actionFromPlanAction(action, index, plan));
      const run = {
        schemaVersion: 1,
        runId,
        planId: plan.planId,
        planSha256: plan.planSha256,
        billSessionId,
        preflightId: finalPreflight.preflightId,
        status: RUN_STATES.RUNNING,
        startedAt: iso(this.clock),
        completedAt: null,
        actions,
        summary: createSummary(actions),
        diagnostics: [],
        operatorConfirmed: input.operatorConfirmed === true
      };
      this.persistRun(run);
      this.audit?.({ runId, billSessionId, operation: AUDIT_EVENTS.PORTAL_EXECUTION_STARTED, stage: 'PORTAL_EXECUTION', status: RUN_STATES.RUNNING, sourceRef: { planId: plan.planId, actionCount: actions.length, preflightId: finalPreflight.preflightId } });
      for (const action of run.actions) {
        if (this.cancelRequests.has(runId)) {
          this.cancelRemaining(run, action.executionOrder);
          break;
        }
        await this.executeOne(run, action);
        this.persistRun(run);
      }
      if (this.cancelRequests.has(runId)) run.status = RUN_STATES.CANCELLED;
      else run.status = statusFromSummary(createSummary(run.actions));
      run.completedAt = iso(this.clock);
      run.summary = createSummary(run.actions);
      this.persistRun(run);
      this.audit?.({ runId, billSessionId, operation: run.status === RUN_STATES.COMPLETED ? AUDIT_EVENTS.PORTAL_EXECUTION_COMPLETED : AUDIT_EVENTS.PORTAL_EXECUTION_COMPLETED_WITH_FAILURES, stage: 'PORTAL_EXECUTION', status: run.status, sourceRef: { summary: run.summary } });
      return run;
    } finally {
      this.activeRuns.delete(billSessionId);
      this.cancelRequests.delete(runId);
    }
  }

  blockedRun({ runId, billSessionId, planId, planSha256, preflightId, blockingReasons }) {
    this.audit?.({ runId, billSessionId, operation: AUDIT_EVENTS.PORTAL_EXECUTION_COMPLETED_WITH_FAILURES, stage: 'PORTAL_EXECUTION', status: RUN_STATES.BLOCKED, errorCode: blockingReasons[0]?.code || FAILURE_CODES.PREFLIGHT_NOT_READY, sourceRef: { planId, preflightId, blockingReasons } });
    return { schemaVersion: 1, runId, planId: planId || null, planSha256: planSha256 || null, billSessionId, preflightId: preflightId || null, status: RUN_STATES.BLOCKED, startedAt: iso(this.clock), completedAt: iso(this.clock), actions: [], summary: createSummary([]), diagnostics: blockingReasons };
  }

  cancelRemaining(run, fromOrder) {
    for (const action of run.actions) {
      if (!TERMINAL_ACTION_STATES.has(action.state) && action.executionOrder >= fromOrder) {
        action.state = ACTION_STATES.CANCELLED;
        action.errorCode = FAILURE_CODES.EXECUTION_CANCELLED;
        action.verificationStatus = 'NOT_VERIFIED';
        action.completedAt = iso(this.clock);
      }
    }
  }

  async executeOne(run, action) {
    const started = Date.now();
    action.startedAt = iso(this.clock);
    this.audit?.({ runId: run.runId, billSessionId: run.billSessionId, operation: AUDIT_EVENTS.PORTAL_ACTION_STARTED, stage: 'PORTAL_EXECUTION', status: ACTION_STATES.PENDING, sourceRef: { executionActionId: action.executionActionId, actionId: action.actionId, code: action.code, quantity: action.quantity } });
    const valid = validateExecutionAction(action);
    if (!valid.ok) return this.finishAction(run, action, ACTION_STATES.FAILED, valid.code, valid.message, started);

    if (this.adapter && typeof this.adapter.executeAction === 'function' && typeof this.adapter.inspectExisting !== 'function') {
      action.state = ACTION_STATES.APPLYING;
      const result = await this.adapter.executeAction(action, { runId: run.runId, startedAt: run.startedAt, planVersion: '5.0.0' });
      const state = result.terminal === 'SUCCESS' ? ACTION_STATES.SUCCESS : (result.terminal === 'DUPLICATE' ? ACTION_STATES.DUPLICATE : ACTION_STATES.FAILED);
      return this.finishAction(run, action, state, result.errorCode || null, result.error || null, started, result);
    }

    action.state = ACTION_STATES.SEARCHING;
    const match = await this.safeAdapterCall('searchExact', action, null);
    if (!match || match.status === 'NOT_FOUND') return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.CODE_NOT_FOUND, match?.message || 'Exact portal code match was not found.', started, match || {});
    if (match.status === 'AMBIGUOUS') return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.AMBIGUOUS_MATCH, match.message || 'Multiple exact portal matches were found.', started, match);
    action.state = ACTION_STATES.MATCHED;
    this.audit?.({ runId: run.runId, billSessionId: run.billSessionId, operation: AUDIT_EVENTS.PORTAL_ACTION_MATCHED, stage: 'PORTAL_EXECUTION', status: ACTION_STATES.MATCHED, sourceRef: { executionActionId: action.executionActionId, code: action.code, option: match.option || null } });

    action.state = ACTION_STATES.QUANTITY_CHECK;
    const existing = await this.safeAdapterCall('inspectExisting', action, { existingQuantity: 0, exactMatches: 0, locked: false });
    action.existingQuantity = existing.existingQuantity ?? 0;
    if (existing.ambiguous) return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.AMBIGUOUS_MATCH, existing.message || 'Existing portal row match is ambiguous.', started, existing);
    if (existing.locked && Number(existing.existingQuantity || 0) < action.quantity) return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.QUANTITY_LOCKED, 'Portal quantity is locked and cannot reach desired quantity.', started, existing);
    if (Number(existing.existingQuantity || 0) === action.quantity) return this.finishAction(run, action, ACTION_STATES.DUPLICATE, FAILURE_CODES.DUPLICATE_ACTION, null, started, { ...existing, verificationStatus: 'ALREADY_SATISFIED' });
    if (Number(existing.existingQuantity || 0) > action.quantity) return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.REDUCTION_UNSUPPORTED, 'Portal has more quantity than desired; automatic reduction is not supported.', started, existing);

    const delta = action.quantity - Number(existing.existingQuantity || 0);
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        action.retryCount += 1;
        action.state = ACTION_STATES.RETRYING;
        this.audit?.({ runId: run.runId, billSessionId: run.billSessionId, operation: AUDIT_EVENTS.PORTAL_ACTION_RETRY, stage: 'PORTAL_EXECUTION', status: ACTION_STATES.RETRYING, sourceRef: { executionActionId: action.executionActionId, attempt } });
        const reread = await this.safeAdapterCall('inspectExisting', action, { existingQuantity: 0 });
        action.observedQuantity = reread.existingQuantity ?? action.observedQuantity;
        if (Number(reread.existingQuantity || 0) === action.quantity) return this.finishAction(run, action, ACTION_STATES.SUCCESS, null, null, started, { ...reread, verificationStatus: 'RECONCILED_AFTER_RETRY' });
        if (reread.ambiguous) return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.AMBIGUOUS_MATCH, 'Portal state became ambiguous before retry.', started, reread);
      }
      action.state = ACTION_STATES.APPLYING;
      const applied = await this.safeAdapterCall('applyAction', action, { status: 'APPLIED' }, { match, delta, attempt });
      if (applied.status === 'TIMEOUT') {
        const reread = await this.safeAdapterCall('inspectExisting', action, { existingQuantity: 0 });
        if (Number(reread.existingQuantity || 0) === action.quantity) return this.finishAction(run, action, ACTION_STATES.SUCCESS, null, null, started, { ...reread, verificationStatus: 'RECONCILED_AFTER_TIMEOUT' });
        if (attempt >= this.maxRetries || applied.mutationUncertain) return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.PORTAL_TIMEOUT, applied.message || 'Portal mutation timed out and was not safely repeatable.', started, applied);
        continue;
      }
      if (applied.status === 'FAIL') return this.finishAction(run, action, ACTION_STATES.FAILED, applied.errorCode || FAILURE_CODES.VERIFICATION_FAILED, applied.message || 'Portal apply failed.', started, applied);
      if (applied.status === 'DUPLICATE') return this.finishAction(run, action, ACTION_STATES.DUPLICATE, FAILURE_CODES.DUPLICATE_ACTION, applied.message || 'Portal reported the exact code is already present.', started, applied);
      this.audit?.({ runId: run.runId, billSessionId: run.billSessionId, operation: AUDIT_EVENTS.PORTAL_ACTION_APPLIED, stage: 'PORTAL_EXECUTION', status: ACTION_STATES.APPLYING, sourceRef: { executionActionId: action.executionActionId, code: action.code, delta } });
      action.state = ACTION_STATES.VERIFYING;
      const verified = await this.safeAdapterCall('verifyAction', action, { status: 'FAIL', observedQuantity: null }, { expectedQuantity: action.quantity });
      if (verified.status === 'PASS') return this.finishAction(run, action, ACTION_STATES.SUCCESS, null, null, started, verified);
      if (verified.status === 'TIMEOUT' && attempt < this.maxRetries) continue;
      return this.finishAction(run, action, ACTION_STATES.FAILED, verified.errorCode || FAILURE_CODES.VERIFICATION_FAILED, verified.message || 'Post-action portal verification failed.', started, verified);
    }
    return this.finishAction(run, action, ACTION_STATES.FAILED, FAILURE_CODES.VERIFICATION_FAILED, 'Retry policy exhausted.', started);
  }

  async safeAdapterCall(method, action, fallback, context = {}) {
    if (!this.adapter || typeof this.adapter[method] !== 'function') return fallback;
    try { return await this.adapter[method](action, context); }
    catch (error) { return { ...(fallback || {}), status: 'FAIL', errorCode: error.code || FAILURE_CODES.VERIFICATION_FAILED, message: error.message }; }
  }

  finishAction(run, action, state, errorCode, error, started, observed = {}) {
    action.state = state;
    action.completedAt = iso(this.clock);
    action.durationMs = durationMs(started);
    action.observedCode = observed.observedCode || observed.code || action.code;
    action.observedQuantity = observed.observedQuantity ?? observed.existingQuantity ?? observed.actualQuantity ?? action.observedQuantity;
    action.verificationStatus = observed.verificationStatus || (state === ACTION_STATES.SUCCESS ? 'VERIFIED' : (state === ACTION_STATES.DUPLICATE ? 'ALREADY_SATISFIED' : 'NOT_VERIFIED'));
    action.errorCode = errorCode || observed.errorCode || null;
    action.error = error || observed.error || observed.message || null;
    action.diagnosticReference = observed.diagnosticReference || observed.diagnostics?.path || null;
    if (state === ACTION_STATES.SUCCESS) this.audit?.({ runId: run.runId, billSessionId: run.billSessionId, operation: AUDIT_EVENTS.PORTAL_ACTION_VERIFIED, stage: 'PORTAL_EXECUTION', status: state, sourceRef: { executionActionId: action.executionActionId, code: action.code, observedQuantity: action.observedQuantity } });
    else if (state === ACTION_STATES.DUPLICATE) this.audit?.({ runId: run.runId, billSessionId: run.billSessionId, operation: AUDIT_EVENTS.PORTAL_ACTION_DUPLICATE, stage: 'PORTAL_EXECUTION', status: state, sourceRef: { executionActionId: action.executionActionId, code: action.code, observedQuantity: action.observedQuantity } });
    else this.audit?.({ runId: run.runId, billSessionId: run.billSessionId, operation: AUDIT_EVENTS.PORTAL_ACTION_FAILED, stage: 'PORTAL_EXECUTION', status: state, errorCode: action.errorCode, sourceRef: { executionActionId: action.executionActionId, code: action.code, error: action.error } });
    if (action.errorCode && this.storageService && state === ACTION_STATES.FAILED) {
      const failure = this.storageService.appendFailure({ runId: run.runId, billSessionId: run.billSessionId, stage: 'PORTAL_EXECUTION', code: action.errorCode, message: action.error || action.errorCode, recoverable: true });
      action.diagnosticReference = failure.diagnosticPath || failure.failureId;
    }
    return action;
  }
}

module.exports = {
  DEFAULT_MAX_RETRIES,
  PortalExecutionService,
  actionFromPlanAction,
  createSummary,
  statusFromSummary,
  validateExecutionAction
};
