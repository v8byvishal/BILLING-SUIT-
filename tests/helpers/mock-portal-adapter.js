'use strict';

class MockPortalAdapter {
  constructor(options = {}) {
    this.targets = options.targets || [{ id: 'target-1', type: 'page', title: 'CGHS Treatment Plan', url: 'https://portal.example.test/treatment-plan', webSocketDebuggerUrl: 'ws://127.0.0.1/devtools/page/1' }];
    this.identity = options.identity !== false;
    this.authenticated = options.authenticated !== false;
    this.controls = options.controls !== false;
    this.blocking = options.blocking === true;
    this.context = options.context !== false;
    this.rows = (options.rows || []).map((row) => ({ ...row, code: String(row.code || '').toUpperCase() }));
    this.searchResults = options.searchResults || {};
    this.ambiguousCodes = new Set(options.ambiguousCodes || []);
    this.notFoundCodes = new Set(options.notFoundCodes || []);
    this.lockedCodes = new Set(options.lockedCodes || []);
    this.verifyFailureCodes = new Set(options.verifyFailureCodes || []);
    this.timeoutCodes = new Set(options.timeoutCodes || []);
    this.mutationThenVerifyCodes = new Set(options.mutationThenVerifyCodes || []);
    this.specialityFailures = new Set(options.specialityFailures || []);
    this.applied = [];
  }

  cdpHealthCheck() {
    return { check: async () => ({ status: this.targets.length ? 'PASS' : 'FAIL', endpoint: 'mock://cdp', message: this.targets.length ? 'Mock CDP ready' : 'Mock CDP unavailable', targets: this.targets, portalTarget: this.targets[0] || null, errorCode: this.targets.length ? null : 'CDP_UNAVAILABLE' }) };
  }

  portalInspector() {
    return { inspect: async () => ({
      identity: this.identity ? { status: 'PASS', marker: 'mock treatment plan', observed: this.targets[0] || null } : { status: 'FAIL', errorCode: 'PORTAL_IDENTITY_UNVERIFIED', marker: 'mock wrong page' },
      authentication: this.authenticated ? { status: 'PASS', marker: 'mock authenticated DOM marker', observed: { loginVisible: false } } : { status: 'FAIL', errorCode: 'AUTHENTICATION_UNVERIFIED', marker: 'mock login visible' },
      controls: this.controls ? { status: 'PASS', marker: 'mock procedure/speciality/quantity/plus controls', observed: { procedure: true, speciality: true, quantity: true, plus: true } } : { status: 'FAIL', errorCode: 'PORTAL_CONTROLS_UNAVAILABLE', marker: 'mock controls missing' },
      blockingState: this.blocking ? { status: 'FAIL', errorCode: 'PORTAL_BLOCKING_STATE', marker: 'mock blocking modal active' } : { status: 'PASS', marker: 'mock no blocking state' },
      billContext: this.context ? { status: 'PASS', marker: 'mock bill context matched', observed: { billSessionId: 'matched' } } : { status: 'FAIL', errorCode: 'CONTEXT_UNVERIFIED', marker: 'mock context unavailable' }
    }) };
  }

  quantityFor(code) {
    return this.rows.filter((row) => row.code === String(code).toUpperCase()).reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  }

  matchingRows(code) {
    return this.rows.filter((row) => row.code === String(code).toUpperCase());
  }

  async inspectExisting(action) {
    const code = String(action.code).toUpperCase();
    const matches = this.matchingRows(code);
    if (this.ambiguousCodes.has(code) || matches.some((row) => row.ambiguous)) return { ambiguous: true, existingQuantity: this.quantityFor(code), exactMatches: matches.length, message: 'Mock ambiguous existing rows.' };
    const locked = this.lockedCodes.has(code) || matches.some((row) => row.locked);
    return { existingQuantity: this.quantityFor(code), exactMatches: matches.length, locked, observedCode: code, observedQuantity: this.quantityFor(code) };
  }

  async searchExact(action) {
    const code = String(action.code).toUpperCase();
    if (this.ambiguousCodes.has(code)) return { status: 'AMBIGUOUS', options: [`${code} option 1`, `${code} option 2`], message: 'Mock multiple exact options.' };
    if (this.notFoundCodes.has(code)) return { status: 'NOT_FOUND', options: [], message: 'Mock code not found.' };
    const options = this.searchResults[code] || [`${code} - exact mock option`];
    if (options.length !== 1) return { status: 'AMBIGUOUS', options, message: 'Mock search returned multiple options.' };
    return { status: 'MATCHED', option: options[0], observedCode: code };
  }

  async applyAction(action, context = {}) {
    const code = String(action.code).toUpperCase();
    if (this.specialityFailures.has(code)) return { status: 'FAIL', errorCode: 'SPECIALITY_SYNC_FAILED', message: 'Mock speciality sync failed.' };
    if (this.timeoutCodes.has(code)) {
      if (this.mutationThenVerifyCodes.has(code) && !this.rows.some((row) => row.code === code)) this.rows.push({ code, quantity: action.quantity });
      return { status: 'TIMEOUT', mutationUncertain: !this.mutationThenVerifyCodes.has(code), message: 'Mock mutation timeout.' };
    }
    const delta = Number(context.delta || action.quantity);
    const existing = this.matchingRows(code)[0];
    if (existing) existing.quantity = Number(existing.quantity || 0) + delta;
    else this.rows.push({ code, quantity: delta });
    this.applied.push({ code, delta });
    return { status: 'APPLIED', observedCode: code, observedQuantity: this.quantityFor(code) };
  }

  async verifyAction(action) {
    const code = String(action.code).toUpperCase();
    const quantity = this.quantityFor(code);
    if (this.verifyFailureCodes.has(code)) return { status: 'FAIL', observedCode: code, observedQuantity: quantity, errorCode: 'VERIFICATION_FAILED', message: 'Mock verification failed.' };
    return quantity === Number(action.quantity)
      ? { status: 'PASS', observedCode: code, observedQuantity: quantity, verificationStatus: 'PORTAL_ROW_VERIFIED' }
      : { status: 'FAIL', observedCode: code, observedQuantity: quantity, errorCode: 'QUANTITY_MISMATCH', message: 'Mock quantity mismatch.' };
  }
}

module.exports = { MockPortalAdapter };
