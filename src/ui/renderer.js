'use strict';

function text(id, value) { document.getElementById(id).textContent = value; }

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
    text('parseMessage', `${bill.sections.length} primary section(s), ${bill.parsing_audit.compound_expressions.length} compound expression(s), ${bill.bed_details.length} Bed Detail row(s). Review is required; no CGHS calculations were performed.`);
    text('appState', 'BILL_LOADED');
  } catch (error) {
    text('parseStatus', 'ERROR');
    text('parseMessage', error.message || 'Unable to parse the selected bill.');
    text('appState', 'ERROR');
  } finally {
    button.disabled = false;
  }
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
    await window.vnext.reportRendererReady();
  } catch (error) {
    text('readyStatus', 'Startup error');
    text('appState', 'ERROR');
    console.error(error);
  }
}

initialize();
