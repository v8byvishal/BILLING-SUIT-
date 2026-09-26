'use strict';

const ui = {
  route: 'dashboard',
  appState: null,
  diagnostics: null,
  settings: null,
  sourceRecords: [],
  auditRecords: [],
  usage: null,
  parseResult: null,
  resolutionResult: null,
  enhancementPlan: null,
  planSummary: null,
  planValidation: null,
  registryStatus: null
};

const $ = (id) => document.getElementById(id);
const text = (id, value) => { const node = $(id); if (node) node.textContent = value == null || value === '' ? '—' : String(value); };

function suite() {
  if (!window.cghsSuite) throw new Error('Application preload API is unavailable.');
  return window.cghsSuite;
}

function showBanner(message, type = 'info') {
  const banner = $('banner');
  banner.textContent = message;
  banner.className = `banner ${type}`;
  banner.hidden = false;
}

function clearBanner() {
  $('banner').hidden = true;
}

function safeMessage(error) {
  return error?.message || 'Operation failed. See diagnostics for details.';
}

function statusClass(value) {
  const normalized = String(value || '').toUpperCase();
  if (/READY|LOADED|EXECUTED|GENERATED|PASS|ACTIVE|VALIDATED|DIRECT_REGISTRY_MATCH/.test(normalized)) return 'good';
  if (/REVIEW|PARTIAL|NOT CONFIGURED|NOT VERIFIED|NOT STARTED|NONE|NOT_INITIALIZED|NO_MATCH|UNRESOLVED|STALE/.test(normalized)) return 'warn';
  if (/ERROR|FAILED|READ_ONLY|ACCESS|CORRUPT|INVALID|CONFLICT|REJECTED|BLOCKED/.test(normalized)) return 'bad';
  return 'neutral';
}

function setStatus(id, value) {
  const node = $(id);
  if (!node) return;
  node.textContent = value || '—';
  node.className = statusClass(value);
}

function activeState() {
  return ui.appState || { currentBill: {}, enhancement: {}, finalBill: {}, portal: {}, appStatus: {}, storageStatus: {}, history: [] };
}

function renderStatusStrip() {
  const state = activeState();
  setStatus('statusApp', state.appStatus?.status || 'ERROR');
  setStatus('statusStorage', state.storageStatus?.status || 'NOT_INITIALIZED');
  setStatus('statusBill', state.currentBill?.status || 'NONE');
  setStatus('statusRegistry', ui.registryStatus?.status || 'NOT CONFIGURED');
  setStatus('statusEnhancement', ui.enhancementPlan?.status || ui.planSummary?.status || state.enhancement?.status || 'NOT STARTED');
  setStatus('statusPortal', state.portal?.status || 'NOT VERIFIED');
  setStatus('statusFinalBill', state.finalBill?.status || 'NOT STARTED');
}

function renderDashboard() {
  const state = activeState();
  const bill = state.currentBill || {};
  const metadata = bill.metadata || {};
  text('dashboardState', state.appStatus?.status || 'STARTING');
  text('dashboardStoragePath', state.storageStatus?.path || 'Storage unavailable');
  text('dashboardStorageHealth', `${state.storageStatus?.status || 'UNKNOWN'} · manifest ${state.storageStatus?.manifestStatus || '—'} · write probe ${state.storageStatus?.writeProbe ? 'ok' : 'not verified'}`);
  text('dashboardSession', bill.billSessionId || 'NONE');
  text('dashboardBill', bill.status === 'LOADED' ? `${metadata.fileName || bill.source?.file_name || 'Source bill'} · ${metadata.billNumber || 'Bill number unavailable'}` : 'No source bill loaded.');
  text('dashboardEnhancement', ui.enhancementPlan ? `${ui.enhancementPlan.status} · ${ui.enhancementPlan.actions?.length || 0} action(s) · ${ui.enhancementPlan.reviewItems?.length || 0} review` : (ui.resolutionResult ? `${ui.resolutionResult.status} · plan not built` : 'No EnhancementPlan available.'));
  text('dashboardFinalBill', state.finalBill?.status === 'NOT STARTED' ? 'Final bill workflow has not started.' : state.finalBill?.status);
  text('nextAction', bill.status === 'LOADED' ? 'Review deterministic EnhancementPlan. Portal readiness remains NOT VERIFIED in Phase 5.' : 'Upload a source bill to begin.');
}

