# Delivery Roadmap

This file records the current V2 phase status for this repository checkout. Source audit evidence is in `docs/SOURCE_AUDIT.md`; implementation details are in `docs/PHASE_01_IMPLEMENTATION.md`, `docs/PHASE_02_IMPLEMENTATION.md`, and `docs/PHASE_03_IMPLEMENTATION.md`.

## Current roadmap position

| Phase | Objective | Status | Key outcome / limitation |
|---:|---|---|---|
| 0 | Source audit and safety baseline | Complete | Existing repository behavior and constraints were audited and preserved in `docs/SOURCE_AUDIT.md`. |
| 1 | Desktop Foundation, Application Shell & Safe Architecture | Complete | Vanilla Electron shell, controlled preload/IPC, initial external Storage foundation, app-state store, `billSessionId` isolation, settings, diagnostics, and Phase 1 tests. Desktop runtime launch remained environment-blocked. |
| 2 | External Storage, Persistent Runtime Data & Recovery Foundation | Complete | Authoritative `StorageService`, manifest, source/final/session/audit/failure/config persistence, SHA-256 integrity, duplicate detection, atomic JSON, corruption handling, temp recovery, storage diagnostics, UI storage views, and Phase 2 tests. |
| 3 | Source Bill PDF Ingestion, Evidence Extraction & Historical Parser Regression | Implemented in this branch | Stored-source parser pipeline, page model, conservative normalization, section detection, evidence candidates, parser result persistence, Source Bills UI, synthetic Description `(CODE)` regression coverage. Real hospital-bill fixture unavailable. |
| 4 | Authoritative CGHS Registry & Deterministic Rule Resolution | Next | Must consume parser evidence without changing parser semantics. |
| 5 | Enhancement workflow expansion | Not started | No unvalidated CGHS mappings/rules or portal actions were added in Phase 3. |
| 6 | Final bill composition/output | Not started | Phase 3 does not generate final PDFs. |
| 7 | Portal readiness/live automation validation | Not started / not verified | Existing portal executor is preserved; authenticated live portal validation is not claimed. |

## Phase 3 acceptance scope

Phase 3 acceptance is limited to source PDF ingestion and evidence extraction:

- valid PDF import through external Storage;
- immutable stored source artifact;
- SHA-256/session identity from StorageService;
- parser version `3.0.0`;
- page extraction with raw and normalized text;
- section detection where evidence exists;
- candidate extraction with provenance;
- Description `(CODE)` same-line and wrapped regression coverage;
- source-derived quantity capture only;
- `parse-result.json` persistence and reload;
- audit/failure records;
- Source Bills UI candidate/evidence presentation;
- synthetic regression fixtures and golden JSON;
- baseline Node/Python regression checks.

## Explicit non-goals for Phase 3

- Do not map `C008` to `CC008`.
- Do not apply CGHS aliases, CGHS-C rules, C002/C003 rules, CN002, oxygen, ICU, ward, or other business-rule logic.
- Do not create executable portal actions.
- Do not invoke Selenium, CDP, portal execution, final PDF generation, external APIs, credential entry/storage, or automatic discharge.
- Do not claim real hospital-bill validation if only synthetic fixtures were used.

## Validation categories

Use exact status language:

- **PASS** only when the command/check actually ran and succeeded.
- **FAIL** only when the command/check actually ran and failed.
- **BLOCKED** when an environment or dependency prevents a check.
- **NOT RUN** when no attempt was made.
- **NOT VERIFIED** for portal/runtime/real-PDF claims requiring unavailable authenticated, approved, or platform-specific validation.
