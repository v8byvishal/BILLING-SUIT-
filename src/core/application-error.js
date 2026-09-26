'use strict';

const ERROR_CODES = Object.freeze({
  STORAGE_NOT_READY: 'STORAGE_NOT_READY',
  STORAGE_ACCESS_ERROR: 'STORAGE_ACCESS_ERROR',
  INVALID_BILL_SESSION: 'INVALID_BILL_SESSION',
  IPC_INVALID_REQUEST: 'IPC_INVALID_REQUEST',
  APP_INTERNAL_ERROR: 'APP_INTERNAL_ERROR',
  FEATURE_NOT_AVAILABLE: 'FEATURE_NOT_AVAILABLE',
  INVALID_STATE: 'INVALID_STATE'
});

class ApplicationError extends Error {
  constructor({ code, stage, message, recoverable = true, details = null, cause = null }) {
    super(message || code || ERROR_CODES.APP_INTERNAL_ERROR);
    this.name = 'ApplicationError';
    this.code = code || ERROR_CODES.APP_INTERNAL_ERROR;
    this.stage = stage || 'APPLICATION';
    this.recoverable = Boolean(recoverable);
    this.details = sanitizeDetails(details);
    if (cause) this.cause = cause;
  }

  toJSON() {
    return {
      code: this.code,
      stage: this.stage,
      message: this.message,
      recoverable: this.recoverable,
      details: this.details
    };
  }
}

function sanitizeDetails(value) {
  if (value == null) return null;
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value, (key, item) => {
      if (/password|cookie|token|secret|credential/i.test(key)) return '[REDACTED]';
      if (typeof item === 'function') return undefined;
      return item;
    }));
  } catch (_) {
    return { value: String(value) };
  }
}

function toApplicationError(error, fallback = {}) {
  if (error instanceof ApplicationError) return error;
  return new ApplicationError({
    code: fallback.code || error?.code || ERROR_CODES.APP_INTERNAL_ERROR,
    stage: fallback.stage || 'APPLICATION',
    message: fallback.message || error?.message || String(error),
    recoverable: fallback.recoverable !== undefined ? fallback.recoverable : true,
    details: fallback.details || null,
    cause: error instanceof Error ? error : null
  });
}

function toPublicError(error, fallback = {}) {
  return toApplicationError(error, fallback).toJSON();
}

module.exports = { ApplicationError, ERROR_CODES, sanitizeDetails, toApplicationError, toPublicError };
