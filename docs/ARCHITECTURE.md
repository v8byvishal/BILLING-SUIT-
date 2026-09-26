# Architecture — Phase 5 EnhancementPlan Boundary

CGHS Billing & Enhancement Suite V2 remains a local vanilla Electron/JavaScript desktop application. Phase 5 adds a deterministic `EnhancementPlan` layer after Phase 4 registry/rule resolution.

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
  ↓ pass/warn/fail validation result
Later phases only: portal validation and final-bill generation
```

Renderer code must not access arbitrary filesystem APIs, child processes, Python, Selenium, registry files, source PDF bytes, Storage folder manipulation, CGHS rule internals, or plan files directly.

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
10. UI shows plan header, actions, review-required rows, excluded rows, and diagnostics.

## Storage paths

```text
Storage/Source_Bills/<billSessionId>/source.pdf
Storage/Source_Bills/<billSessionId>/metadata.json
Storage/Source_Bills/<billSessionId>/parse-result.json
Storage/Source_Bills/<billSessionId>/resolution-result.json
Storage/Source_Bills/<billSessionId>/enhancement/plan.json
Storage/Source_Bills/<billSessionId>/enhancement/plan-summary.json
```

Runtime Storage data belongs outside the Electron installation directory and must not be committed.

## Registry service

`src/services/cghs/registry.js` owns registry schema, source hierarchy, source hash calculation, import, validation, effective-date-aware lookup, active registry persistence, and registry status summary.

## Resolver service

`src/services/cghs/rule-resolution.js` owns rule-set version `4.0.0`, explicit rules, deterministic handlers, conflict detection, raw alias protection, Phase 3 parser integration, and resolution run summaries.

The resolver is conservative: unresolved, unverified, ambiguous, stale/date-unknown, fuzzy, and conflicting evidence remains review-required.

## Plan builder service

`src/services/cghs/plan-builder.js` owns:

- `PLAN_VERSION = "5.0.0"` via validator constants;
- deterministic plan construction;
- action gating;
- review-item construction;
- excluded-item construction;
- deterministic aggregation;
- quantity derivation provenance;
- plan hash/id calculation;
- plan summary creation.

The builder does not redo registry resolution, does not repair invalid resolver output, and does not infer semantic code mappings.

## Plan validator service

`src/services/cghs/plan-validator.js` owns:

- schema/type validation;
- status/readiness validation;
- registry/rule context validation;
- action/review/exclusion validation;
- quantity/unit validation;
- source-candidate membership and no-silent-discard checks;
- aggregation checks;
- security field scans;
- stale-context detection;
- canonical hash verification.

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

UI additions:

- Registry status in Settings/status strip.
- Resolution summary in persisted Source Bills list.
- EnhancementPlan header with version/id/hash/readiness.
- Actions, Review Required, Excluded, and Diagnostics tables.

Plan rows are data-only and are not portal-executable commands.

## Official data status

No approved official CGHS master/rate source exists in this checkout. The bundled HFOS snapshot is machine-readable but unverified. It can provide traceability and candidate review, not direct production authority.

## Security

- Registry, rule, and plan fields are data only.
- No JavaScript evaluation from registry/rule/plan files.
- No shell execution.
- No external API lookup during normal resolution/plan building.
- No source PDF full-text dump into audit.
- No portal automation call from Phase 5.
- No credential entry/storage in plan or UI.
- No final PDF generation in Phase 5.
