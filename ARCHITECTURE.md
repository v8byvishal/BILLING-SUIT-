# Architecture

This repository is a local vanilla Electron/JavaScript desktop application. Phase 4 adds a versioned CGHS registry and deterministic rule-resolution layer on top of the Phase 3 source parser and Phase 2 external Storage foundation.

Detailed storage/parser/registry documentation:

- `docs/ARCHITECTURE.md`
- `docs/PARSER_PIPELINE.md`
- `docs/PARSER_REGRESSION.md`
- `docs/CGHS_REGISTRY_AUDIT.md`
- `docs/CGHS_REGISTRY.md`
- `docs/RULE_RESOLUTION.md`
- `docs/PHASE_04_IMPLEMENTATION.md`

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
  ↓ parser evidence output only
CGHS registry and deterministic resolver
  ↓ ResolutionResult output only
Existing domain services and adapters
  ↓ later phases only
Legacy Python/Selenium/CDP portal executor
```

The renderer does not directly access Node filesystem APIs, shell commands, Python, Selenium, CGHS rule internals, source PDF bytes, registry files, or arbitrary Storage manipulation. Privileged work flows through the preload bridge and declared IPC handlers.

## Source to resolution lifecycle

```text
Operator selects PDF
  -> StorageService.importSourceBill()
  -> Storage/Source_Bills/<billSessionId>/source.pdf
  -> parseStoredSourceBill()
  -> Storage/Source_Bills/<billSessionId>/parse-result.json
  -> resolveParseResult()
  -> Storage/Source_Bills/<billSessionId>/resolution-result.json
  -> Source Bills and Enhancement resolution-preview UI
```

The parser preserves evidence. The resolver interprets evidence through registry/rule authority. Neither layer creates portal actions.

## External Storage root

The canonical default root is resolved from Electron's standard application data location:

```text
<ApplicationData>/CGHS-Billing-Suite/Storage
```

Runtime user data must stay outside the application package.

## Registry storage

Phase 4 adds:

```text
Storage/CGHS/registries/
Storage/CGHS/rules/
Storage/CGHS/validation/
Storage/CGHS/active-registry.json
```

Source-level seed/fixture registry data may live in Git only when non-sensitive and clearly marked. Runtime active registry data is written to external Storage and must not be committed.

## Active registry

`ActiveRegistryStore` validates and persists registries. A `FAIL` registry cannot be activated. Active registry references include registry version, source hash, validation path, authority status, activation timestamp, and audit event.

No approved official CGHS master/rate source exists in this checkout. The bundled HFOS snapshot can be installed as `UNVERIFIED`, producing registry status `PARTIAL`.

## Resolver contract

`src/services/cghs/rule-resolution.js` exports rule-set version `4.0.0` and produces `ResolutionResult` records. Resolver output includes:

- candidate id;
- bill session id;
- parser run id;
- registry version;
- registry source hash;
- rule-set version;
- input evidence;
- output candidate final code/quantity when validated;
- selected rule id or registry entry id;
- authority status;
- reason;
- evidence;
- conflicts.

The resolver does not produce `PortalAction` objects.

## Precedence

Resolution order is deterministic:

1. Patient Payable separation.
2. Compound-expression preservation.
3. Exact authoritative registry match for non-raw-alias final codes.
4. Explicit validated transformation rules.
5. Explicit derived rules.
6. Explicit category-composition rules.
7. Review-only/provisional/unverified/blocking rules.
8. Description/fuzzy candidate matches as review-only.
9. Raw alias protection.
10. No match.

Conflicting validated outputs return `RULE_CONFLICT`.

## Safety boundaries

Phase 4 does not change:

- parser PDF extraction semantics;
- legacy portal automation;
- Selenium/CDP behavior;
- Python executor contract;
- final-bill generation/composition;
- CGHS login/discharge handling.

No `eval()`, `new Function()`, arbitrary shell execution, or dynamic execution of registry/rule fields is used.
