# Project Memory

Read this file first for current implementation state. Source audit evidence is in `docs/SOURCE_AUDIT.md` and `docs/CGHS_REGISTRY_AUDIT.md`. Phase implementation notes are in `docs/PHASE_01_IMPLEMENTATION.md`, `docs/PHASE_02_IMPLEMENTATION.md`, `docs/PHASE_03_IMPLEMENTATION.md`, `docs/PHASE_04_IMPLEMENTATION.md`, and `docs/PHASE_05_IMPLEMENTATION.md`.

## Current Project Status

- **Current branch:** `arena/01a0dfad-billing-suit`
- **Phase 3 baseline:** `04aac2a373ef3cf12062a465d9fcbfdedf6bc8ff` / `phase-03-source-pdf-ingestion`
- **Phase 4 baseline:** `dd7f943969d456eee0b3465e407dc570d2310eb6` / `phase-04-cghs-registry`
- **Product version:** `5.0.0-rc.2`
- **Current milestone:** Phase 5 Deterministic `EnhancementPlan` Generation & Validation implemented in the working tree.
- **Overall status:** Source PDF ingestion and parser evidence from Phase 3 feed Phase 4 deterministic registry/rule resolution. Phase 5 now builds and validates a deterministic `EnhancementPlan` with actions, review items, excluded items, diagnostics, hash/id, Storage persistence, controlled IPC, and UI plan tables. Electron runtime launch remains environment-blocked because dependencies were installed with scripts skipped and the Electron binary is unavailable.

## Phase 5 implementation summary

Implemented:

- `src/services/cghs/plan-builder.js` with deterministic plan construction, action gating, review/exclusion preservation, conservative aggregation, derivation provenance, plan hash/id, and summary creation.
- `src/services/cghs/plan-validator.js` with independent schema, context, action, review, exclusion, quantity/unit, source-membership, aggregation, stale, hash, and security validation.
- `Storage/Source_Bills/<billSessionId>/enhancement/plan.json` and `plan-summary.json` persistence through `StorageService`.
- Desktop IPC/preload APIs for `enhancement.buildPlan`, `enhancement.getPlan`, `enhancement.getPlanSummary`, `enhancement.validatePlan`, and `enhancement.rebuildPlan`.
- Enhancement UI plan header with version/id/hash/readiness plus Actions, Review Required, Excluded, and Diagnostics tables.
- Audit events for plan build, validation, readiness, review-required, stale, and failed build outcomes.
- Synthetic non-PHI 50-case matrix and golden plan fixture under `tests/fixtures/plans/`.

## EnhancementPlan identity

- Plan schema version: `1`
- Plan version: `5.0.0`
- Plan hash: deterministic SHA-256 over canonical plan content excluding `createdAt`, `planSha256`, `validation`, `runtimeDiagnostics`, and `planId`.
- Plan ID: `plan-<first 16 chars of planSha256>`.

`EnhancementPlan` is a trusted intermediate artifact only. It is not portal execution, Selenium/CDP automation, credential handling, final bill composition, or final PDF output.

## Action-gating rules to preserve

A plan action requires:

- current source candidate from the same `billSessionId`;
- source candidate status `VALID_EVIDENCE`;
- resolution status `VALIDATED_MAPPING` or `DIRECT_REGISTRY_MATCH`;
- executable authority;
- validated rule when a rule is referenced;
- final code;
- valid quantity and supported unit;
- no unresolved conflict;
- matching registry version/source hash and rule-set version;
- candidate not excluded.

Forbidden from actions: `REVIEW_REQUIRED`, `UNRESOLVED_MAPPING`, `RULE_CONFLICT`, `PROVISIONAL`, `UNVERIFIED`, `BLOCKED`, `REJECTED`, and `NO_MATCH`.

Protected raw aliases remain protected unless an explicit validated rule produced the final code:

```text
C002 C003 C008 C010 C011 C012 C014 N002 P001 T004 T005
```

