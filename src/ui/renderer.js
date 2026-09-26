'use strict';

let portalPreview = null;
let currentReviewQueue = [];
let selectedReview = null;

function button(label, onClick) {
  const element = document.createElement('button'); element.type = 'button'; element.textContent = label; element.addEventListener('click', onClick); return element;
}

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
    await loadReviewQueue();
    text('appState', 'BILL_LOADED');
  } catch (error) {
    text('parseStatus', 'ERROR');
    text('parseMessage', error.message || 'Unable to parse the selected bill.');
    text('appState', 'ERROR');
  } finally {
    button.disabled = false;
  }
}

async function loadReviewQueue() {
  currentReviewQueue = await window.vnext.listReviewQueue();
  const body = document.getElementById('reviewRows'); body.replaceChildren();
  for (const record of currentReviewQueue) {
    const row = document.createElement('tr');
    for (const value of [record.code || record.raw_text, `${record.section || '—'} / ${record.source_page || '—'}`, displayNumber(record.quantity), record.status, record.reason]) {
      const cell = document.createElement('td'); cell.textContent = value || '—'; row.appendChild(cell);
    }
    const actions = document.createElement('td');
    actions.append(button('Review', () => window.alert(JSON.stringify(record, null, 2))));
    if (record.available_actions.includes('ADD_CUSTOM_CODE')) actions.append(button('Add custom', () => {
      selectedReview = record; document.getElementById('customCode').value = record.code || ''; document.getElementById('customCodeForm').hidden = false;
    }));
    actions.append(button('Dismiss', async () => {
      const operator = window.prompt('Operator identifier'); if (!operator) return;
      await window.vnext.recordReviewDecision({ action: 'REVIEWED', code: record.code, reason: 'DISMISSED_BY_OPERATOR', source: record.raw_text || record.reason, operator, bill_context: { review_id: record.review_id }, review_record: record });
      row.remove();
    }));
    row.appendChild(actions); body.appendChild(row);
  }
  text('reviewCount', `${currentReviewQueue.length} open`);
  document.getElementById('reviewView').hidden = currentReviewQueue.length === 0;
}

async function loadRegistry() {
  const result = await window.vnext.listCustomCodes({ query: document.getElementById('registrySearch').value });
  text('registryVersion', `Persistent local records · revision ${result.registry.revision} · ${result.registry.hash.slice(0, 12)}`);
  const body = document.getElementById('registryRows'); body.replaceChildren();
  for (const record of result.records) {
    const row = document.createElement('tr');
    for (const value of [record.code, record.description, record.override_authoritative ? 'CUSTOM OVERRIDE' : 'CUSTOM/LOCAL', record.active ? 'ACTIVE' : 'INACTIVE', record.source, record.updated_at]) {
      const cell = document.createElement('td'); cell.textContent = value || '—'; row.appendChild(cell);
    }
    const actions = document.createElement('td');
    actions.append(button('Edit', async () => {
      const description = window.prompt('Description', record.description); if (!description) return;
      const reason = window.prompt('Reason for update'); const source = window.prompt('Source / reference', record.source); const operator = window.prompt('Operator identifier');
      if (!reason || !source || !operator) return;
      await window.vnext.updateCustomCode(record.code, { description, reason, source, operator, quantity_behavior: record.quantity_behavior, fixed_quantity: record.fixed_quantity, rate: record.rate, unit: record.unit, notes: record.notes }); await loadRegistry();
    }));
    actions.append(button(record.active ? 'Deactivate' : 'Reactivate', async () => {
      const reason = window.prompt('Reason'); const source = window.prompt('Source / reference', record.source); const operator = window.prompt('Operator identifier'); if (!reason || !source || !operator) return;
      await window.vnext.setCustomCodeActive(record.code, !record.active, { reason, source, operator }); await loadRegistry(); await loadReviewQueue();
    }));
    actions.append(button('Audit', async () => { const audit = await window.vnext.getCustomCodeAudit(record.code); const output = document.getElementById('customAudit'); output.textContent = JSON.stringify(audit, null, 2); output.hidden = false; }));
    row.appendChild(actions); body.appendChild(row);
  }
}

async function saveCustomCode(event) {
  event.preventDefault();
  const behavior = document.getElementById('customQuantityBehavior').value;
  const rateText = document.getElementById('customRate').value;
  try {
    const result = await window.vnext.createCustomCode({
      code: document.getElementById('customCode').value, description: document.getElementById('customDescription').value,
      quantity_behavior: behavior, fixed_quantity: behavior === 'FIXED' ? Number(document.getElementById('customFixedQuantity').value) : null,
      reason: document.getElementById('customReason').value, source: document.getElementById('customSource').value,
      operator: document.getElementById('customOperator').value, rate: rateText === '' ? null : Number(rateText),
      override_authoritative: document.getElementById('customOverride').checked,
      bill_context: selectedReview ? { review_id: selectedReview.review_id } : null
    });
    document.getElementById('customCodeForm').reset(); document.getElementById('customCodeForm').hidden = true; selectedReview = null;
    if (result.enhancementPlan) renderPlan(result.enhancementPlan);
    await loadRegistry(); await loadReviewQueue();
  } catch (error) { window.alert(error.message); }
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
    document.getElementById('customCodeForm').addEventListener('submit', saveCustomCode);
    document.getElementById('cancelCustomCode').addEventListener('click', () => { document.getElementById('customCodeForm').hidden = true; selectedReview = null; });
    document.getElementById('registrySearch').addEventListener('input', loadRegistry);
    await loadRegistry();
    await window.vnext.reportRendererReady();
  } catch (error) {
    text('readyStatus', 'Startup error');
    text('appState', 'ERROR');
    console.error(error);
  }
}

initialize();
