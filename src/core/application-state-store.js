'use strict';

const crypto = require('node:crypto');
const { ApplicationError, ERROR_CODES } = require('./application-error');

const APP_STATUS = Object.freeze({ READY: 'READY', ERROR: 'ERROR', STARTING: 'STARTING' });
const BILL_STATUS = Object.freeze({ NONE: 'NONE', LOADED: 'LOADED' });
const ENHANCEMENT_STATUS = Object.freeze({ NOT_STARTED: 'NOT STARTED', READY: 'READY', REVIEW_REQUIRED: 'REVIEW REQUIRED', EXECUTED: 'EXECUTED', FAILED: 'FAILED' });
const PORTAL_STATUS = Object.freeze({ NOT_VERIFIED: 'NOT VERIFIED', READY: 'READY', NOT_AVAILABLE: 'NOT AVAILABLE' });
const FINAL_BILL_STATUS = Object.freeze({ NOT_STARTED: 'NOT STARTED', READY: 'READY', GENERATED: 'GENERATED', ERROR: 'ERROR' });

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultState(clock) {
  const now = clock().toISOString();
  return {
    appInfo: null,
    appStatus: { status: APP_STATUS.STARTING, message: 'Application starting', updated_at: now },
    storageStatus: { status: 'NOT_INITIALIZED', path: null, writable: false, updated_at: now },
    currentBill: { status: BILL_STATUS.NONE, billSessionId: null, source: null, metadata: null, updated_at: now },
    enhancement: { status: ENHANCEMENT_STATUS.NOT_STARTED, billSessionId: null, plan: null, results: null, diagnostics: [], updated_at: now },
    finalBill: { status: FINAL_BILL_STATUS.NOT_STARTED, billSessionId: null, source: null, output: null, diagnostics: [], updated_at: now },
    diagnostics: { status: 'NOT_COLLECTED', records: [], updated_at: now },
    settings: { status: 'NOT_LOADED', values: {}, updated_at: now },
    history: [],
    portal: { status: PORTAL_STATUS.NOT_VERIFIED, updated_at: now },
    transientUI: { busy: false, route: 'dashboard', lastMessage: null, updated_at: now }
  };
}

class ApplicationStateStore {
  constructor(options = {}) {
    this.clock = options.clock || (() => new Date());
    this.idFactory = options.idFactory || (() => crypto.randomUUID());
    this.maxHistory = options.maxHistory || 200;
    this.state = defaultState(this.clock);
  }

  now() { return this.clock().toISOString(); }

  snapshot() { return clone(this.state); }

  setAppInfo(appInfo) {
    this.state.appInfo = clone(appInfo);
    return this.snapshot();
  }

  setAppStatus(status, message = null) {
    this.state.appStatus = { status, message, updated_at: this.now() };
    return this.snapshot();
  }

  setStorageStatus(storageStatus) {
    this.state.storageStatus = { ...clone(storageStatus), updated_at: this.now() };
    return this.snapshot();
  }

  setSettings(values) {
    this.state.settings = { status: 'READY', values: clone(values), updated_at: this.now() };
    return this.snapshot();
  }

  setDiagnostics(diagnostics) {
    this.state.diagnostics = { status: 'READY', ...clone(diagnostics), updated_at: this.now() };
    return this.snapshot();
  }

  startBillSession(source = {}) {
    const billSessionId = source.billSessionId || `bill-session-${this.idFactory()}`;
    this.state.currentBill = {
      status: BILL_STATUS.LOADED,
      billSessionId,
      source: clone(source.source || source),
      metadata: clone(source.metadata || null),
      updated_at: this.now()
    };
    this.resetEnhancement({ preserveSession: false, billSessionId });
    this.resetFinalBill({ preserveSession: false, billSessionId });
    this.resetTransientUIState();
    this.appendHistory({ billSessionId, operation: 'BILL_SESSION_STARTED', status: 'READY', source_reference: source.source || source });
    return billSessionId;
  }

  getCurrentBillSessionId() {
    return this.state.currentBill.billSessionId;
  }

