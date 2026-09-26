# Delivery Roadmap

This file records the current V2 phase status for this repository checkout. Source audit evidence is in `docs/SOURCE_AUDIT.md`; Phase 1 details are in `docs/PHASE_01_IMPLEMENTATION.md`; Phase 2 details are in `docs/PHASE_02_IMPLEMENTATION.md` and `docs/STORAGE_MIGRATION.md`.

## Current roadmap position

| Phase | Objective | Status | Key outcome / limitation |
|---:|---|---|---|
| 0 | Source audit and safety baseline | Complete | Existing repository behavior and constraints were audited and preserved in `docs/SOURCE_AUDIT.md`. |
| 1 | Desktop Foundation, Application Shell & Safe Architecture | Complete | Vanilla Electron shell, controlled preload/IPC, initial external Storage foundation, app-state store, `billSessionId` isolation, settings, diagnostics, and Phase 1 tests. Desktop runtime launch remained environment-blocked. |
| 2 | External Storage, Persistent Runtime Data & Recovery Foundation | Implemented in this branch | Authoritative `StorageService`, manifest, source/final/session/audit/failure/config persistence, SHA-256 integrity, duplicate detection, atomic JSON, corruption handling, temp recovery, storage diagnostics, UI storage views, and Phase 2 tests. Electron runtime launch remains blocked by missing Electron binary. |
| 3 | Source Bill PDF Ingestion & Historical Parser Regression | Next | Parser behavior was intentionally not changed in Phase 2. |
| 4 | Enhancement workflow expansion | Not started | No unvalidated CGHS mappings/rules or portal actions were added in Phase 2. |
| 5 | Final bill composition/output | Not started | Phase 2 provides storage mechanism only; no final PDF composition is claimed. |
| 6 | Portal readiness/live automation validation | Not started / not verified | Existing portal executor is preserved; authenticated live portal validation is not claimed. |

## Phase 2 acceptance scope

Phase 2 acceptance is limited to runtime persistence infrastructure:

- one authoritative `StorageService`;
- canonical external root `<ApplicationData>/CGHS-Billing-Suite/Storage`;
- canonical directories plus retained compatibility folders;
- real storage health checks requiring read/write/temp create/remove verification;
- manifest creation/reload;
- source bill file and metadata persistence;
- SHA-256 identity and duplicate source detection;
- persistent bill-session registry;
- final-bill placeholder/storage mechanism;
- persistent audit and failure records;
- atomic JSON write path;
- corrupted JSON detection and preservation;
- application-generated stale temp cleanup;
- allowlisted folder opening;
- storage diagnostics and UI storage views;
- Phase 2 regression tests plus existing Node/Python checks.

## Explicit non-goals for Phase 2

- Do not migrate to React or TypeScript.
- Do not rewrite the project from scratch.
- Do not alter CGHS rule, mapping, parser, final-bill, portal, Selenium, CDP, or Python executor semantics.
- Do not add credential entry/storage.
- Do not automate discharge.
- Do not fake parser output, enhancement actions, final PDFs, portal readiness, dashboards, or metrics.
- Do not claim live portal readiness or desktop runtime launch without successful validation.

## Validation categories

Use exact status language:

- **PASS** only when the command/check actually ran and succeeded.
- **FAIL** only when the command/check actually ran and failed.
- **BLOCKED** when an environment or dependency prevents a check.
- **NOT RUN** when no attempt was made.
- **NOT VERIFIED** for portal/runtime claims requiring unavailable authenticated or platform-specific validation.
