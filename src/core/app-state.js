'use strict';

const WORKFLOW_STATES = Object.freeze({
  IDLE: 'IDLE',
  BILL_LOADED: 'BILL_LOADED',
  ANALYZING: 'ANALYZING',
  ENHANCEMENT_RUNNING: 'ENHANCEMENT_RUNNING',
  ENHANCEMENT_COMPLETE: 'ENHANCEMENT_COMPLETE',
  WAITING_FOR_HUMAN_VERIFICATION: 'WAITING_FOR_HUMAN_VERIFICATION',
  FINAL_BILL_LOADED: 'FINAL_BILL_LOADED',
  COMPOSING: 'COMPOSING',
  SAVED: 'SAVED',
  ERROR: 'ERROR'
});

function createAppState() {
  let current = WORKFLOW_STATES.IDLE;
  return Object.freeze({
    get: () => current,
    set: (next) => {
      if (!Object.values(WORKFLOW_STATES).includes(next)) throw new Error(`Unknown application state: ${next}`);
      current = next;
      return current;
    },
    snapshot: () => Object.freeze({ workflow: current })
  });
}

module.exports = { WORKFLOW_STATES, createAppState };
