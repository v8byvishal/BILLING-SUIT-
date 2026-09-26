'use strict';

const { adaptEnhancementPlan } = require('../../adapters/legacy-portal/plan-adapter');

const TERMINAL = new Set(['EXECUTED', 'ALREADY_PRESENT', 'FAILED', 'UNKNOWN']);

function summarize(records, blocked) {
  const counts = { EXECUTED: 0, ALREADY_PRESENT: 0, BLOCKED: blocked.length, FAILED: 0, REVIEW_REQUIRED: blocked.filter((x) => x.action_status === 'REVIEW_REQUIRED').length, UNKNOWN: 0 };
  for (const record of records) counts[record.action_status] = (counts[record.action_status] || 0) + 1;
  const failure = counts.FAILED + counts.UNKNOWN;
  const success = counts.EXECUTED + counts.ALREADY_PRESENT;
  let status = 'BLOCKED';
  if (failure && success) status = 'PARTIAL';
  else if (failure) status = 'FAILED';
  else if (success) status = blocked.length ? 'PARTIAL' : 'EXECUTED';
  else if (blocked.some((x) => x.action_status === 'REVIEW_REQUIRED')) status = 'REVIEW_REQUIRED';
  return { status, counts };
}

async function executeEnhancementPlan(plan, runner, options = {}) {
  if (!runner || typeof runner.execute !== 'function') throw new Error('Portal runner is required');
  const request = adaptEnhancementPlan(plan, options);
  if (!request.actions.length) {
    const summary = summarize([], request.blocked);
    return { ...request, started_at: null, completed_at: options.timestamp || new Date().toISOString(), ...summary, results: [], portal_invoked: false };
  }
  const startedAt = options.timestamp || new Date().toISOString();
  let response;
  try { response = await runner.execute(request); }
  catch (error) {
    const results = request.actions.map((action) => ({
      action_id: action.action_id, code: action.code, requested_quantity: action.quantity,
      action_status: 'FAILED', portal_result: null, error: error.message, retry_count: 0,
      blocked: false, verification_result: 'NOT_VERIFIED', source: action.source, rule_id: action.rule_id
    }));
    const summary = summarize(results, request.blocked);
    return { ...request, started_at: startedAt, completed_at: new Date().toISOString(), ...summary, results, portal_invoked: true, executor_error: error.message };
  }
  const byId = new Map((response.results || []).map((result) => [result.action_id, result]));
  const results = request.actions.map((action) => {
    const result = byId.get(action.action_id);
    if (!result || !TERMINAL.has(result.action_status)) return {
      action_id: action.action_id, code: action.code, requested_quantity: action.quantity,
      action_status: 'UNKNOWN', portal_result: null, error: 'Executor returned no valid terminal result', retry_count: 0,
      blocked: false, verification_result: 'NOT_VERIFIED', source: action.source, rule_id: action.rule_id
    };
    return { ...result, code: action.code, requested_quantity: action.quantity, blocked: false, source: action.source, rule_id: action.rule_id };
  });
  const summary = summarize(results, request.blocked);
  return {
    ...request, started_at: startedAt, completed_at: response.completed_at || new Date().toISOString(),
    ...summary, results, portal_invoked: true, executor: response.executor || 'LEGACY_PYTHON_SELENIUM',
    executor_log: response.executor_log || [], executor_stderr: response.executor_stderr || null,
    fatal_error: response.fatal_error || null
  };
}

module.exports = { executeEnhancementPlan, summarize };
