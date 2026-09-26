# Project Memory

Read this file first for current implementation state. Source audit evidence is in `docs/SOURCE_AUDIT.md` and `docs/CGHS_REGISTRY_AUDIT.md`. Phase implementation notes are in `docs/PHASE_01_IMPLEMENTATION.md`, `docs/PHASE_02_IMPLEMENTATION.md`, `docs/PHASE_03_IMPLEMENTATION.md`, and `docs/PHASE_04_IMPLEMENTATION.md`.

## Current Project Status

- **Current branch:** `arena/01a0dfad-billing-suit`
- **Phase 3 baseline:** `04aac2a373ef3cf12062a465d9fcbfdedf6bc8ff` / `phase-03-source-pdf-ingestion`
- **Phase 4 commit target:** `phase-04: add authoritative CGHS registry and deterministic resolution`
- **Product version:** `5.0.0-rc.2`
- **Current milestone:** Phase 4 Authoritative CGHS Registry & Deterministic Rule Resolution implemented in the working tree.
- **Overall status:** Source PDF ingestion and parser evidence from Phase 3 now feed a deterministic Phase 4 registry/rule resolver. Resolution output is persisted and previewed in UI. Electron runtime launch remains environment-blocked because dependencies were installed with scripts skipped and the Electron binary is unavailable.

## Phase 4 implementation summary

Implemented:

- `src/services/cghs/registry.js` with registry schema, source hierarchy, source hashing, JSON/CSV import, validation, effective-date lookup, active registry persistence, and diagnostics summary.
- `src/services/cghs/rule-resolution.js` with `RULE_SET_VERSION = '4.0.0'`, explicit rule objects, deterministic resolution, conflict detection, raw alias protection, and Phase 3 parse-result integration.
- `Storage/CGHS/registries`, `Storage/CGHS/rules`, `Storage/CGHS/validation`, and `Storage/CGHS/active-registry.json` as runtime external Storage paths.
- `Storage/Source_Bills/<billSessionId>/resolution-result.json` persistence.
- Desktop IPC/preload APIs for registry status and resolution result preview.
- UI registry status and resolution preview.
- 47 Phase 4 registry/resolution tests and golden fixtures under `tests/fixtures/registry`, `tests/fixtures/rules`, and `tests/fixtures/resolution`.

## Registry authority status

No approved official CGHS master/rate source exists in this repository.

The bundled HFOS snapshot at `src/services/cghs/data/hfos-reference-rates.json` is machine-readable and can be installed into Storage as a partial active registry, but it remains:

```text
authorityStatus = UNVERIFIED
registry status = PARTIAL
```

Exact matches from that snapshot are traceable but review-required. They are not production CGHS authority.

## Rule-set identity

- Rule set version: `4.0.0`
- Total default rules: 20
- Validated rules: 16
- Review rules: 4

Locked rules implemented explicitly:

- `CGHS_C_004_NIV_MACHINE_PER_DAY`
- `CGHS_C_008_BLOOD_TRANSFUSION`
- `CGHS_C_010_ENDOTRACHEAL_INTUBATION`
- `CGHS_C_011_CENTRAL_LINE`
- `CGHS_C_012_NEBULIZER_THERAPY`
- `CGHS_C_014_RYLES_TUBE_INSERTION`
- `C002_OXYGEN_HALF_DAY`
- `C002_OXYGEN_FULL_DAY`
- `CC001_ICU_COUNT_DERIVED`
- `WC001_WARD_COUNT_DERIVED`
- `CN002_ICU_WARD_FORMULA`
- category composition rules for `LBxxx`, `RIxxx`, `CIxxx`, `GPxxx`, and `PTxxx`.

Review-only/protection rules:

- `C002_PACKED_CELLS_REVIEW`
- `C003_VENTILATOR_REVIEW`
- `C003_FRESH_FROZEN_PLASMA_REVIEW`
- `RAW_ALIAS_PROTECTION`

## Safety constraints to preserve

- Parser output is evidence only, not business validation.
- `ResolutionResult` rows are not executable portal actions.
- Do not map `C008 -> CC008`, `C002 -> CC002`, `C003 -> CC003`, or any raw alias unless an explicit validated rule matches.
- Do not invent rates, official registry data, source dates, quantities, or registry authority.
- Do not let fuzzy/description matches become `VALIDATED_MAPPING`.
- Do not call Selenium, CDP, Python portal executor, portal bridge, external APIs, final bill PDF generation, automatic discharge, or credential handling from Phase 4.
- Do not use `eval()`, `new Function()`, shell execution, arbitrary rule expressions, or dynamic code from registry files.
- Missing/ambiguous evidence means `REVIEW_REQUIRED`, not zero or guessed output.
- Patient Payable remains separate from main CGHS resolution.

## Phase 3 parser regression status

Phase 3 parser version remains `3.0.0`.

The Phase 4 resolver consumes actual Phase 3 parser candidates. Tests verify `Blood Transfusion Charge (C008)` preserves parser `codeRaw = C008` and resolves to `CC008` only when the validated rule context matches. Insufficient context remains `REVIEW_REQUIRED`.

`REAL_PDF_REGRESSION`: `NOT AVAILABLE — synthetic fixtures used`. No approved real hospital-bill PDF fixture exists in this checkout.

## Validation log

Validation commands run during Phase 4 implementation:

- `node --check src/services/cghs/registry.js src/services/cghs/rule-resolution.js src/services/cghs/index.js src/core/storage.js src/desktop/main.js src/desktop/ipc-contract.js src/desktop/preload.js src/ui/renderer.js tests/unit/phase4-registry-resolution.test.js` — PASS.
- `node --test tests/unit/phase3-source-parser.test.js` — PASS, 31/31 tests.
- `node --test tests/unit/phase4-registry-resolution.test.js` — PASS, 47/47 tests.
- `npm test` — PASS, 391/391 tests.
- `python3 -m unittest discover -s tests/python -p 'test_*.py'` — PASS, 32/32 tests.
- `npm run test:desktop` — FAIL/BLOCKED before Electron launch: `Electron failed to install correctly` after dependency install with scripts skipped.

Known environment notes:

- Electron runtime smoke is not a product PASS in this environment unless a real Electron launch succeeds.
- Live CGHS portal validation is not verified.
- Authoritative official CGHS master/rate validation is not available.
- Real PDF regression is not available; only synthetic non-PHI fixtures were used.