No blanket `C -> CC` rule exists.

## Review/exclusion behavior

- `reviewItems[]` preserve evidence, input, resolution status/reference, reason, reason code, and required evidence.
- `excludedItems[]` preserve evidence for Patient Payable, non-domain, unsupported, rejected, and duplicate parser candidates.
- Parser evidence is never silently discarded; each parser candidate must be represented as action, review, or excluded evidence when validation context supplies source candidate ids.
- Patient Payable remains separate from main CGHS enhancement actions.

## Quantity behavior

Missing quantity is review-required, never `1`. Invalid quantity is review-required, never `0`.

Supported quantity failures include `QUANTITY_MISSING`, `QUANTITY_INVALID`, `QUANTITY_NAN`, `QUANTITY_INFINITY`, `QUANTITY_ZERO`, `QUANTITY_NEGATIVE`, `QUANTITY_ABSURDLY_LARGE`, and `QUANTITY_PRECISION_UNSUPPORTED`.

Only validated Phase 4 rules derive quantities such as C002 oxygen half/full day and CN002 formula outputs.

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
- `EnhancementPlan` actions are data-only and not portal commands.
- Do not map raw aliases unless an explicit validated rule matches.
- Do not invent rates, official registry data, source dates, quantities, parser output, portal readiness, or final PDFs.
- Do not let fuzzy/description matches become `VALIDATED_MAPPING`.
- Do not call Selenium, CDP, Python portal executor, portal bridge, external APIs, final bill PDF generation, automatic discharge, or credential handling from Phase 5.
- Do not use `eval()`, `new Function()`, shell execution, arbitrary rule expressions, or dynamic code from registry/rule/plan files.
- Missing/ambiguous evidence means `REVIEW_REQUIRED`, not zero or guessed output.
- Patient Payable remains separate from main CGHS enhancement actions.

## Phase 3 parser regression status

Phase 3 parser version remains `3.0.0`.

The Phase 4 resolver consumes actual Phase 3 parser candidates. Tests verify `Blood Transfusion Charge (C008)` preserves parser `codeRaw = C008` and resolves to `CC008` only when the validated rule context matches. Phase 5 then gates that validated resolution into an `EnhancementPlan` action only when quantity/context/authority gates pass.

`REAL_PDF_REGRESSION`: `NOT AVAILABLE — synthetic fixtures used`. No approved real hospital-bill PDF fixture exists in this checkout.

## Validation log

Validation commands run during Phase 5 implementation:

- `npm ci --ignore-scripts` — PASS for dependency installation; reported 14 npm audit vulnerabilities (13 high, 1 critical), no remediation attempted.
- `node --check src/services/cghs/plan-validator.js src/services/cghs/plan-builder.js src/core/storage.js src/services/cghs/index.js src/desktop/main.js src/desktop/ipc-contract.js src/desktop/preload.js src/ui/renderer.js tests/unit/phase5-enhancement-plan.test.js` — PASS.
- `node --test tests/unit/phase1-ipc-contract.test.js tests/unit/phase3-source-parser.test.js tests/unit/phase4-registry-resolution.test.js tests/unit/phase5-enhancement-plan.test.js` — PASS, 92/92 tests.
- `node --test tests/unit/phase5-enhancement-plan.test.js` — PASS, 10/10 subtests including 50-case matrix fixture.
- `npm test` — PASS, 401/401 tests.
- `python3 -m unittest discover -s tests/python -p 'test_*.py'` — PASS, 32/32 tests.
- `npm run test:desktop` — BLOCKED before Electron launch: `Electron failed to install correctly` after dependency install with scripts skipped.

Known environment notes:

- Electron runtime smoke is not a product PASS in this environment unless a real Electron launch succeeds.
- Live CGHS portal validation is not verified.
- Authoritative official CGHS master/rate validation is not available.
- Real PDF regression is not available; only synthetic non-PHI fixtures were used.
