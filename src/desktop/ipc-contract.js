'use strict';

const { ApplicationError, ERROR_CODES, sanitizeDetails } = require('../core/application-error');

const IPC_CHANNEL = 'cghs-suite:invoke';

const OPERATIONS = Object.freeze({
  APP_GET_INFO: 'app.getInfo',
  APP_GET_STATUS: 'app.getStatus',
  APP_GET_DIAGNOSTICS: 'app.getDiagnostics',
  STORAGE_GET_STATUS: 'storage.getStatus',
  STORAGE_OPEN_ROOT: 'storage.openRoot',
  STORAGE_OPEN_FOLDER: 'storage.openFolder',
  STORAGE_LIST_RECENT: 'storage.listRecent',
  STORAGE_LIST_SOURCE_BILLS: 'storage.listSourceBills',
  STORAGE_GET_USAGE: 'storage.getUsageSummary',
  SOURCE_BILL_GET_PARSE_RESULT: 'sourceBill.getParseResult',
  RESOLUTION_GET_RESULT: 'resolution.getResult',
  RESOLUTION_GET_STATUS: 'resolution.getStatus',
  REGISTRY_GET_STATUS: 'registry.getStatus',
  BILL_GET_CURRENT: 'bill.getCurrent',
  BILL_CLEAR_CURRENT: 'bill.clearCurrent',
  BILL_SELECT: 'bill.select',
  BILL_RESET: 'bill.reset',
  ENHANCEMENT_BUILD_PLAN: 'enhancement.buildPlan',
  ENHANCEMENT_GET_PLAN: 'enhancement.getPlan',
  ENHANCEMENT_GET_PLAN_SUMMARY: 'enhancement.getPlanSummary',
  ENHANCEMENT_VALIDATE_PLAN: 'enhancement.validatePlan',
  ENHANCEMENT_REBUILD_PLAN: 'enhancement.rebuildPlan',
  ENHANCEMENT_GET_STATUS: 'enhancement.getStatus',
  PORTAL_PREFLIGHT: 'portal.preflight',
  PORTAL_GET_PREFLIGHT: 'portal.getPreflight',
  PORTAL_START_EXECUTION: 'portal.startExecution',
  PORTAL_GET_EXECUTION: 'portal.getExecution',
  PORTAL_CANCEL_EXECUTION: 'portal.cancelExecution',
  PORTAL_GET_EXECUTION_SUMMARY: 'portal.getExecutionSummary',
  PORTAL_REVALIDATE: 'portal.revalidate',
  FINAL_BILL_GET_STATUS: 'finalBill.getStatus',
  SETTINGS_GET: 'settings.get',
  SETTINGS_UPDATE: 'settings.update',
  HISTORY_LIST: 'history.list',
  DIAGNOSTICS_OPEN_FOLDER: 'diagnostics.openFolder'
});

const OPERATION_SET = new Set(Object.values(OPERATIONS));

function sanitizePayload(payload) {
  if (payload == null) return null;
  if (typeof payload !== 'object' || Array.isArray(payload)) return payload;
  return sanitizeDetails(payload);
}

function validateOperationRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new ApplicationError({ code: ERROR_CODES.IPC_INVALID_REQUEST, stage: 'IPC', message: 'IPC request must be an object', recoverable: true });
  }
  const operation = request.operation;
  if (!OPERATION_SET.has(operation)) {
    throw new ApplicationError({ code: ERROR_CODES.IPC_INVALID_REQUEST, stage: 'IPC', message: `Unsupported IPC operation: ${operation || 'missing'}`, recoverable: true });
  }
  return { operation, payload: sanitizePayload(request.payload) };
}

module.exports = { IPC_CHANNEL, OPERATIONS, OPERATION_SET, sanitizePayload, validateOperationRequest };
