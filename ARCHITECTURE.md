# Architecture

This repository is a local vanilla Electron/JavaScript desktop application. Phase 5 adds a deterministic `EnhancementPlan` layer on top of the Phase 3 parser and Phase 4 registry/rule-resolution foundation.

Detailed storage/parser/registry/plan documentation:

- `docs/ARCHITECTURE.md`
- `docs/PARSER_PIPELINE.md`
- `docs/PARSER_REGRESSION.md`
- `docs/CGHS_REGISTRY_AUDIT.md`
- `docs/CGHS_REGISTRY.md`
- `docs/RULE_RESOLUTION.md`
- `docs/ENHANCEMENT_PLAN.md`
- `docs/PLAN_VALIDATION.md`
- `docs/PHASE_04_IMPLEMENTATION.md`
- `docs/PHASE_05_IMPLEMENTATION.md`

## Runtime layering

```text
Renderer UI (src/ui, vanilla HTML/CSS/JS)
  ↓ controlled preload API: window.cghsSuite
Preload bridge (src/desktop/preload.js)
  ↓ declared IPC operation contract
Electron main process (src/desktop/main.js)
  ↓ service orchestration
StorageService (src/core/storage.js)
  ↓ external Storage root outside application package
Source parser (src/services/bill-ingestion/source-parser.js)
  ↓ ParserResult evidence only
CGHS registry and deterministic resolver
  ↓ ResolutionResult interpretation only
EnhancementPlanBuilder
  ↓ deterministic plan data
EnhancementPlanValidator
  ↓ validated/review/blocked intermediate artifact
Later phases only: portal validation, final-bill composition, final PDF output
```

The renderer does not directly access Node filesystem APIs, shell commands, Python, Selenium, CGHS rule internals, source PDF bytes, registry files, arbitrary Storage manipulation, or final output writers. Privileged work flows through the preload bridge and declared IPC handlers.

## Source to plan lifecycle

```text
Operator selects PDF
  -> StorageService.importSourceBill()
  -> Storage/Source_Bills/<billSessionId>/source.pdf
  -> parseStoredSourceBill()
  -> Storage/Source_Bills/<billSessionId>/parse-result.json
  -> resolveParseResult()
  -> Storage/Source_Bills/<billSessionId>/resolution-result.json
  -> EnhancementPlanBuilder.build()
  -> EnhancementPlanValidator.validate()
  -> Storage/Source_Bills/<billSessionId>/enhancement/plan.json
  -> Storage/Source_Bills/<billSessionId>/enhancement/plan-summary.json
  -> EnhancementPlan UI tabs/tables
```

The parser preserves evidence. The resolver interprets evidence through registry/rule authority. The plan gates validated evidence into data-only actions, review items, and excluded items. No layer in Phase 5 creates portal automation commands.

## External Storage root

The canonical default root is resolved from Electron's standard application data location:

```text
<ApplicationData>/CGHS-Billing-Suite/Storage
```

Runtime user data must stay outside the application package.

## Registry storage

```text
Storage/CGHS/registries/
Storage/CGHS/rules/
Storage/CGHS/validation/
Storage/CGHS/active-registry.json
```

Source-level seed/fixture registry data may live in Git only when non-sensitive and clearly marked. Runtime active registry data is written to external Storage and must not be committed.

## Enhancement plan storage

Phase 5 stores per-source-bill plan artifacts under the source bill folder:

```text
Storage/Source_Bills/<billSessionId>/enhancement/plan.json
Storage/Source_Bills/<billSessionId>/enhancement/plan-summary.json
```

Operational plans may contain patient-sensitive evidence snippets and must remain runtime data, not committed fixtures. Only synthetic non-PHI test fixtures live under `tests/fixtures/plans/`.

## Active registry

`ActiveRegistryStore` validates and persists registries. A `FAIL` registry cannot be activated. Active registry references include registry version, source hash, validation path, authority status, activation timestamp, and audit event.

No approved official CGHS master/rate source exists in this checkout. The bundled HFOS snapshot can be installed as `UNVERIFIED`, producing registry status `PARTIAL`.

## Resolver contract

`src/services/cghs/rule-resolution.js` exports rule-set version `4.0.0` and produces `ResolutionResult` records. Resolver output includes candidate id, bill session, parser run id, registry context, rule-set version, selected rule/registry reference, status, reason, evidence, output code/quantity when validated, and conflicts.

The resolver does not produce `PortalAction` objects.

## EnhancementPlan contract

`src/services/cghs/plan-builder.js` converts parser/resolution evidence into a schema-versioned plan. It never repairs resolver output and never adds hidden mappings. Validated rows become `actions[]`; uncertain rows become `reviewItems[]`; Patient Payable/non-domain/unsupported/rejected/duplicate rows become `excludedItems[]`.

`src/services/cghs/plan-validator.js` independently validates schema, context, actions, reviews, exclusions, aggregation, source-candidate coverage, stale state, hash integrity, and security boundaries.

## Safety boundaries

Phase 5 does not change or invoke:

- portal automation;
- Selenium/CDP behavior;
- Python portal executor contract;
- CGHS login or credential handling;
- automatic discharge;
- final-bill generation/composition;
- final PDF output.

No `eval()`, `new Function()`, arbitrary shell execution, or dynamic execution of registry/rule/plan fields is used.
