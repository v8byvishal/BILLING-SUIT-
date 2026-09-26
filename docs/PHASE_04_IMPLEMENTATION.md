# Phase 04 Implementation — Authoritative CGHS Registry & Deterministic Rule Resolution

Date: 2026-09-27
Branch: `arena/01a0dfad-billing-suit`
Phase 3 baseline: `04aac2a373ef3cf12062a465d9fcbfdedf6bc8ff`

## Status

Phase 4 implementation is complete in this branch.

It adds a versioned registry architecture and deterministic rule resolver on top of the actual Phase 3 parser output. It does not rewrite the parser, does not invoke portal automation, and does not generate final bill PDFs.

## Implemented flow

```text
Source PDF
  -> Phase 3 Parser Evidence
  -> Candidate
  -> Registry Lookup
  -> Rule Resolution
  -> ResolutionResult
  -> REVIEW_REQUIRED / VALIDATED_MAPPING / DIRECT_REGISTRY_MATCH
```

`ResolutionResult` is evidence/business interpretation only. It is not a `PortalAction`.

## New modules

- `src/services/cghs/registry.js`
  - registry schema and authority constants;
  - deterministic source hashing;
  - JSON/CSV registry import;
  - legacy rate-source conversion;
  - registry validation;
  - effective-date-aware lookup;
  - active registry persistence under external Storage;
  - active registry diagnostics summary.

- `src/services/cghs/rule-resolution.js`
  - rule-set version `4.0.0`;
  - explicit rule objects;
  - conservative resolver;
  - conflict detection;
  - raw alias protection;
  - Phase 3 parse-result integration;
  - resolution persistence helper.

- `tests/unit/phase4-registry-resolution.test.js`
  - 47 Phase 4 registry/resolution tests covering the requested matrix.

## Storage additions

Phase 4 uses Phase 2 external Storage:

```text
Storage/CGHS/registries/
Storage/CGHS/rules/
Storage/CGHS/validation/
Storage/CGHS/active-registry.json
Storage/Source_Bills/<billSessionId>/resolution-result.json
```

No runtime `Storage/CGHS/*` state is committed to Git.

## Registry status

No approved official CGHS master/rate source was found in the repository.

The bundled `src/services/cghs/data/hfos-reference-rates.json` can be installed as the default active registry with:

```text
authorityStatus = UNVERIFIED
registry status = PARTIAL
```

This gives traceability and versioning but does not allow direct executable/validated mappings from the unverified snapshot.

## Active registry mechanism

`ActiveRegistryStore` persists:

- registry JSON;
- validation report;
- active registry pointer;
- activation audit event.

Invalid registries cannot become active. Active registry load checks validation and source hash before resolution.

## Rule set

Rule set version:

```text
4.0.0
```

Counts:

- total rules: 20
- validated rules: 16
- review rules: 4

## Locked mappings

Implemented as explicit named rules:

- `CGHS_C_004_NIV_MACHINE_PER_DAY`
- `CGHS_C_008_BLOOD_TRANSFUSION`
- `CGHS_C_010_ENDOTRACHEAL_INTUBATION`
- `CGHS_C_011_CENTRAL_LINE`
- `CGHS_C_012_NEBULIZER_THERAPY`
- `CGHS_C_014_RYLES_TUBE_INSERTION`

Each rule requires exact raw code plus documented semantic context. The resolver does not broaden them into a blanket `C -> CC` rule.

## C002 rules

Implemented:

- `C002_OXYGEN_HALF_DAY` -> `CC002`, quantity `12`;
- `C002_OXYGEN_FULL_DAY` -> `CC002`, quantity `24`;
- `C002_PACKED_CELLS_REVIEW` -> `REVIEW_REQUIRED`.

Packed Cells / Blood Bank contexts are separated and do not resolve to `CC002` merely because `C002` appears.

## C003 rules

Implemented as review-required:

- `C003_VENTILATOR_REVIEW`
- `C003_FRESH_FROZEN_PLASMA_REVIEW`

The resolver never invents `CC003`.

## Derived rules

Implemented:

- `CC001_ICU_COUNT_DERIVED`
- `WC001_WARD_COUNT_DERIVED`
- `CN002_ICU_WARD_FORMULA`

Missing/ambiguous ICU or ward evidence produces review-required. Missing counts are not treated as zero.

## Category composition rules

Implemented as explicit families:

