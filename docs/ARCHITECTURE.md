# Architecture — Phase 6 Portal Safety Boundary

CGHS Billing & Enhancement Suite V2 remains a local vanilla Electron/JavaScript desktop application. Phase 6 adds an independent backend portal preflight and safe execution gate after the deterministic Phase 5 `EnhancementPlan` layer.

## Boundary diagram

```text
Renderer UI
  ↓ window.cghsSuite only
Preload bridge
  ↓ cghs-suite IPC contract
Electron main process
  ↓ controlled service calls
StorageService
  ↓ immutable source artifact and persisted parser result
Source parser
  ↓ ParserResult evidence candidates
CGHS registry + deterministic resolver
  ↓ ResolutionResult JSON
EnhancementPlanBuilder
  ↓ plan.json + plan-summary.json
EnhancementPlanValidator
  ↓ current/stale/hash/source validation
PortalExecutionGate
  ↓ explicit START ENHANCEMENT + READY preflight
PortalPreflightService
  ↓ independent CDP/portal/auth/control/context checks
PortalExecutionService
  ↓ state machine, persistence, retry/cancel/recovery
PortalAdapter
  ↓ narrow allowlisted JSON bridge
Existing Python bridge / Selenium / CDP implementation
  ↓ observed portal mutation + verification
Persisted portal run + summary
```

Renderer code must not access arbitrary filesystem APIs, child processes, Python, Selenium, registry files, source PDF bytes, Storage folder manipulation, CGHS rule internals, plan files directly, raw CDP operations, raw portal selectors, or shell operations.

## Source lifecycle

1. Operator selects a PDF.
2. Main process imports it through `StorageService.importSourceBill()`.
3. StorageService writes `Storage/Source_Bills/<billSessionId>/source.pdf` and `metadata.json`.
4. Parser reads the stored immutable copy.
5. Parser writes `parse-result.json` next to the source artifact.
6. Resolver reads parser candidates and active registry/rule set.
7. Resolver writes `resolution-result.json` next to the parser result.
8. Plan builder consumes parser + resolution output and writes `enhancement/plan.json` plus `enhancement/plan-summary.json`.
9. Plan validator independently validates persisted/current plan context.
10. Portal preflight checks backend-owned plan/source/CDP/portal readiness and writes immutable preflight snapshots.
11. Operator explicitly starts enhancement execution.
12. Execution service revalidates plan/preflight and persists run JSON/summary.
13. UI shows plan header, backend preflight checks, portal execution progress, actions, review-required rows, excluded rows, and diagnostics.

## Storage paths

```text
Storage/Source_Bills/<billSessionId>/source.pdf
Storage/Source_Bills/<billSessionId>/metadata.json
Storage/Source_Bills/<billSessionId>/parse-result.json
Storage/Source_Bills/<billSessionId>/resolution-result.json
Storage/Source_Bills/<billSessionId>/enhancement/plan.json
Storage/Source_Bills/<billSessionId>/enhancement/plan-summary.json
Storage/Source_Bills/<billSessionId>/execution/<preflightId>.preflight.json
Storage/Source_Bills/<billSessionId>/execution/latest.preflight.json
Storage/Source_Bills/<billSessionId>/execution/<runId>.json
Storage/Source_Bills/<billSessionId>/execution/<runId>-summary.json
```

Runtime Storage data belongs outside the Electron installation directory and must not be committed.

## Registry service

`src/services/cghs/registry.js` owns registry schema, source hierarchy, source hash calculation, import, validation, effective-date-aware lookup, active registry persistence, and registry status summary.

## Resolver service

`src/services/cghs/rule-resolution.js` owns rule-set version `4.0.0`, explicit rules, deterministic handlers, conflict detection, raw alias protection, Phase 3 parser integration, and resolution run summaries.

The resolver is conservative: unresolved, unverified, ambiguous, stale/date-unknown, fuzzy, and conflicting evidence remains review-required.

## Plan builder service

`src/services/cghs/plan-builder.js` owns deterministic Phase 5 plan construction, action gating, review-item construction, excluded-item construction, deterministic aggregation, quantity derivation provenance, plan hash/id calculation, and plan summary creation.

The builder does not redo registry resolution, repair invalid resolver output, infer semantic code mappings, or create portal commands.

## Plan validator service

`src/services/cghs/plan-validator.js` owns schema/type validation, status/readiness validation, registry/rule context validation, action/review/exclusion validation, quantity/unit validation, source-candidate membership, stale-context detection, security field scans, and canonical hash verification.

## Portal services

Phase 6 portal code lives in `src/services/portal/`:

- `portal-contract.js` — constants for action/run states, failure codes, audit events, and final-code pattern.
- `cdp-health-check.js` — independent `/json/list` CDP health and target discovery.
- `portal-preflight-service.js` — fail-closed plan/source/CDP/portal/auth/control/context readiness checks.
- `portal-execution-gate.js` — persisted-plan execution gate requiring explicit operator start.
- `safe-portal-execution-service.js` — execution state machine, persistence, duplicate/quantity/retry/cancel/recovery handling.
- `legacy-portal-adapter.js` — narrow Phase 6 bridge to existing Python/Selenium implementation.

## UI / IPC additions

Controlled IPC/preload operations:

- `registry.getStatus()`
- `resolution.getStatus()`
- `resolution.getResult(billSessionId)`
- `enhancement.buildPlan(billSessionId)`
- `enhancement.getPlan(billSessionId)`
- `enhancement.getPlanSummary(billSessionId)`
- `enhancement.validatePlan(billSessionId)`
- `enhancement.rebuildPlan(billSessionId)`
- `portal.preflight(input)`
- `portal.getPreflight(input)`
- `portal.revalidate(input)`
- `portal.startExecution(input)`
- `portal.getExecution(input)`
- `portal.getExecutionSummary(input)`
- `portal.cancelExecution(input)`

UI additions:

- Registry status in Settings/status strip.
- Resolution summary in persisted Source Bills list.
- EnhancementPlan header with version/id/hash/readiness.
- Backend Portal Readiness panel with preflight checks.
- Portal Execution monitor with persisted progress/action states.
- Actions, Review Required, Excluded, and Diagnostics tables.

Plan rows are data-only. Portal execution derives internal actions only from persisted validated plan actions.

## Official data status

No approved official CGHS master/rate source exists in this checkout. The bundled HFOS snapshot is machine-readable but unverified. It can provide traceability and candidate review, not direct production authority.

## Live portal status

No approved authenticated non-PHI live portal environment was available in this session.

```text
LIVE_PORTAL: NOT VERIFIED
```

## Security

- Registry, rule, and plan fields are data only.
- No JavaScript evaluation from registry/rule/plan files.
- No shell execution.
- No arbitrary Python operation exposure.
- No raw CDP operation exposure.
- No source PDF full-text dump into audit.
- No renderer-provided action list/selector/code/quantity can authorize execution.
- No credential entry/storage/automation.
- No cookies/tokens/browser profiles persisted.
- No discharge automation.
- No final PDF generation in Phase 6.
