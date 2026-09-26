# Delivery Roadmap

This file records the current V2 phase status for this repository checkout. Source audit evidence is in `docs/SOURCE_AUDIT.md` and `docs/CGHS_REGISTRY_AUDIT.md`; implementation details are in the phase documents under `docs/`.

## Current roadmap position

| Phase | Objective | Status | Key outcome / limitation |
|---:|---|---|---|
| 0 | Source audit and safety baseline | Complete | Existing repository behavior and constraints were audited and preserved in `docs/SOURCE_AUDIT.md`. |
| 1 | Desktop Foundation, Application Shell & Safe Architecture | Complete | Vanilla Electron shell, controlled preload/IPC, initial external Storage foundation, app-state store, `billSessionId` isolation, settings, diagnostics, and Phase 1 tests. Desktop runtime launch remained environment-blocked. |
| 2 | External Storage, Persistent Runtime Data & Recovery Foundation | Complete | Authoritative `StorageService`, manifest, source/final/session/audit/failure/config persistence, SHA-256 integrity, duplicate detection, atomic JSON, corruption handling, temp recovery, storage diagnostics, UI storage views, and Phase 2 tests. |
| 3 | Source Bill PDF Ingestion, Evidence Extraction & Historical Parser Regression | Complete | Stored-source parser pipeline, page model, conservative normalization, section detection, evidence candidates, parser result persistence, Source Bills UI, synthetic Description `(CODE)` regression coverage. Real hospital-bill fixture unavailable. |
| 4 | Authoritative CGHS Registry & Deterministic Rule Resolution | Implemented in this branch | Versioned registry architecture, active registry storage, registry validator, deterministic resolver, explicit locked rules, conflict detection, raw alias protection, resolution persistence, UI preview, and 47 Phase 4 tests. Official CGHS master/rate source unavailable, so registry authority is partial/unverified. |
| 5 | Deterministic EnhancementPlan Generation & Validation | Next | Must consume `ResolutionResult` and create a reviewed plan without portal execution. |
| 6 | Final bill composition/output | Not started | Phase 4 does not generate final PDFs. |
| 7 | Portal readiness/live automation validation | Not started / not verified | Existing portal executor is preserved; authenticated live portal validation is not claimed. |

## Phase 4 acceptance scope

Phase 4 acceptance is limited to registry/rule resolution:

- registry source audit;
- source hierarchy and authority statuses;
- versioned registry schema;
- source hash recording;
- registry validation;
- duplicate/conflict/date/source-reference checks;
- active registry persistence under external Storage;
- deterministic lookup and resolution;
- explicit locked mapping rules;
- C002 oxygen and packed-cell separation;
- C003 review-required handling;
- derived ICU/Ward/CN002 rules;
- explicit category composition rules;
- raw alias protection;
- resolution provenance and persistence;
- UI registry status and resolution preview;
- parser-to-resolver regression for `Description (C008)`.

## Explicit non-goals for Phase 4

- Do not rewrite the parser.
- Do not alter portal automation.
- Do not create final bill PDFs.
- Do not invent CGHS codes or rates.
- Do not treat the bundled HFOS snapshot as official authority.
- Do not map raw aliases by blanket prefix logic.
- Do not let parser success imply validated mapping success.
- Do not call Selenium, CDP, Python portal executor, external APIs, or credential flows.

## Validation categories

Use exact status language:

- **PASS** only when the command/check actually ran and succeeded.
- **FAIL** only when the command/check actually ran and failed.
- **BLOCKED** when an environment or dependency prevents a check.
- **NOT RUN** when no attempt was made.
- **NOT VERIFIED** for portal/runtime/real-PDF/official-data claims requiring unavailable authenticated, approved, or platform-specific validation.