  assertBillSession(billSessionId) {
    if (!billSessionId || billSessionId !== this.state.currentBill.billSessionId) {
      throw new ApplicationError({
        code: ERROR_CODES.INVALID_BILL_SESSION,
        stage: 'BILL_SESSION',
        message: 'Request does not match the active bill session',
        recoverable: true,
        details: { requested: billSessionId || null, active: this.state.currentBill.billSessionId || null }
      });
    }
  }

  setCurrentBillMetadata(metadata) {
    this.state.currentBill.metadata = clone(metadata);
    this.state.currentBill.updated_at = this.now();
    return this.snapshot();
  }

  resetCurrentBill() {
    const previous = this.state.currentBill.billSessionId;
    this.state.currentBill = { status: BILL_STATUS.NONE, billSessionId: null, source: null, metadata: null, updated_at: this.now() };
    this.resetEnhancement({ preserveSession: false, billSessionId: null });
    this.resetFinalBill({ preserveSession: false, billSessionId: null });
    this.resetTransientUIState();
    this.appendHistory({ billSessionId: previous, operation: 'CURRENT_BILL_RESET', status: 'READY' });
    return this.snapshot();
  }

  setEnhancement({ billSessionId = this.state.currentBill.billSessionId, status, plan = null, results = null, diagnostics = [] }) {
    this.assertBillSession(billSessionId);
    this.state.enhancement = { billSessionId, status, plan: clone(plan), results: clone(results), diagnostics: clone(diagnostics), updated_at: this.now() };
    return this.snapshot();
  }

  resetEnhancement(options = {}) {
    const billSessionId = options.preserveSession === false ? (options.billSessionId || null) : this.state.currentBill.billSessionId;
    this.state.enhancement = { status: ENHANCEMENT_STATUS.NOT_STARTED, billSessionId, plan: null, results: null, diagnostics: [], updated_at: this.now() };
    return this.snapshot();
  }

  setFinalBill({ billSessionId = this.state.currentBill.billSessionId, status, source = null, output = null, diagnostics = [] }) {
    this.assertBillSession(billSessionId);
    this.state.finalBill = { billSessionId, status, source: clone(source), output: clone(output), diagnostics: clone(diagnostics), updated_at: this.now() };
    return this.snapshot();
  }

  resetFinalBill(options = {}) {
    const billSessionId = options.preserveSession === false ? (options.billSessionId || null) : this.state.currentBill.billSessionId;
    this.state.finalBill = { status: FINAL_BILL_STATUS.NOT_STARTED, billSessionId, source: null, output: null, diagnostics: [], updated_at: this.now() };
    return this.snapshot();
  }

  resetTransientUIState() {
    this.state.transientUI = { busy: false, route: this.state.transientUI.route || 'dashboard', lastMessage: null, updated_at: this.now() };
    return this.snapshot();
  }

  setRoute(route) {
    this.state.transientUI.route = route;
    this.state.transientUI.updated_at = this.now();
    return this.snapshot();
  }

  appendHistory(record) {
    const entry = {
      runId: record.runId || `run-${this.idFactory()}`,
      billSessionId: record.billSessionId || null,
      timestamp: record.timestamp || this.now(),
      operation: record.operation || 'UNKNOWN_OPERATION',
      status: record.status || 'UNKNOWN',
      duration: record.duration ?? null,
      source_reference: clone(record.source_reference || null),
      error_code: record.error_code || null,
      diagnostic_path: record.diagnostic_path || null
    };
    this.state.history.unshift(entry);
    if (this.state.history.length > this.maxHistory) this.state.history.length = this.maxHistory;
    return clone(entry);
  }
}

function createApplicationStateStore(options) {
  return new ApplicationStateStore(options);
}

module.exports = {
  APP_STATUS,
  BILL_STATUS,
  ENHANCEMENT_STATUS,
  FINAL_BILL_STATUS,
  PORTAL_STATUS,
  ApplicationStateStore,
  createApplicationStateStore
};
