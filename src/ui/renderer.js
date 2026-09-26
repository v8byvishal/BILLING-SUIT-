'use strict';

function text(id, value) { document.getElementById(id).textContent = value; }

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
    await window.vnext.reportRendererReady();
  } catch (error) {
    text('readyStatus', 'Startup error');
    text('appState', 'ERROR');
    console.error(error);
  }
}

initialize();
