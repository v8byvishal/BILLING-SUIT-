'use strict';

const { ApplicationError, ERROR_CODES, toPublicError } = require('../core/application-error');
const { IPC_CHANNEL, OPERATIONS, validateOperationRequest } = require('./ipc-contract');

function createIpcDispatcher(handlers) {
  return async function dispatch(request) {
    const { operation, payload } = validateOperationRequest(request);
    const handler = handlers[operation];
    if (typeof handler !== 'function') {
      throw new ApplicationError({ code: ERROR_CODES.FEATURE_NOT_AVAILABLE, stage: 'IPC', message: `Operation is not implemented: ${operation}`, recoverable: true });
    }
    try {
      return await handler(payload);
    } catch (error) {
      if (error instanceof ApplicationError) throw error;
      throw new ApplicationError({ code: error?.code || ERROR_CODES.APP_INTERNAL_ERROR, stage: 'IPC', message: error?.message || String(error), recoverable: true, details: error?.details || null, cause: error });
    }
  };
}

function registerPhase1Ipc(ipcMain, handlers) {
  const dispatch = createIpcDispatcher(handlers);
  ipcMain.handle(IPC_CHANNEL, async (_event, request) => {
    try {
      return { ok: true, value: await dispatch(request) };
    } catch (error) {
      return { ok: false, error: toPublicError(error, { stage: 'IPC' }) };
    }
  });
  return dispatch;
}

module.exports = { OPERATIONS, createIpcDispatcher, registerPhase1Ipc };
