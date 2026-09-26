# Portal Audit — Phase 06

Date: 2026-09-27
Branch: `arena/01a0dfad-billing-suit`

## Purpose

Phase 6 is the first phase allowed to connect a Phase 5 validated `EnhancementPlan` to the existing portal automation. This audit documents the existing portal execution flow before wrapping it with independent preflight, an execution gate, persistence, and safe state handling.

## Existing portal components inspected

| Area | Existing file / location | Finding |
|---|---|---|
| Selenium launcher / driver creation | `app (1).py`, `BatchAutomationThread.run()` | Uses Selenium Chrome `Options()` with `debuggerAddress = 127.0.0.1:9222`, retries three times, and attaches to an operator-owned Chrome session. |
| CDP endpoint | `app (1).py`, `BatchAutomationThread.run()`; `portal_bridge.py` result metadata | Fixed expected endpoint is `127.0.0.1:9222`. Phase 5/legacy execution only learned failure after runner invocation. |
| Python bridge | `src/adapters/legacy-portal/portal_bridge.py` | Narrow JSON stdin/stdout bridge. It imports `app (1).py`, supports non-mutating inspection, and invokes `BatchAutomationThread` only for validated execution. Phase 6 hardened it with explicit allowlisted operations: `inspect_portal_state` and `execute_plan_action_batch`. |
| Node Python runner | `src/adapters/legacy-portal/python-runner.js` | Uses `spawn()` with `shell:false`, fixed executable/bridge arguments, structured JSON stdin, and `VNEXT_RESULT=` stdout marker. |
| Node legacy execution service | `src/services/portal/portal-execution-service.js` | Phase 4/legacy adapter path for older EnhancementPlan format. Preserved for regression, but direct legacy UI execution is disabled in Phase 6. |
| Plan adapter | `src/adapters/legacy-portal/plan-adapter.js` | Converts old plan entries to legacy portal actions and blocks unsupported/review entries. Phase 6 uses a new Phase 5 plan-derived action model instead. |
| Portal page detection / controls | `app (1).py`, `LOCATORS` | Existing trusted selectors target Treatment Plan header, Procedure input, Dropdown options, Speciality input/clear, Quantity input, Reason dropdown, Plus button, table rows, procedure name, and amount inputs. |
| Procedure search | `ProcedureSelector.execute()` | Types a portal target code, searches dropdown options, and selects only options matching exact code tokens via `option_matches_exact_code`. |
| Option selection | `portal_execution_core.py` and `app (1).py` | Uses exact code token matching; multiple or absent exact matches are not selected. |
| Duplicate handling | `TreatmentPlanOrchestrator._is_code_already_in_portal()`, `_should_add_unit()`, transaction registry | Detects existing exact-code rows and maintains unit/transaction state to avoid duplicate Plus clicks. |
| Quantity handling | `QuantityController`, `_process_editable_quantity()`, `_process_locked_quantity()` | Handles editable quantity fields and locked quantity workflows separately; locked quantity may require unit-by-unit additions. |
| Locked quantity detection | `QuantityController.is_locked()` | Checks disabled/readonly/aria-disabled/class/is_enabled and logs `LOCKED-QTY`. |
| Speciality handling | `SpecialitySynchronizer`, `SpecialityClearController`, `_reconcile_speciality_lock()` | Preserves speciality synchronization and controlled clear/re-sync behavior. |
| Retries | `portal_execution_core.py` and `app (1).py` | Offline core has bounded retries; production orchestrator avoids blind duplicate Plus retry and reconciles portal rows before failure/success classification. |
| Screenshots / DOM diagnostics | `DiagnosticEngine.capture_artifact()` | Captures screenshot, DOM, and metadata under `audit_failures/` on significant failures. Phase 6 records structured failure references in Storage and does not commit artifacts. |
| Batch execution | `BatchAutomationThread.run()` | Executes patient/bill queue item by item, with cancellation flag checked before scheduling new items. |
| Existing tests | `tests/unit/portal-adapter.test.js`, `tests/python/test_portal_execution_core.py` | Existing Node and Python portal-boundary tests remain part of regression. |

## Existing flow before Phase 6

```text
Old plan / legacy UI request
  -> plan-adapter.js
  -> portal-execution-service.js
  -> python-runner.js
  -> portal_bridge.py
  -> app (1).py BatchAutomationThread
  -> Selenium attaches to Chrome CDP 127.0.0.1:9222
  -> TreatmentPlanOrchestrator
  -> procedure search / speciality / quantity / plus / verification
  -> structured legacy results
```

## Trust weakness fixed by Phase 6

Audit finding from Phase 0:

> Backend portal preflight currently trusts UI-supplied booleans rather than independently proving CDP/authenticated portal readiness.

Phase 6 fixes this by adding backend-owned services:

```text
EnhancementPlan
  -> PortalPreflightService
  -> PortalExecutionGate
  -> PortalExecutionService
  -> LegacyPortalAdapter / Python bridge
```

Renderer claims such as `cdpReady=true` or `authenticated=true` are not accepted. Backend preflight loads the persisted plan, revalidates hash/stale/source context, independently checks CDP target availability, and requires trusted portal inspector results for identity, authentication, controls, blocking state, and bill context.

## Protected existing automation

Phase 6 does not rewrite `app (1).py`. It preserves existing Selenium/CDP behavior and wraps it with:

- independent preflight;
- current-plan revalidation;
- explicit operator start;
- per-action execution state;
- duplicate and quantity reconciliation before mutation;
- post-action verification requirements;
- cancellation and persistence;
- mock adapter tests for portal-free validation.

## Live portal status

No authenticated controlled CGHS portal session is available in this checkout/session. Live portal validation is therefore:

```text
LIVE_PORTAL: NOT VERIFIED
```
