'use strict';

let portalPreview = null;

function text(id, value) { document.getElementById(id).textContent = value; }

function displayNumber(value) { return value == null ? '—' : String(value); }

function renderPlan(plan) {
  const view = document.getElementById('planView');
  const rows = document.getElementById('planRows');
  rows.replaceChildren();
  for (const entry of plan.entries) {
    const row = document.createElement('tr');
    const values = [
      entry.code,
      displayNumber(entry.quantity),
      displayNumber(entry.rate),
      displayNumber(entry.amount),
      entry.rule_id || entry.source,
      entry.status
    ];
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = value || '—';
      row.appendChild(cell);
    }
    rows.appendChild(row);
  }
  text('rateSource', `${plan.rate_source.source_kind} · ${plan.rate_source.authority_status} · ${plan.rate_source.record_count} records`);
  text('planWarning', plan.warnings.length ? plan.warnings.join(', ') : 'Source verified');
  view.hidden = false;
  document.getElementById('portalView').hidden = false;
}

async function selectAndParseBill() {
  const button = document.getElementById('selectBill');
  const resultPanel = document.getElementById('parseResult');
  resultPanel.hidden = false;
  button.disabled = true;
  text('parseStatus', 'PARSING');
  text('parseMessage', 'Reading PDF and preserving page-level source context…');
  try {
    const result = await window.vnext.selectAndParseBill();
    if (result.canceled) {
      text('parseStatus', 'IDLE');
      text('parseMessage', 'No PDF selected.');
      return;
    }
    const bill = result.bill;
    const primaryItems = bill.items.filter((item) => item.included_in_primary_bill).length;
    text('parseStatus', 'PARSED');
    text('parsedFile', bill.source.file_name);
    text('parsedPages', bill.metadata.page_count);
    text('parsedItems', primaryItems);
    text('excludedSections', bill.excluded_sections.length);
    text('parseMessage', `${bill.sections.length} primary section(s), ${bill.parsing_audit.compound_expressions.length} compound expression(s), ${bill.bed_details.length} Bed Detail row(s), ${result.enhancementPlan.entries.length} plan entry/entries. No portal operation was performed.`);
    renderPlan(result.enhancementPlan);
    text('appState', 'BILL_LOADED');
  } catch (error) {
    text('parseStatus', 'ERROR');
    text('parseMessage', error.message || 'Unable to parse the selected bill.');
    text('appState', 'ERROR');
  } finally {
    button.disabled = false;
  }
}

async function preparePortal() {
  try {
    portalPreview = await window.vnext.previewPortalActions();
    document.getElementById('portalView').hidden = false;
    text('portalStatus', 'READY FOR REVIEW');
    text('portalSummary', `${portalPreview.actions.length} executable action(s); ${portalPreview.blocked.length} blocked/review action(s). Verify the authenticated portal session before execution.`);
    document.getElementById('executePortal').disabled = portalPreview.actions.length === 0;
  } catch (error) { text('portalStatus', 'ERROR'); text('portalSummary', error.message); }
}

async function executePortal() {
  if (!portalPreview || !window.confirm(`Execute ${portalPreview.actions.length} verified action(s) in the live portal?`)) return;
  const button = document.getElementById('executePortal');
  button.disabled = true;
  text('portalStatus', 'EXECUTING');
  try {
    const audit = await window.vnext.executePortalActions();
    text('portalStatus', audit.status);
    text('portalSummary', `Verified results: ${audit.counts.EXECUTED} executed, ${audit.counts.ALREADY_PRESENT} already present, ${audit.counts.FAILED} failed, ${audit.counts.UNKNOWN} unknown, ${audit.counts.BLOCKED} blocked.`);
    const output = document.getElementById('portalAudit');
    output.textContent = JSON.stringify(audit, null, 2);
    output.hidden = false;
  } catch (error) { text('portalStatus', 'FAILED'); text('portalSummary', error.message); }
  finally { button.disabled = false; }
}

async function initialize() {
  try {
    const [status, storage, config] = await Promise.all([
      window.vnext.getStatus(),
      window.vnext.getStorageInfo(),
      window.vnext.getConfig()
    ]);
    text('appState', status.ready ? status.state : 'Unavailable');
    text('storageState', storage.writable ? 'Ready and writable' : 'Unavailable');
    text('environment', config.environment);
    text('version', `Version ${config.version}`);
    text('storagePath', storage.path);
    text('readyStatus', 'Application ready');
    document.querySelector('.dot').classList.add('ready');
    document.getElementById('selectBill').addEventListener('click', selectAndParseBill);
    document.getElementById('preparePortal').addEventListener('click', preparePortal);
    document.getElementById('executePortal').addEventListener('click', executePortal);
    await window.vnext.reportRendererReady();
  } catch (error) {
    text('readyStatus', 'Startup error');
    text('appState', 'ERROR');
    console.error(error);
  }
}

initialize();
