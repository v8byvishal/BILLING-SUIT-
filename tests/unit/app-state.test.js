'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { WORKFLOW_STATES, createAppState } = require('../../src/core/app-state');

test('application state starts IDLE and only accepts declared future workflow states', () => {
  const state = createAppState();
  assert.equal(state.get(), WORKFLOW_STATES.IDLE);
  assert.equal(state.set(WORKFLOW_STATES.ERROR), WORKFLOW_STATES.ERROR);
  assert.throws(() => state.set('FAKE_COMPLETE'), /Unknown application state/);
});
