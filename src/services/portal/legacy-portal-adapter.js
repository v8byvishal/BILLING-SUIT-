'use strict';

const { FAILURE_CODES } = require('./portal-contract');

function legacyRequestForAction(action, context = {}) {
  return {
    contract_version: '1.0.0',
    operation: 'execute_plan_action_batch',
    run_id: context.runId,
    requested_at: context.startedAt || new Date().toISOString(),
    plan_version: context.planVersion || '5.0.0',
    bill: { bill_id: action.billSessionId, source_file: action.planId },
    custom_registry: null,
    actions: [{
      action_id: action.executionActionId,
      code: action.code,
      quantity: action.quantity,
      section: null,
      source: 'PHASE6_ENHANCEMENT_PLAN',
      source_evidence: action.sourceCandidateIds || [],
      reason: action.actionId,
      rule_id: action.ruleId || null,
      code_classification: 'VALIDATED_ACTION',
      derived: !!action.ruleId,
      plan_status: 'RULE_VERIFIED',
      audit_metadata: { description: action.description || null, planId: action.planId, planSha256: action.planSha256 }
    }],
    blocked: [],
    source_plan_warnings: []
  };
}

function mapInspectionResponse(portal, diagnostics = null) {
  const controls = portal?.requiredControls || {};
  const requiredControlsPresent = ['treatmentPlanHeader', 'procedureInput', 'specialityInput', 'quantityInput', 'reasonDropdown', 'plusButton'].every((key) => controls[key] === true);
  return {
    identity: portal?.identityVerified
      ? { status: 'PASS', marker: portal.portalName || 'Legacy portal identity verified', observed: { url: portal.url || null, title: portal.title || null, treatmentHeader: portal.treatmentHeader || null } }
      : { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_IDENTITY_UNVERIFIED, marker: 'Legacy portal identity could not be verified', observed: { url: portal?.url || null, title: portal?.title || null } },
    authentication: portal?.authenticated
      ? { status: 'PASS', marker: 'Legacy portal inspection found authenticated Treatment Plan controls', observed: { url: portal.url || null, title: portal.title || null } }
      : { status: 'FAIL', errorCode: FAILURE_CODES.AUTHENTICATION_UNVERIFIED, marker: 'Legacy portal authentication state could not be verified', observed: { url: portal?.url || null, title: portal?.title || null } },
    controls: requiredControlsPresent
      ? { status: 'PASS', marker: 'Legacy portal inspection found required Treatment Plan controls', observed: { requiredControls: controls, controlCounts: portal?.controlCounts || null } }
      : { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_CONTROLS_UNAVAILABLE, marker: 'Legacy portal inspection did not find all required controls', observed: { requiredControls: controls, controlCounts: portal?.controlCounts || null } },
    blockingState: portal?.blockingState?.present
      ? { status: 'FAIL', errorCode: FAILURE_CODES.PORTAL_BLOCKING_STATE, marker: 'Legacy portal inspection found a blocking state', observed: portal.blockingState }
      : { status: 'PASS', marker: 'Legacy portal inspection found no blocking state', observed: portal?.blockingState || null },
    billContext: portal?.billContextVerified
      ? { status: 'PASS', marker: 'Legacy portal inspection verified expected bill/patient context', observed: { verified: true } }
      : { status: 'FAIL', errorCode: FAILURE_CODES.CONTEXT_UNVERIFIED, marker: 'Legacy portal inspection could not verify expected bill/patient context', observed: { verified: false } },
    diagnostics
  };
}

function mapLegacyStatus(result) {
  const status = result?.action_status;
  if (status === 'EXECUTED') return { terminal: 'SUCCESS', verificationStatus: result.verification_result || 'PORTAL_ROW_VERIFIED' };
  if (status === 'ALREADY_PRESENT') return { terminal: 'DUPLICATE', verificationStatus: result.verification_result || 'PORTAL_ROW_RECONCILED', errorCode: FAILURE_CODES.DUPLICATE_ACTION };
  if (status === 'DUPLICATE_DETECTED') return { terminal: 'DUPLICATE', verificationStatus: result.verification_result || 'DUPLICATE_DETECTED', errorCode: FAILURE_CODES.DUPLICATE_ACTION };
  if (status === 'QUANTITY_MISMATCH') return { terminal: 'FAILED', verificationStatus: result.verification_result || 'QUANTITY_MISMATCH', errorCode: FAILURE_CODES.QUANTITY_MISMATCH };
  return { terminal: 'FAILED', verificationStatus: result?.verification_result || 'NOT_VERIFIED', errorCode: result?.errorCode || FAILURE_CODES.VERIFICATION_FAILED };
}

class LegacyPortalAdapter {
  constructor(options = {}) {
    this.runner = options.runner;
    this.lastResults = new Map();
  }