- `CATEGORY_CGHS_L_B_TO_LB`
- `CATEGORY_CGHS_RI_NUMERIC_TO_RI`
- `CATEGORY_CGHS_CI_NUMERIC_TO_CI`
- `CATEGORY_CGHS_G_P_TO_GP`
- `CATEGORY_CGHS_P_T_TO_PT`

No broad prefix concatenation function is used.

## Raw alias protection

Protected raw aliases:

```text
C002, C003, C008, C010, C011, C012, C014, N002, P001, T004, T005
```

Tests prove raw aliases do not become final codes unless an explicit validated rule matches.

## Phase 3 integration

After `parseStoredSourceBill()` succeeds, the main process resolves the persisted parser candidates and stores:

```text
Storage/Source_Bills/<billSessionId>/resolution-result.json
```

Duplicate source bill imports reuse existing parse results and recompute/persist missing resolution results.

The Phase 3 Description `(C008)` parser output is fed to the Phase 4 resolver in tests:

- `Blood Transfusion Charge (C008)` -> `VALIDATED_MAPPING` to `CC008` only because context matches `CGHS_C_008_BLOOD_TRANSFUSION`.
- insufficient `C008` context -> `REVIEW_REQUIRED`.

## UI additions

- Diagnostics/settings show registry state:
  - status;
  - version;
  - source;
  - hash;
  - total/validated/review rule counts.
- Source Bills list shows resolution summary.
- Enhancement workspace now shows resolution preview columns:
  - Page
  - Section
  - Description
  - Raw Code
  - Resolved Code
  - Quantity
  - Status
  - Rule
  - Evidence

The preview is not shown as portal-executable action.

## Safety guarantees

- No parser rewrite.
- No portal automation change.
- No Selenium/CDP/Python portal execution from Phase 4.
- No final bill PDF generation.
- No invented rates.
- No official-data claim without a real official source.
- No blanket `C -> CC` transform.
- No `C003 -> CC003` invention.
- No fuzzy match can produce `VALIDATED_MAPPING`.
- No `eval()` or `new Function()`.
- Resolution records contain registry version, source hash, rule-set version, rule id or registry entry id, authority status, reason, and evidence.

## Test matrix implemented

Registry:

1. valid registry load
2. invalid registry load
3. source hash
4. duplicate code
5. conflicting code
6. missing authority
7. missing source reference
8. date validation
9. active registry selection
10. registry persistence
11. invalid active registry block
12. CSV import
13. syntactic normalization only

Resolution:

14. exact registry code match
15. C004 mapping
16. C008 mapping
17. C010 mapping
18. C011 mapping
19. C012 mapping
20. C014 mapping
21. C002 oxygen half day
22. C002 oxygen full day
23. C002 packed cells review
24. C003 ventilator review
25. C003 FFP review
26. CC001 ICU derived
27. WC001 ward derived
28. CN002 formula
29. category compositions
30. raw alias protection
31. no blanket C->CC
32. rule conflict
33. missing authority
34. ambiguous context
35. deterministic repeated resolution
36. registry version reproducibility
37. Patient Payable separation
38. compound expression preservation
39. invented code prevention
40. unsupported alias
41. fuzzy match cannot validate
42. effective-date/date-unverified review
43. invalid active registry cannot resolve
44. parser candidate cannot become executable
45. Phase 3 C008 parser output into resolver
46. resolution persistence
47. default rule fixture coverage

## Validation status

Commands executed:

```bash
node --check src/services/cghs/registry.js src/services/cghs/rule-resolution.js src/services/cghs/index.js src/core/storage.js src/desktop/main.js src/desktop/ipc-contract.js src/desktop/preload.js src/ui/renderer.js tests/unit/phase4-registry-resolution.test.js
node --test tests/unit/phase3-source-parser.test.js
node --test tests/unit/phase4-registry-resolution.test.js
npm test
python3 -m unittest discover -s tests/python -p 'test_*.py'
npm run test:desktop
```

Results:

| Check | Result |
|---|---|
| Syntax checks | PASS |
| Phase 3 parser regression | PASS — 31/31 |
| Phase 4 registry/resolution tests | PASS — 47/47 |
| Full Node suite | PASS — 391/391 |
| Python unittest suite | PASS — 32/32 |
| Desktop smoke | BLOCKED before launch — Electron binary unavailable because install scripts were skipped; error: `Electron failed to install correctly`. |

## Authoritative data validation

`AUTHORITATIVE_DATA_VALIDATION`: `NOT AVAILABLE`

Reason: no approved official CGHS master/rate source exists in this checkout. Phase 4 validates architecture, source hierarchy, deterministic rules, and review-required behavior, not external CGHS production rates.
