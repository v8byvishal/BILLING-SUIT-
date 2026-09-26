# Delivery Roadmap

This file records the current V2 phase status for this repository checkout. Source audit evidence is in `docs/SOURCE_AUDIT.md`; Phase 1 implementation details are in `docs/PHASE_01_IMPLEMENTATION.md`.

## Current roadmap position

| Phase | Objective | Status | Key outcome / limitation |
|---:|---|---|---|
| 0 | Source audit and safety baseline | Complete | Existing repository behavior and constraints were audited and preserved in `docs/SOURCE_AUDIT.md`. |
| 1 | Desktop Foundation, Application Shell & Safe Architecture | Implemented in this branch | Vanilla Electron shell, controlled preload/IPC, external Storage foundation, app-state store, `billSessionId` isolation, settings, diagnostics, and Phase 1 tests are in place. Desktop runtime launch/package validation remains environment-dependent because Electron install scripts were skipped earlier. |
| 2 | Validated source-bill ingestion improvements | Not started | Parser behavior is intentionally unchanged in Phase 1. |
| 3 | Enhancement workflow expansion | Not started | No unvalidated CGHS mappings/rules or portal actions were added in Phase 1. |
| 4 | Final bill composition/output | Not started | Phase 1 provides UI structure only; no final PDF composition is claimed. |
| 5 | Portal readiness/live automation validation | Not started / not verified | Existing portal executor is preserved; authenticated live portal validation is not claimed. |

## Phase 1 acceptance scope

Phase 1 acceptance is limited to foundation behavior:

- stable Electron shell structure on the existing vanilla Electron/JavaScript stack;
- renderer access only through controlled preload APIs;
- no generic shell, Python, Node, or JavaScript command-execution exposure;
- canonical `Storage/{Source_Bills,Final_Bills,Audit,Failures,Temp,Config}` with compatibility folders retained;
- centralized serializable state;
- explicit current-bill isolation using `billSessionId`;
- reset of active plan/queue/UI/results/final-bill transient/execution state when a new bill is selected;
- safe settings and diagnostics foundations;
- Phase 1 unit coverage plus existing Node/Python regression checks.

## Explicit non-goals for Phase 1

- Do not migrate to React or TypeScript.
- Do not rewrite the project from scratch.
- Do not alter validated CGHS rule, mapping, parser, final-bill, portal, Selenium, CDP, or Python executor semantics.
- Do not add credential entry/storage.
- Do not automate discharge.
- Do not fake parser output, enhancement actions, final PDFs, portal readiness, dashboards, or metrics.
- Do not claim live portal readiness without authenticated validation.

## Validation categories

Use exact status language:

- **PASS** only when the command/check actually ran and succeeded.
- **FAIL** only when the command/check actually ran and failed.
- **NOT RUN** when no attempt was made.
- **BLOCKED** when an environment or dependency prevents a check.
- **NOT VERIFIED** for portal/runtime claims that require unavailable authenticated or platform-specific validation.