  async inspectPortalState(context = {}) {
    if (!this.runner || typeof this.runner.execute !== 'function') {
      return mapInspectionResponse({ identityVerified: false, authenticated: false, requiredControls: {}, blockingState: { present: true, details: ['Python runner is unavailable.'] }, billContextVerified: false });
    }
    try {
      const response = await this.runner.execute({
        contract_version: '1.0.0',
        operation: 'inspect_portal_state',
        run_id: context.runId || `preflight-${Date.now()}`,
        expectedContext: {
          billNumber: context.expectedContext?.billNumber || context.plan?.bill?.bill_number || context.plan?.billing?.billNumber || null,
          uhid: context.expectedContext?.uhid || context.plan?.patient?.uhid || null,
          patientName: context.expectedContext?.patientName || context.plan?.patient?.name || null
        }
      });
      if (!response || response.fatal_error) return mapInspectionResponse({ identityVerified: false, authenticated: false, requiredControls: {}, blockingState: { present: true, details: [response?.fatal_error || 'Portal inspection failed.'] }, billContextVerified: false }, response || null);
      return mapInspectionResponse(response.portal || { identityVerified: false, authenticated: false, requiredControls: {}, blockingState: { present: true, details: ['Portal inspection response omitted portal object.'] }, billContextVerified: false }, response);
    } catch (error) {
      return mapInspectionResponse({ identityVerified: false, authenticated: false, requiredControls: {}, blockingState: { present: true, details: [error.message] }, billContextVerified: false });
    }
  }

  async searchCode(action) {
    return { status: 'MATCHED', exactMatches: [{ code: action.code, label: action.description || action.code, source: 'LEGACY_EXECUTOR_DELEGATED_EXACT_SEARCH' }], delegatedToLegacyExecutor: true };
  }

  async inspectExisting(action) {
    return { status: 'OK', existingQuantity: 0, lockedQuantity: false, rows: [], delegatedToLegacyExecutor: true, code: action.code };
  }

  async applyAction(action, context = {}) {
    const result = await this.executeAction(action, context);
    this.lastResults.set(action.executionActionId, result);
    if (result.terminal === 'SUCCESS') return { status: 'SUCCESS', verificationStatus: result.verificationStatus, observedQuantity: result.observedQuantity, diagnostics: result.diagnostics, delegatedToLegacyExecutor: true };
    if (result.terminal === 'DUPLICATE') return { status: 'DUPLICATE', errorCode: FAILURE_CODES.DUPLICATE_ACTION, verificationStatus: result.verificationStatus, observedQuantity: result.observedQuantity, diagnostics: result.diagnostics, delegatedToLegacyExecutor: true };
    return { status: 'FAIL', errorCode: result.errorCode || FAILURE_CODES.PYTHON_EXECUTOR_FAILED, message: result.error || 'Legacy portal executor failed.', diagnostics: result.diagnostics, delegatedToLegacyExecutor: true };
  }

  async verifyAction(action) {
    const result = this.lastResults.get(action.executionActionId);
    if (result?.terminal === 'SUCCESS') return { status: 'VERIFIED', observedCode: result.observedCode || action.code, observedQuantity: result.observedQuantity || action.quantity, verificationStatus: result.verificationStatus || 'LEGACY_EXECUTOR_VERIFIED' };
    if (result?.terminal === 'DUPLICATE') return { status: 'DUPLICATE', observedCode: result.observedCode || action.code, observedQuantity: result.observedQuantity || action.quantity, verificationStatus: result.verificationStatus || 'LEGACY_EXECUTOR_DUPLICATE' };
    return { status: 'FAIL', errorCode: result?.errorCode || FAILURE_CODES.VERIFICATION_FAILED, message: result?.error || 'No verified legacy executor result was available.' };
  }

  async executeAction(action, context = {}) {
    if (!this.runner || typeof this.runner.execute !== 'function') {
      return { terminal: 'FAILED', errorCode: FAILURE_CODES.PYTHON_EXECUTOR_UNAVAILABLE, error: 'Python runner is unavailable.' };
    }
    try {
      const response = await this.runner.execute(legacyRequestForAction(action, context));
      const result = (response.results || []).find((item) => item.action_id === action.executionActionId) || null;
      if (!result) return { terminal: 'FAILED', errorCode: FAILURE_CODES.PYTHON_RESPONSE_MALFORMED, error: 'Python executor returned no result for action.', raw: response };
      return { ...mapLegacyStatus(result), observedCode: result.code || action.code, observedQuantity: result.actual_quantity ?? result.requested_quantity ?? null, raw: result, diagnostics: result.diagnostics || null, retryCount: result.retry_count || 0 };
    } catch (error) {
      return { terminal: 'FAILED', errorCode: error.code === 'PYTHON_EXECUTOR_UNAVAILABLE' ? FAILURE_CODES.PYTHON_EXECUTOR_UNAVAILABLE : FAILURE_CODES.PYTHON_EXECUTOR_FAILED, error: error.message };
    }
  }
}

module.exports = { LegacyPortalAdapter, legacyRequestForAction, mapInspectionResponse, mapLegacyStatus };
