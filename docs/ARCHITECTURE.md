# Architecture — Phase 4 Registry and Deterministic Resolution

CGHS Billing & Enhancement Suite V2 remains a local vanilla Electron/JavaScript desktop application. Phase 4 adds a registry/rule-resolution layer after Phase 3 parser evidence extraction.

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
  ↓ parser evidence candidates
CGHS registry + deterministic resolver
  ↓ ResolutionResult JSON
Existing EnhancementPlan / portal / final-bill services remain separate
```

Renderer code must not access arbitrary filesystem APIs, child processes, Python, Selenium, registry files, source PDF bytes, Storage folder manipulation, or CGHS rule internals.

## Source lifecycle

1. Operator selects a PDF.
2. Main process imports it through `StorageService.importSourceBill()`.
3. StorageService writes `Storage/Source_Bills/<billSessionId>/source.pdf` and `metadata.json`.
4. Parser reads the stored immutable copy.
5. Parser writes `parse-result.json` next to the source artifact.
6. Resolver reads parser candidates and active registry/rule set.
7. Resolver writes `resolution-result.json` next to the parser result.
8. UI previews parser candidates and resolution results.

## Registry service

`src/services/cghs/registry.js` owns:

- registry schema;
- source hierarchy;
- source hash calculation;
- JSON/CSV import;
- conversion of legacy `records[]` rate snapshots;
- registry validation;
- effective-date-aware exact lookup;
- active registry persistence;
- registry status summary for UI/diagnostics.

## Registry paths

```text
Storage/CGHS/registries/
Storage/CGHS/rules/
Storage/CGHS/validation/
Storage/CGHS/active-registry.json
```

Runtime registry data belongs in external Storage, not in the Electron installation directory.

## Resolver service

`src/services/cghs/rule-resolution.js` owns:

- `RULE_SET_VERSION = "4.0.0"`;
- explicit rule objects;
- deterministic rule handlers;
- conflict detection;
- raw alias protection;
- Phase 3 parser integration;
- resolution run summaries.

The resolver is conservative: unresolved, unverified, ambiguous, stale/date-unknown, fuzzy, and conflicting evidence remains review-required.

## Resolution persistence

```text
Storage/Source_Bills/<billSessionId>/resolution-result.json
```

The persisted result includes registry version, registry source hash, rule-set version, selected rule or registry entry, status, reason, evidence, and conflicts.

## UI / IPC additions

Controlled IPC/preload operations:

- `registry.getStatus()`
- `resolution.getStatus()`
- `resolution.getResult(billSessionId)`

UI additions:

- Registry status in Settings/status strip.
- Resolution summary in persisted Source Bills list.
- Resolution preview in Enhancement workspace.

These UI rows are not portal-executable actions.

## Official data status

No approved official CGHS master/rate source exists in this checkout. The bundled HFOS snapshot is machine-readable but unverified. It can provide traceability and candidate review, not direct executable authority.

## Security

- Registry fields are data only.
- No JavaScript evaluation from registry/rule files.
- No shell execution.
- No external API lookup during normal resolution.
- No source PDF full-text dump into audit.
- No portal automation call from Phase 4.