function renderSourceBill() {
  const bill = activeState().currentBill || {};
  const meta = bill.metadata || {};
  text('sourceState', bill.status || 'Empty');
  text('sourceSession', bill.billSessionId || 'NONE');
  text('sourceFile', meta.fileName || bill.source?.file_name || 'No source bill loaded.');
  text('sourcePages', meta.pages ?? meta.pageCount ?? ui.parseResult?.pageCount ?? '—');
  text('sourceBillNumber', meta.billNumber || '—');
  text('sourceIdentifiers', [meta.patientName, meta.uhid, meta.ipNumber].filter(Boolean).join(' · ') || '—');
  text('sourceSections', [...(meta.sections || []), ...(meta.excludedSections || []).map((x) => `${x} (excluded)`)].join(', ') || '—');
  const parse = ui.parseResult || {};
  text('sourceParseStatus', parse.status || meta.parseStatus || 'NOT_STARTED');
  text('sourceCandidateCount', parse.candidateCount ?? meta.candidateCount ?? 0);
  text('sourceWarnings', (parse.warnings || meta.warnings || []).map((warning) => warning.code || warning).join(', ') || '—');
  renderCandidates(parse.candidates || []);
  const body = $('sourceRecordRows');
  if (body) {
    body.replaceChildren();
    if (!ui.sourceRecords.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 8;
      cell.textContent = 'No persisted source bill records found.';
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      for (const record of ui.sourceRecords) {
        const meta = record.metadata || {};
        const row = document.createElement('tr');
        const parserSummary = record.parseResult ? `${record.parseResult.status} · ${record.parseResult.candidateCount || 0}` : 'NOT_STARTED';
        const resolutionSummary = record.resolutionResult ? `${record.resolutionResult.status} · ${record.resolutionResult.resultCount || 0}` : 'NOT_STARTED';
        const planSummary = record.planSummary ? `${record.planSummary.status} · ${record.planSummary.actionCount || 0}/${record.planSummary.reviewCount || 0}` : 'NOT_CREATED';
        for (const value of [meta.importedAt || '—', meta.billSessionId || record.billSessionId || '—', meta.originalFileName || '—', record.status || meta.status || '—', parserSummary, resolutionSummary, planSummary, meta.sha256 ? `${meta.sha256.slice(0, 12)}…` : '—']) {
          const cell = document.createElement('td');
          cell.textContent = value;
          row.appendChild(cell);
        }
        body.appendChild(row);
      }
    }
  }
}

