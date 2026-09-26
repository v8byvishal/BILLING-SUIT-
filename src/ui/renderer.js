'use strict';

const ui = {
  route: 'dashboard',
  appState: null,
  diagnostics: null,
  settings: null
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
  if (/READY|LOADED|EXECUTED|GENERATED|PASS/.test(normalized)) return 'good';
  if (/REVIEW|NOT VERIFIED|NOT STARTED|NONE|NOT_INITIALIZED/.test(normalized)) return 'warn';
  if (/ERROR|FAILED|READ_ONLY|ACCESS/.test(normalized)) return 'bad';
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
  setStatus('statusEnhancement', state.enhancement?.status || 'NOT STARTED');
  setStatus('statusPortal', state.portal?.status || 'NOT VERIFIED');
  setStatus('statusFinalBill', state.finalBill?.status || 'NOT STARTED');
}

function renderDashboard() {
  const state = activeState();
  const bill = state.currentBill || {};
  const metadata = bill.metadata || {};
  text('dashboardState', state.appStatus?.status || 'STARTING');
  text('dashboardStoragePath', state.storageStatus?.path || 'Storage unavailable');
  text('dashboardSession', bill.billSessionId || 'NONE');
  text('dashboardBill', bill.status === 'LOADED' ? `${metadata.fileName || bill.source?.file_name || 'Source bill'} · ${metadata.billNumber || 'Bill number unavailable'}` : 'No source bill loaded.');
  text('dashboardEnhancement', state.enhancement?.plan ? `${state.enhancement.status} · ${state.enhancement.plan.entries?.length || 0} plan entr${state.enhancement.plan.entries?.length === 1 ? 'y' : 'ies'}` : 'No EnhancementPlan available.');
  text('dashboardFinalBill', state.finalBill?.status === 'NOT STARTED' ? 'Final bill workflow has not started.' : state.finalBill?.status);
  text('nextAction', bill.status === 'LOADED' ? 'Review the Enhancement workspace. Portal readiness remains NOT VERIFIED in Phase 1.' : 'Upload a source bill to begin.');
}

function renderSourceBill() {
  const bill = activeState().currentBill || {};
  const meta = bill.metadata || {};
  text('sourceState', bill.status || 'Empty');
  text('sourceSession', bill.billSessionId || 'NONE');
  text('sourceFile', meta.fileName || bill.source?.file_name || 'No source bill loaded.');
  text('sourcePages', meta.pages ?? '—');
  text('sourceBillNumber', meta.billNumber || '—');
  text('sourceIdentifiers', [meta.patientName, meta.uhid, meta.ipNumber].filter(Boolean).join(' · ') || '—');
  text('sourceSections', [...(meta.sections || []), ...(meta.excludedSections || []).map((x) => `${x} (excluded)`)].join(', ') || '—');
}

function renderPlan() {
  const enhancement = activeState().enhancement || {};
  const plan = enhancement.plan;
  text('enhancementState', enhancement.status || 'No plan');
  text('enhancementBill', activeState().currentBill?.billSessionId ? `Active bill session: ${activeState().currentBill.billSessionId}` : 'No source bill is active.');
  text('executionStatus', 'Portal readiness has not been verified. Live execution is not part of Phase 1 validation.');
  const body = $('planRows');
  body.replaceChildren();
  if (!plan) {
    $('noPlanMessage').hidden = false;
    $('planTableWrap').hidden = true;
    text('reviewSummary', 'No EnhancementPlan has been generated for the current bill.');
    text('enhancementDiagnostics', 'No enhancement diagnostics available.');
    return;
  }
  $('noPlanMessage').hidden = true;
  $('planTableWrap').hidden = false;
  for (const entry of plan.entries || []) {
    const row = document.createElement('tr');
    const evidence = entry.provenance?.[0] || {};
    const values = [entry.code, entry.quantity, entry.status, entry.rule_id || entry.source || '—', evidence.source_section ? `${evidence.source_section} / page ${evidence.source_page || '—'}` : '—'];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value == null || value === '' ? '—' : String(value);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  const reviewCount = (plan.execution_summary?.review_required || []).length;
  text('reviewSummary', reviewCount ? `${reviewCount} review-required record(s).` : 'No review-required records reported by the current plan.');
  text('enhancementDiagnostics', JSON.stringify({ warnings: plan.warnings || [], rate_source: plan.rate_source || null }, null, 2));
}

function renderFinalBill() {
  const finalBill = activeState().finalBill || {};
  text('finalBillState', finalBill.status || 'NOT STARTED');
}

function renderHistory() {
  const records = activeState().history || [];
  text('historyCount', `${records.length} record${records.length === 1 ? '' : 's'}`);
  const body = $('historyRows');
  body.replaceChildren();
  if (!records.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No historical operations recorded in this session.';
    row.appendChild(cell);
    body.appendChild(row);
    return;
  }
  for (const record of records) {
    const row = document.createElement('tr');
    for (const value of [record.timestamp, record.billSessionId || '—', record.operation, record.status, record.error_code || '—']) {
      const cell = document.createElement('td');
      cell.textContent = value;
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
    ui.appState = await suite().app.getStatus();
    ui.settings = await suite().settings.get();
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
    else if (result.duplicate) showBanner(`Exact duplicate source. Existing case ${result.case?.case_id || 'unknown'} owns this hash.`, 'warning');
    else showBanner(`Source bill loaded for session ${result.billSessionId}.`, 'success');
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
  $('openFinalFolder').addEventListener('click', () => suite().storage.openFolder('Final_Bills').catch((error) => showBanner(safeMessage(error), 'error')));
  $('dashboardDiagnostics').addEventListener('click', () => { routeTo('diagnostics'); collectDiagnostics(); });
  $('settingsForm').addEventListener('submit', saveSettings);
  $('openConfigFolder').addEventListener('click', () => suite().storage.openFolder('Config').catch((error) => showBanner(safeMessage(error), 'error')));
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
