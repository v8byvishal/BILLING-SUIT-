# Delivery Roadmap

This file records the current V2 phase status for this repository checkout. Source audit evidence is in `docs/SOURCE_AUDIT.md` and `docs/CGHS_REGISTRY_AUDIT.md`; implementation details are in the phase documents under `docs/`.

## Current roadmap position

| Phase | Objective | Status | Key outcome / limitation |
|---:|---|---|---|
| 0 | Source audit and safety baseline | Complete | Existing repository behavior and constraints were audited and preserved in `docs/SOURCE_AUDIT.md`. |
| 1 | Desktop Foundation, Application Shell & Safe Architecture | Complete | Vanilla Electron shell, controlled preload/IPC, initial external Storage foundation, app-state store, `billSessionId` isolation, settings, diagnostics, and Phase 1 tests. Desktop runtime launch remained environment-blocked. |
| 2 | External Storage, Persistent Runtime Data & Recovery Foundation | Complete | Authoritative `StorageService`, manifest, source/final/session/audit/failure/config persistence, SHA-256 integrity, duplicate detection, atomic JSON, corruption handling, temp recovery, storage diagnostics, UI storage views, and Phase 2 tests. |
| 3 | Source Bill PDF Ingestion, Evidence Extraction & Historical Parser Regression | Complete | Stored-source parser pipeline, page model, conservative normalization, section detection, evidence candidates, parser result persistence, Source Bills UI, synthetic Description `(CODE)` regression coverage. Real hospital-bill fixture unavailable. |
| 4 | Authoritative CGHS Registry & Deterministic Rule Resolution | Complete | Versioned registry architecture, active registry storage, registry validator, deterministic resolver, explicit locked rules, conflict detection, raw alias protection, resolution persistence, UI preview, and 47 Phase 4 tests. Official CGHS master/rate source unavailable, so registry authority is partial/unverified. |
| 5 | Deterministic EnhancementPlan Generation & Validation | Implemented in this branch | Deterministic plan builder/validator, action/review/exclusion gating, quantity validation, protected-alias enforcement, plan hash/id, Storage persistence, controlled IPC, UI plan tables, 50-case matrix, and golden fixtures. Portal execution/final PDF remain not implemented. |
| 6 | Final bill composition/output | Not started | Phase 5 does not generate final PDFs. |
| 7 | Portal readiness/live automation validation | Not started / not verified | Existing portal executor is preserved; authenticated live portal validation is not claimed. |

## Phase 5 acceptance scope

Phase 5 acceptance is limited to safe deterministic `EnhancementPlan` construction and validation:

- consume Phase 3 `ParserResult` and Phase 4 `ResolutionResult`;
- produce schema-versioned plan artifacts;
- persist plan and summary under the source-bill enhancement folder;
- gate executable action rows through validated evidence, authority, quantity, context, registry/rule version, and conflict checks;
- preserve uncertain rows as review-required;
- preserve Patient Payable/non-domain/unsupported/rejected/duplicate rows as excluded evidence;
- validate quantities without defaulting missing/invalid values;
- enforce protected raw alias handling and no blanket `C -> CC` mapping;
- independently validate schema, context, provenance, source-candidate membership, aggregation, stale state, hash integrity, and security boundaries;
- expose controlled IPC and UI plan views.

## Explicit non-goals for Phase 5

- Do not invoke portal automation.
- Do not invoke Selenium, Chrome, CDP, `portal_bridge`, or Python portal executor.
- Do not store or request credentials/cookies/tokens.
- Do not perform automatic discharge.
- Do not compose or generate final bill PDFs.
- Do not invent CGHS codes, rates, authority, quantities, parser output, final PDFs, or portal readiness.
- Do not map raw aliases by blanket prefix logic.
- Do not treat parser success or resolver success alone as portal readiness.

## Validation categories

Use exact status language:

- **PASS** only when the command/check actually ran and succeeded.
- **FAIL** only when the command/check actually ran and failed.
- **BLOCKED** when an environment or dependency prevents a check.
- **NOT RUN** when no attempt was made.
- **NOT VERIFIED** for portal/runtime/real-PDF/official-data claims requiring unavailable authenticated, approved, or platform-specific validation.
