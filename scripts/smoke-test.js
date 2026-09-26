'use strict';

const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const storagePath = fs.mkdtempSync(path.join(os.tmpdir(), 'vnext-desktop-smoke-'));
const electron = require('electron');
let command = electron;
let args = [root];

if (process.platform === 'linux' && spawnSync('which', ['xvfb-run']).status === 0) {
  command = 'xvfb-run';
  args = ['-a', electron, root];
}

const child = spawn(command, args, {
  cwd: root,
  env: { ...process.env, VNEXT_SMOKE_TEST: '1', VNEXT_STORAGE_PATH: storagePath },
  stdio: ['ignore', 'pipe', 'pipe']
});
let output = '';
child.stdout.on('data', (data) => { output += data; });
child.stderr.on('data', (data) => { output += data; });
const timer = setTimeout(() => { child.kill('SIGKILL'); }, 20000);

child.on('exit', (code, signal) => {
  clearTimeout(timer);
  const logsDir = path.join(storagePath, 'Logs');
  const files = fs.existsSync(logsDir) ? fs.readdirSync(logsDir).filter((name) => name.endsWith('.log')) : [];
  const log = files.length ? fs.readFileSync(path.join(logsDir, files[0]), 'utf8') : '';
  const checks = [
    ['desktop exited cleanly', code === 0 && signal === null],
    ['startup logged', log.includes('Application startup')],
    ['renderer loaded and IPC worked', log.includes('Renderer ready')],
    ['shutdown logged', log.includes('Application shutdown requested')]
  ];
  const failures = checks.filter(([, ok]) => !ok);
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (failures.length) {
    if (output) console.error(output);
    process.exit(1);
  }
});
