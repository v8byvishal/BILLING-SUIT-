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
  if (/REVIEW|PARTIAL|NOT CONFIGURED|NOT VERIFIED|NOT STARTED|NONE|NOT_INITIALIZED|NO_MATCH|UNRESOLVED/.test(normalized)) return 'warn';
  if (/ERROR|FAILED|READ_ONLY|ACCESS|CORRUPT|INVALID|CONFLICT|REJECTED/.test(normalized)) return 'bad';
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
  setStatus('statusEnhancement', ui.resolutionResult?.status || state.enhancement?.status || 'NOT STARTED');
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
  text('dashboardEnhancement', ui.resolutionResult ? `${ui.resolutionResult.status} · ${ui.resolutionResult.resultCount || 0} resolution result(s)` : 'No resolution preview available.');
  text('dashboardFinalBill', state.finalBill?.status === 'NOT STARTED' ? 'Final bill workflow has not started.' : state.finalBill?.status);
  text('nextAction', bill.status === 'LOADED' ? 'Review deterministic resolution preview. Portal readiness remains NOT VERIFIED in Phase 4.' : 'Upload a source bill to begin.');
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
      cell.colSpan = 7;
      cell.textContent = 'No persisted source bill records found.';
      row.appendChild(cell);
      body.appendChild(row);
    } else {
      for (const record of ui.sourceRecords) {
        const meta = record.metadata || {};
        const row = document.createElement('tr');
        const parserSummary = record.parseResult ? `${record.parseResult.status} · ${record.parseResult.candidateCount || 0}` : 'NOT_STARTED';
        const resolutionSummary = record.resolutionResult ? `${record.resolutionResult.status} · ${record.resolutionResult.resultCount || 0}` : 'NOT_STARTED';
        for (const value of [meta.importedAt || '—', meta.billSessionId || record.billSessionId || '—', meta.originalFileName || '—', record.status || meta.status || '—', parserSummary, resolutionSummary, meta.sha256 ? `${meta.sha256.slice(0, 12)}…` : '—']) {
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

function renderPlan() {
  const resolution = ui.resolutionResult;
  text('enhancementState', resolution?.status || 'No resolution');
  text('enhancementBill', activeState().currentBill?.billSessionId ? `Active bill session: ${activeState().currentBill.billSessionId}` : 'No source bill is active.');
  text('executionStatus', 'Portal readiness has not been verified. ResolutionResult rows are not executable portal actions.');
  const body = $('planRows');
  body.replaceChildren();
  if (!resolution || !Array.isArray(resolution.results) || !resolution.results.length) {
    $('noPlanMessage').hidden = false;
    $('planTableWrap').hidden = true;
    text('reviewSummary', 'No ResolutionResult has been generated for the current bill.');
    text('enhancementDiagnostics', JSON.stringify({ registry: ui.registryStatus || null }, null, 2));
    return;
  }
  $('noPlanMessage').hidden = true;
  $('planTableWrap').hidden = false;
  for (const result of resolution.results || []) {
    const evidence = result.evidence?.[0] || {};
    const row = document.createElement('tr');
    const values = [
      evidence.pageNumber || '—',
      evidence.section || result.input?.section || '—',
      result.input?.description || '—',
      result.input?.codeRaw || '—',
      result.output?.finalCode || '—',
      result.output?.quantity ?? result.input?.quantity ?? '—',
      result.status,
      result.ruleId || result.registryEntryId || '—',
      evidence.sourceText ? `${evidence.sourceText.slice(0, 80)}${evidence.sourceText.length > 80 ? '…' : ''}` : result.reason
    ];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value == null || value === '' ? '—' : String(value);
      row.appendChild(cell);
    }
    body.appendChild(row);
  }
  const reviewCount = (resolution.results || []).filter((item) => ['REVIEW_REQUIRED', 'UNRESOLVED_MAPPING', 'RULE_CONFLICT', 'NO_MATCH', 'REJECTED'].includes(item.status)).length;
  text('reviewSummary', reviewCount ? `${reviewCount} resolution item(s) require review. Parser success did not force business-rule success.` : 'All resolution rows have deterministic validated/direct mappings. They are still not portal actions in Phase 4.');
  text('enhancementDiagnostics', JSON.stringify({ registryVersion: resolution.registryVersion, registrySourceHash: resolution.registrySourceHash, ruleSetVersion: resolution.ruleSetVersion, counts: resolution.counts }, null, 2));
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
    ui.parseResult = appState.currentBill?.billSessionId ? await suite().sourceBill.getParseResult(appState.currentBill.billSessionId).catch(() => null) : null;
    ui.resolutionResult = appState.currentBill?.billSessionId ? await suite().resolution.getResult(appState.currentBill.billSessionId).catch(() => null) : null;
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