function renderCandidates(candidates) {
  const body = $('candidateRows');
  if (!body) return;
  body.replaceChildren();
  if (!candidates.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = (ui.parseResult?.status === 'PARSER_COMPLETED_NO_CANDIDATES')
      ? 'PDF parsed successfully, but no candidate enhancement entries were detected.'
      : 'No parsed candidates available.';
    row.appendChild(cell);
    body.appendChild(row);
    text('candidateEvidence', 'No candidate evidence selected.');
    return;
  }
  for (const candidate of candidates) {
    const row = document.createElement('tr');
    row.tabIndex = 0;
    row.className = 'clickable-row';
    row.addEventListener('click', () => text('candidateEvidence', JSON.stringify(candidate.evidence || {}, null, 2)));
    row.addEventListener('keydown', (event) => { if (event.key === 'Enter') row.click(); });
    for (const value of [candidate.pageNumber, candidate.section, candidate.description || '—', candidate.codeRaw || '—', candidate.quantityRaw || '—', candidate.status]) {
      const cell = document.createElement('td');
      cell.textContent = value == null || value === '' ? '—' : String(value);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  text('candidateEvidence', JSON.stringify(candidates[0].evidence || {}, null, 2));
}

function setRows(bodyId, rows, columns, emptyMessage) {
  const body = $(bodyId);
  if (!body) return;
  body.replaceChildren();
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = columns.length;
    cell.textContent = emptyMessage;
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  for (const item of rows) {
    const row = document.createElement('tr');
    for (const column of columns) {
      const cell = document.createElement('td');
      const raw = typeof column === 'function' ? column(item) : item[column];
      cell.textContent = raw == null || raw === '' ? '—' : String(raw);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
}

function renderPlan() {
  const plan = ui.enhancementPlan;
  const billSessionId = activeState().currentBill?.billSessionId;
  text('enhancementState', plan?.status || 'No plan');
  text('enhancementBill', billSessionId ? `Active bill session: ${billSessionId}` : 'No source bill is active.');
  text('executionStatus', plan ? `${plan.readiness || 'NOT_READY'} · portal execution is not implemented in Phase 5.` : 'No validated plan available.');
  text('planVersion', plan ? `${plan.planVersion || '—'} · schema ${plan.schemaVersion || '—'}` : '—');
  text('planId', plan?.planId || '—');
  text('planHash', plan?.planSha256 || '—');
  text('planRegistry', plan ? `${plan.registryContext?.registryVersion || 'NONE'} · ${plan.registryContext?.registrySourceHash ? `${plan.registryContext.registrySourceHash.slice(0, 12)}…` : 'hash unavailable'}` : '—');
  text('planRuleSet', plan?.ruleContext?.ruleSetVersion || '—');
  $('noPlanMessage').hidden = !!plan;

  const actions = plan?.actions || [];
  const reviews = plan?.reviewItems || [];
  const excluded = plan?.excludedItems || [];
  setRows('actionRows', actions, [
    (item) => item.actionId,
    (item) => item.finalCode || item.resolved?.finalCode,
    (item) => item.description || item.input?.description,
    (item) => item.quantity?.value ?? item.resolved?.quantity,
    (item) => item.quantity?.unit || item.resolved?.unit,
    (item) => `${item.authority?.type || '—'} ${item.authority?.status || ''}`.trim(),
    (item) => `${item.provenance?.ruleId || item.provenance?.registryEntryId || '—'} · ${item.provenance?.sourceCandidateIds?.join(', ') || '—'}`
  ], 'No executable actions. Validated evidence is required before any action is emitted.');
  setRows('reviewRows', reviews, [
    (item) => item.reviewId,
    (item) => item.reasonCode,
    (item) => item.description,
    (item) => item.rawCode,
    (item) => item.sourceStatus,
    (item) => (item.requiredEvidence || []).join(', ')
  ], 'No review items.');
  setRows('excludedRows', excluded, [
    (item) => item.excludedId,
    (item) => item.reasonCode,
    (item) => item.description,
    (item) => item.rawCode,
    (item) => item.candidateId
  ], 'No excluded parser candidates.');

  const diagnostics = plan ? {
    planId: plan.planId,
    planSha256: plan.planSha256,
    status: plan.status,
    readiness: plan.readiness,
    diagnostics: plan.diagnostics,
    validation: ui.planValidation || plan.validation || null,
    summary: ui.planSummary || null,
    resolutionCounts: ui.resolutionResult?.counts || null
  } : { registry: ui.registryStatus || null, resolution: ui.resolutionResult ? { status: ui.resolutionResult.status, counts: ui.resolutionResult.counts } : null };
  text('enhancementDiagnostics', JSON.stringify(diagnostics, null, 2));
}

function renderFinalBill() {
  const finalBill = activeState().finalBill || {};
  text('finalBillState', finalBill.status || 'NOT STARTED');
}

function renderHistory() {
  const records = ui.auditRecords.length ? ui.auditRecords : (activeState().history || []);
  text('historyCount', `${records.length} record${records.length === 1 ? '' : 's'}`);
  const body = $('historyRows');
  body.replaceChildren();
  if (!records.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No persistent audit records found.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  for (const record of records) {
    const row = document.createElement('tr');
    for (const value of [record.timestamp, record.billSessionId || '—', record.operation || record.event || '—', [record.stage, record.status].filter(Boolean).join(' / ') || '—', record.errorCode || record.error_code || '—']) {
      const cell = document.createElement('td');
      cell.textContent = value || '—';
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
}

function renderSettings() {
  const values = ui.settings?.settings || ui.settings?.publicConfig || {};
  $('settingsStoragePath').value = values.storagePath || activeState().storageStatus?.path || '';
  $('settingsLoggingLevel').value = values.loggingLevel || ui.settings?.publicConfig?.loggingLevel || 'INFO';
  $('settingsDiagnostics').checked = values.diagnosticsEnabled !== false;
  text('settingsState', 'Ready');
  renderRegistry();
}

function renderRegistry() {
  const registry = ui.registryStatus || {};
  text('registryStatus', registry.status || 'NOT CONFIGURED');
  text('registryVersion', registry.registryVersion || 'NONE');
  text('registrySource', registry.registrySource || 'NONE');
  text('registryHash', registry.registryHash && registry.registryHash !== 'NONE' ? `${registry.registryHash.slice(0, 12)}…` : 'NONE');
  text('registryRuleCounts', `${registry.rules || 0} total · ${registry.validatedRules || 0} validated · ${registry.reviewRules || 0} review`);
}

function renderDiagnostics() {
  if (!ui.diagnostics) return;
  text('diagnosticsState', 'Collected');
  text('diagnosticsOutput', JSON.stringify(ui.diagnostics, null, 2));
}

function renderAll() {
  renderStatusStrip();
  renderDashboard();
  renderSourceBill();
  renderPlan();
  renderFinalBill();
  renderHistory();
  renderSettings();
  renderDiagnostics();
}

async function refreshState() {
  clearBanner();
  try {
    const [appState, settings, sourceRecords, auditRecords, registryStatus] = await Promise.all([
      suite().app.getStatus(),
      suite().settings.get(),
      suite().storage.listSourceBills().catch(() => []),
      suite().history.list().catch(() => []),
      suite().registry.getStatus().catch(() => null)
    ]);
    ui.appState = appState;
    ui.settings = settings;
    ui.sourceRecords = sourceRecords;
    ui.auditRecords = auditRecords;
    ui.registryStatus = registryStatus;
    const billSessionId = appState.currentBill?.billSessionId;
    ui.parseResult = billSessionId ? await suite().sourceBill.getParseResult(billSessionId).catch(() => null) : null;
    ui.resolutionResult = billSessionId ? await suite().resolution.getResult(billSessionId).catch(() => null) : null;
    const planPayload = billSessionId ? await suite().enhancement.getPlan(billSessionId).catch(() => null) : null;
    ui.enhancementPlan = planPayload?.plan || null;
    ui.planSummary = billSessionId ? await suite().enhancement.getPlanSummary(billSessionId).catch(() => null) : null;
    renderAll();
  } catch (error) {
    showBanner(safeMessage(error), 'error');
  }
}

function routeTo(route) {
  ui.route = route;
  for (const button of document.querySelectorAll('.nav-item')) button.classList.toggle('active', button.dataset.route === route);
  for (const view of document.querySelectorAll('.view')) view.classList.toggle('active', view.id === `view-${route}`);
  const active = $(`view-${route}`);
  text('viewTitle', active?.dataset.title || 'Dashboard');
}

async function selectBill() {
  showBanner('Waiting for source PDF selection…');
  try {
    const result = await suite().bill.select();
    if (result.canceled) showBanner('No PDF selected.', 'info');
    else if (result.duplicate) showBanner(`Duplicate source bill. Existing session ${result.billSessionId || 'unknown'} owns this hash.`, 'warning');
    else showBanner(`Source bill parsed for session ${result.billSessionId}: ${result.parseResult?.candidateCount || 0} candidate(s), ${result.resolutionResult?.resultCount || 0} resolution result(s).`, 'success');
    await refreshState();
  } catch (error) {
    showBanner(safeMessage(error), 'error');
    await refreshState();
  }
}

async function clearBill() {
  if (!window.confirm('Clear the active bill session and transient workspace state? Historical audit and stored bills are retained.')) return;
  try {
    await suite().bill.clearCurrent();
    showBanner('Current bill session cleared. Historical records retained.', 'success');
    await refreshState();
  } catch (error) { showBanner(safeMessage(error), 'error'); }
}

async function buildPlan(rebuild = false) {
  const billSessionId = activeState().currentBill?.billSessionId;
  if (!billSessionId) { showBanner('Load a source bill before building an EnhancementPlan.', 'warning'); return; }
  try {
    const payload = rebuild ? await suite().enhancement.rebuildPlan(billSessionId) : await suite().enhancement.buildPlan(billSessionId);
    ui.enhancementPlan = payload?.plan || null;
    ui.planSummary = payload?.summary || null;
    ui.planValidation = payload?.plan?.validation || null;
    showBanner(`${rebuild ? 'Rebuilt' : 'Built'} EnhancementPlan ${payload?.plan?.planId || ''} (${payload?.plan?.status || 'UNKNOWN'}).`, 'success');
    await refreshState();
  } catch (error) { showBanner(safeMessage(error), 'error'); }
}

async function validatePlan() {
  const billSessionId = activeState().currentBill?.billSessionId;
  if (!billSessionId) { showBanner('Load a source bill before validating an EnhancementPlan.', 'warning'); return; }
  try {
    const payload = await suite().enhancement.validatePlan(billSessionId);
    ui.planValidation = payload?.validation || payload;
    showBanner(`Plan validation ${ui.planValidation?.valid ? 'passed' : 'requires attention'}.`, ui.planValidation?.valid ? 'success' : 'warning');
    await refreshState();
  } catch (error) { showBanner(safeMessage(error), 'error'); }
}

async function collectDiagnostics() {
  try {
    ui.diagnostics = await suite().app.getDiagnostics();
    renderDiagnostics();
    showBanner('Diagnostics collected.', 'success');
  } catch (error) { showBanner(safeMessage(error), 'error'); }
}

async function copyDiagnostics() {
  try {
    if (!ui.diagnostics) ui.diagnostics = await suite().app.getDiagnostics();
    await navigator.clipboard.writeText(JSON.stringify(ui.diagnostics, null, 2));
    showBanner('Diagnostics copied to clipboard.', 'success');
  } catch (error) { showBanner('Diagnostics copy unavailable. Use the diagnostics text panel.', 'warning'); }
}

async function saveSettings(event) {
  event.preventDefault();
  try {
    const input = {
      storagePath: $('settingsStoragePath').value.trim() || null,
      loggingLevel: $('settingsLoggingLevel').value,
      diagnosticsEnabled: $('settingsDiagnostics').checked
    };
    const result = await suite().settings.update(input);
    ui.settings = { settings: result.settings, publicConfig: ui.settings?.publicConfig };
    renderSettings();
    showBanner(result.restartRequired ? 'Settings saved. Storage path changes require controlled restart handling.' : 'Settings saved.', 'success');
  } catch (error) { showBanner(safeMessage(error), 'error'); }
}

function bind() {
  for (const button of document.querySelectorAll('.nav-item')) button.addEventListener('click', () => routeTo(button.dataset.route));
  $('refreshState').addEventListener('click', refreshState);
  $('openStorageRoot').addEventListener('click', () => suite().storage.openRoot().catch((error) => showBanner(safeMessage(error), 'error')));
  $('dashboardSelectBill').addEventListener('click', selectBill);
  $('selectSourceBill').addEventListener('click', selectBill);
  $('clearSourceBill').addEventListener('click', clearBill);
  $('openSourceFolder').addEventListener('click', () => suite().storage.openFolder('Source_Bills').catch((error) => showBanner(safeMessage(error), 'error')));
  $('buildEnhancementPlan').addEventListener('click', () => buildPlan(false));
  $('validateEnhancementPlan').addEventListener('click', validatePlan);
  $('rebuildEnhancementPlan').addEventListener('click', () => buildPlan(true));
  $('openFinalFolder').addEventListener('click', () => suite().storage.openFolder('Final_Bills').catch((error) => showBanner(safeMessage(error), 'error')));
  $('openAuditFolder').addEventListener('click', () => suite().storage.openFolder('Audit').catch((error) => showBanner(safeMessage(error), 'error')));
  $('openFailuresFolder').addEventListener('click', () => suite().storage.openFolder('Failures').catch((error) => showBanner(safeMessage(error), 'error')));
  $('dashboardDiagnostics').addEventListener('click', () => { routeTo('diagnostics'); collectDiagnostics(); });
  $('settingsForm').addEventListener('submit', saveSettings);
  $('openConfigFolder').addEventListener('click', () => suite().storage.openFolder('Config').catch((error) => showBanner(safeMessage(error), 'error')));
  $('openCghsFolder').addEventListener('click', () => suite().storage.openFolder('CGHS').catch((error) => showBanner(safeMessage(error), 'error')));
  $('collectDiagnostics').addEventListener('click', collectDiagnostics);
  $('copyDiagnostics').addEventListener('click', copyDiagnostics);
  $('openDiagnosticsFolder').addEventListener('click', () => suite().diagnostics.openFolder().catch((error) => showBanner(safeMessage(error), 'error')));
}

async function initialize() {
  bind();
  routeTo('dashboard');
  await refreshState();
  try { await window.vnext?.reportRendererReady?.(); } catch (_) { /* legacy readiness signal is best effort */ }
}

initialize().catch((error) => {
  showBanner(safeMessage(error), 'error');
});
