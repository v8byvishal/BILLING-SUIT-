'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

class LegacyPythonRunner {
  constructor(options = {}) {
    this.python = options.python || process.env.VNEXT_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
    this.script = options.script || path.join(__dirname, 'portal_bridge.py');
    this.cwd = options.cwd || path.resolve(__dirname, '..', '..', '..');
    this.timeoutMs = options.timeoutMs || 30 * 60 * 1000;
  }

  execute(request) {
    return new Promise((resolve, reject) => {
      const child = spawn(this.python, [this.script], { cwd: this.cwd, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error('Legacy portal executor timed out'));
      }, this.timeoutMs);
      child.stdout.on('data', (chunk) => { stdout += chunk; });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', (error) => { clearTimeout(timer); reject(new Error(`Unable to start legacy Python executor: ${error.message}`)); });
      child.on('exit', (code) => {
        clearTimeout(timer);
        const marker = stdout.split(/\r?\n/).reverse().find((line) => line.startsWith('VNEXT_RESULT='));
        if (!marker) return reject(new Error(`Legacy executor returned no structured result (exit ${code}): ${stderr || stdout}`));
        try {
          const result = JSON.parse(marker.slice('VNEXT_RESULT='.length));
          result.executor_log = stdout.split(/\r?\n/).filter((line) => line && !line.startsWith('VNEXT_RESULT='));
          result.executor_stderr = stderr || null;
          resolve(result);
        } catch (error) { reject(new Error(`Invalid legacy executor result: ${error.message}`)); }
      });
      child.stdin.end(JSON.stringify(request));
    });
  }
}

module.exports = { LegacyPythonRunner };
