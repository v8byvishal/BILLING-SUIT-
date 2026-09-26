'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { OPERATIONS, OPERATION_SET, validateOperationRequest } = require('../../src/desktop/ipc-contract');
const { createIpcDispatcher } = require('../../src/desktop/phase1-ipc');

test('P1-09 IPC contract accepts only declared operations and rejects invalid requests', () => {
  assert.equal(OPERATION_SET.has(OPERATIONS.APP_GET_STATUS), true);
  assert.deepEqual(validateOperationRequest({ operation: OPERATIONS.APP_GET_STATUS, payload: { ok: true } }), { operation: OPERATIONS.APP_GET_STATUS, payload: { ok: true } });
  assert.throws(() => validateOperationRequest({ operation: 'execute(command,payload)', payload: { command: 'rm' } }), /Unsupported IPC operation/);
  assert.throws(() => validateOperationRequest(null), /IPC request must be an object/);
});

test('P1-10 invalid IPC request rejection is fail-closed at dispatcher boundary', async () => {
  const dispatch = createIpcDispatcher({ [OPERATIONS.APP_GET_STATUS]: () => ({ ready: true }) });
  assert.deepEqual(await dispatch({ operation: OPERATIONS.APP_GET_STATUS }), { ready: true });
  await assert.rejects(() => dispatch({ operation: OPERATIONS.BILL_SELECT }), /not implemented/);
  await assert.rejects(() => dispatch({ operation: 'runShell' }), /Unsupported IPC operation/);
});

test('P1-11 renderer contract does not declare arbitrary Node, Python, shell, or command execution operations', () => {
  const operations = [...OPERATION_SET].join('\n');
  assert.doesNotMatch(operations, /runArbitraryNodeCode|runPython|runShell|executeJS|execute\(command/i);
});

test('P1-15 preload exposes one controlled app API and no arbitrary Node command bridge', () => {
  const preload = fs.readFileSync(path.join(__dirname, '../../src/desktop/preload.js'), 'utf8');
  assert.match(preload, /exposeInMainWorld\('cghsSuite'/);
  assert.doesNotMatch(preload, /exposeInMainWorld\(('|")?(node|fs|shell|python|childProcess)/i);
  assert.doesNotMatch(preload, /runShell|runPython|executeJS|runArbitraryNodeCode|execute\s*:\s*|command\s*=>/i);
});
