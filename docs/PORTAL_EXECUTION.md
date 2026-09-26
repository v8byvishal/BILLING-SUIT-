# Portal Execution — Phase 06

Phase 6 introduces a safe backend execution pipeline that connects persisted Phase 5 `EnhancementPlan` actions to the existing legacy portal automation only after fail-closed preflight and explicit operator start.

## Pipeline

```text
Persisted EnhancementPlan
  -> PortalExecutionGate
  -> PortalPreflightService
  -> PortalExecutionService
  -> PortalAdapter
  -> existing Python bridge / Selenium / CDP implementation
  -> post-action verification
  -> persisted execution result
```

## Operator start requirement

Execution never starts automatically after:

- PDF upload;
- parsing;
- resolution;
- plan generation;
- portal/CDP detection;
- preflight success;
- application startup.

The backend requires `operatorConfirmed === true`; the UI surfaces the explicit wording `START ENHANCEMENT` before calling the controlled IPC operation.

## Trusted data source

Execution loads authoritative plan data from Storage:

```text
Storage/Source_Bills/<billSessionId>/enhancement/plan.json
```

It does not accept renderer-provided action lists, selectors, commands, quantities, codes, validation flags, or portal readiness booleans. Internal execution actions are derived only from persisted validated plan actions.

## Execution action model

Each persisted action is converted to a narrow internal action:

```json
{
  "executionActionId": "...",
  "actionId": "...",
  "executionOrder": 1,
  "code": "CC001",
  "finalCode": "CC001",
  "description": "...",
  "quantity": 2,
  "unit": "unit",
  "speciality": "...",
  "authority": {},
  "provenance": {},
  "state": "PENDING"
}
```

Allowed final codes must match `C###` or `CC###` and must come from a validated `finalCode` / resolved final code. Execution never performs `Cxxx -> CCxxx` aliasing and never reconstructs a code from description.

## Action states

Implemented action states:

- `PENDING`
- `PREFLIGHT_BLOCKED`
- `SEARCHING`
- `MATCHED`
- `QUANTITY_CHECK`
- `APPLYING`
- `VERIFYING`
- `SUCCESS`
- `DUPLICATE`
- `SKIPPED`
- `RETRYING`
- `FAILED`
- `CANCELLED`

## Run states

Implemented run states:

- `NOT_STARTED`
- `PREFLIGHT`
- `READY`
- `RUNNING`
- `PAUSED`
- `CANCELLING`
- `COMPLETED`
- `COMPLETED_WITH_FAILURES`
- `BLOCKED`
- `FAILED`
- `CANCELLED`

## Per-action safe sequence

For each action:

1. Check cancellation.
2. Search portal deterministically using exact final code.
3. Reject no-match or ambiguous match.
4. Inspect existing exact-code rows.
5. If desired quantity already exists, mark `DUPLICATE` without mutation.
6. Reconcile quantity delta.
7. Block unsupported quantity reduction.
8. Block locked quantity fields when desired quantity cannot be proven safe.
9. Apply bounded mutation through the adapter.
10. Verify final portal state independently.
11. Persist action result and run summary.

Success means the desired portal state was observed after mutation. A click or Python return alone is not success.

## Retry behavior

Retries are bounded. On timeout the service re-reads portal state before deciding whether another attempt is safe. If mutation is uncertain, it fails closed instead of blind retrying.

## Concurrency lock

`PortalExecutionService` keeps an in-process lock per `billSessionId`. A second execution start for the same bill session is rejected with `CONCURRENCY_LOCKED`.

## Cancellation

`portal.cancelExecution` requests cancellation for a running service instance. The service checks before each action and persists partial results. It never marks a cancelled/partial run as fully successful.

## Persistence

Execution state is persisted under:

```text
Storage/Source_Bills/<billSessionId>/execution/<runId>.json
Storage/Source_Bills/<billSessionId>/execution/<runId>-summary.json
```

Preflight snapshots are stored in the same execution directory as `*.preflight.json`.

## Legacy adapter boundary

`LegacyPortalAdapter` creates narrow JSON requests for the existing Python bridge. Existing Selenium automation still performs its own exact search, duplicate handling, quantity handling, mutation, and verification internally; the Phase 6 state machine records these steps and fails closed around the legacy result. The only allowlisted operations are:

- `inspect_portal_state` for non-mutating backend preflight inspection;
- `execute_plan_action_batch` for validated action execution.

```json
{
  "contract_version": "1.0.0",
  "operation": "execute_plan_action_batch",
  "run_id": "...",
  "actions": [{ "action_id": "...", "cghs_code": "CC001", "quantity": 1 }],
  "source": "phase6-safe-execution"
}
```

No shell command, selector, raw CDP operation, arbitrary Python operation, credential material, cookie, token, browser profile, or discharge operation is passed through this boundary.

## Current live status

Mocked deterministic Phase 6 portal tests pass. Live portal execution remains:

```text
LIVE_PORTAL: NOT VERIFIED
```
