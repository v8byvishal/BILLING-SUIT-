'use strict';

const http = require('node:http');
const { URL } = require('node:url');
const { CDP_DEFAULT_ENDPOINT, FAILURE_CODES } = require('./portal-contract');

function withTimeout(promise, timeoutMs, onTimeout) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => { timer = setTimeout(() => reject(onTimeout()), timeoutMs); })
  ]);
}

function requestJson(url, timeoutMs = 1500) {
  return withTimeout(new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(Object.assign(new Error(`CDP endpoint returned HTTP ${res.statusCode}`), { code: FAILURE_CODES.CDP_UNAVAILABLE }));
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(Object.assign(new Error(`CDP endpoint returned malformed JSON: ${error.message}`), { code: FAILURE_CODES.CDP_UNAVAILABLE })); }
      });
    });
    req.on('timeout', () => req.destroy(Object.assign(new Error('CDP endpoint timed out'), { code: FAILURE_CODES.PORTAL_TIMEOUT })));
    req.on('error', reject);
    req.end();
  }), timeoutMs + 100, () => Object.assign(new Error('CDP endpoint timed out'), { code: FAILURE_CODES.PORTAL_TIMEOUT }));
}

function isValidTarget(target) {
  if (!target || typeof target !== 'object') return false;
  if (!['page', 'webview'].includes(String(target.type || '').toLowerCase())) return false;
  try { new URL(String(target.url || 'about:blank')); return true; }
  catch (_) { return false; }
}

function looksLikePortalTarget(target) {
  const text = `${target?.url || ''} ${target?.title || ''}`.toLowerCase();
  // Actual legacy portal automation looks for the Treatment Plan page and procedure/speciality controls.
  // URL/title alone is not enough for READY; this only selects the candidate target for deeper inspection.
  return /treatment\s*plan|procedure|speciality|cghs|hco|beneficiary|claim|hospital/.test(text) && !/devtools|chrome:\/\/|login-only-placeholder/.test(text);
}

class CdpHealthCheck {
  constructor(options = {}) {
    this.endpoint = options.endpoint || process.env.CGHS_CDP_ENDPOINT || CDP_DEFAULT_ENDPOINT;
    this.timeoutMs = options.timeoutMs || 1500;
    this.fetchTargets = options.fetchTargets || ((url) => requestJson(url, this.timeoutMs));
  }

  async check() {
    const startedAt = new Date().toISOString();
    const normalized = String(this.endpoint || CDP_DEFAULT_ENDPOINT).replace(/\/$/, '');
    try {
      const targets = await this.fetchTargets(`${normalized}/json/list`);
      if (!Array.isArray(targets)) {
        return { status: 'FAIL', endpoint: normalized, startedAt, errorCode: FAILURE_CODES.CDP_UNAVAILABLE, message: 'CDP /json/list did not return an array.', targets: [] };
      }
      const validTargets = targets.filter(isValidTarget);
      const portalTarget = validTargets.find(looksLikePortalTarget) || null;
      if (!validTargets.length) {
        return { status: 'FAIL', endpoint: normalized, startedAt, errorCode: FAILURE_CODES.CDP_TARGET_NOT_FOUND, message: 'CDP endpoint is reachable but no usable page target was returned.', targets: [] };
      }
      if (!portalTarget) {
        return { status: 'FAIL', endpoint: normalized, startedAt, errorCode: FAILURE_CODES.CDP_TARGET_NOT_FOUND, message: 'CDP endpoint is reachable but no expected portal target was discoverable.', targets: validTargets.map(sanitizeTarget) };
      }
      return { status: 'PASS', endpoint: normalized, startedAt, message: 'CDP endpoint is reachable and an expected portal target is discoverable.', targets: validTargets.map(sanitizeTarget), portalTarget: sanitizeTarget(portalTarget) };
    } catch (error) {
      return { status: 'FAIL', endpoint: normalized, startedAt, errorCode: error.code || FAILURE_CODES.CDP_UNAVAILABLE, message: error.message || 'CDP endpoint is unavailable.', targets: [] };
    }
  }
}

function sanitizeTarget(target) {
  return {
    id: target.id || null,
    type: target.type || null,
    title: target.title || null,
    url: target.url || null,
    webSocketDebuggerUrl: target.webSocketDebuggerUrl ? '[PRESENT]' : null
  };
}

module.exports = { CdpHealthCheck, isValidTarget, looksLikePortalTarget, requestJson, sanitizeTarget };
