# Project Memory

Read this file first for current implementation state. Source audit evidence is in `docs/SOURCE_AUDIT.md`; Phase 1 notes are in `docs/PHASE_01_IMPLEMENTATION.md`; Phase 2 notes are in `docs/PHASE_02_IMPLEMENTATION.md`; Storage migration details are in `docs/STORAGE_MIGRATION.md`.

## Current Project Status

- **Current branch:** `arena/01a0dfad-billing-suit`
- **Phase 1 baseline:** `395acad1d2a765fb741172c81adb9c77c298d404` / `phase-01-desktop-foundation`
- **Phase 2 commit target:** `phase-02: external storage and runtime persistence foundation`
- **Product version:** `5.0.0-rc.2`
- **Current milestone:** Phase 2 External Storage, Persistent Runtime Data & Recovery Foundation implemented in the working tree.
- **Overall status:** StorageService, persistent source/final/session/audit/failure/config data, manifest, integrity checks, startup recovery, UI storage views, diagnostics, and Phase 2 tests are implemented. Electron runtime launch remains environment-blocked because install scripts were skipped and the Electron binary is unavailable.

## Phase 2 implementation summary

Phase 2 turns the Phase 1 folder structure into one authoritative runtime persistence layer in `src/core/storage.js`.

Implemented foundations:

- `StorageService` central abstraction with root resolution, initialization, health checks, manifest handling, safe folder access, atomic JSON writes, file copy/move helpers, temp lifecycle, source/final artifact storage, session registry, audit/failure records, and usage summaries.
- External default root contract: `<ApplicationData>/CGHS-Billing-Suite/Storage` through Electron `app.getPath('appData')` at runtime.
- Health statuses: `NOT_INITIALIZED`, `INITIALIZING`, `READY`, `READ_ONLY`, `ACCESS_ERROR`, `CORRUPT`, `ERROR`.
- READY requires root existence, canonical directories, read access, write probe, and temp create/remove verification.
- Storage manifest at `Storage/Config/storage-manifest.json`.
- Phase 2 settings under `Storage/Config/application-settings.json`, with idempotent migration from Phase 1 `phase1-settings.json` when present.
- Source bill persistence under `Storage/Source_Bills/<billSessionId>/source.pdf` and `metadata.json`.
- Source SHA-256/size verification and duplicate detection by SHA-256.
- Persistent bill session registry under `Storage/Config/bill-sessions/`.
- Final bill placeholder/storage mechanism under `Storage/Final_Bills/<billSessionId>/` without fake final PDF generation.
- Persistent structured audit records in `Storage/Audit/audit-YYYY-MM-DD.jsonl`.
- Persistent failure records in `Storage/Failures/<failureId>.json` with sanitized messages.
- Startup temp cleanup for application-generated temp artifacts only.
- Corrupted JSON detection that preserves the corrupt file copy and does not replace historical data with empty defaults.
- Diagnostics now report storage root, manifest status, health probe details, recovery summary, usage, and record counts.
- UI now displays real storage health, persisted source bill records, and persistent audit history.

## Safety constraints to preserve

- Storage must never become a secret store. Settings/failures/diagnostics reject or redact passwords, credentials, cookies, tokens, API keys, and auth/session payloads.
- Renderer must not receive arbitrary filesystem, shell, Python, Node, JavaScript eval, or process execution capability.
- Folder opening remains allowlisted through `storage.openFolder(folderKey)`.
- Do not modify CGHS mapping/rule semantics, parser behavior, portal Selenium/CDP behavior, final-bill business semantics, credential entry/storage, or automatic discharge in Phase 2.
- Resetting the current bill clears active/transient UI state only; it must not delete source PDFs, final PDFs, audit, failure, or session metadata.
- Portal readiness remains `NOT VERIFIED` until authenticated validation exists.

## Legacy Storage compatibility

The following compatibility folders remain created because existing services still consume them:

| Folder | Consumer | Migration status |
|---|---|---|
| `Cases` | `CaseStore`, `CaseWorkflowService`, validation production runs | Retained; not migrated in Phase 2. |
| `Custom_Codes` | `CustomCodeRegistry` | Retained; not migrated in Phase 2. |
| `Inbox/Initial`, `Inbox/Final` | `InboxScanner`, `InboxWatcher` | Retained; not migrated in Phase 2. |
| `Bills` | `completed-bill-storage` | Retained; later final-output migration required. |
| `Logs` | logger and inbox watcher audit | Retained; logging migration not part of Phase 2. |
| `Reports`, `Supporting_Sections`, `Failed` | Historical/compatibility paths | Retained for non-destructive compatibility. |

## Validation log

Validation commands run during Phase 2 implementation:

- `node --check src/core/storage.js src/services/diagnostics/diagnostics-service.js src/desktop/ipc-contract.js src/desktop/preload.js src/desktop/main.js src/ui/renderer.js tests/unit/phase2-storage-service.test.js` — PASS.
- `node --test tests/unit/phase2-storage-service.test.js` — PASS, 26/26 tests.
- Initial `npm test` before dependency install — FAIL because `pdf-lib` was missing.
- `npm ci --ignore-scripts` — completed, installed dependencies, left Electron binary unavailable as expected.
- Final `npm test` — PASS, 313/313 tests.
- `python3 -m unittest discover -s tests/python -p 'test_*.py'` — PASS, 32/32 tests.
- `npm run test:desktop` — FAIL/BLOCKED before Electron launch: `Electron failed to install correctly` because Electron postinstall was skipped.

Known environment notes:

- Electron runtime smoke is not a product PASS in this environment.
- Live CGHS portal validation is not verified.
- Windows EXE, clean-machine, and packaged artifact validation are not Phase 2 claims.

## Important paths

- `src/core/storage.js` — Phase 2 authoritative `StorageService` and compatibility exports.
- `src/desktop/main.js` — StorageService bootstrap, source/final artifact persistence, persistent audit/failure integration, controlled IPC handlers.
- `src/desktop/ipc-contract.js` — Phase 2 storage operations added to the allowlisted IPC contract.
- `src/desktop/preload.js` — controlled renderer API for source list and storage usage.
- `src/services/diagnostics/diagnostics-service.js` — storage diagnostics/recovery/usage reporting.
- `src/ui/index.html`, `src/ui/renderer.js` — storage status, persisted source records, persistent audit UI.
- `tests/unit/phase2-storage-service.test.js` — Phase 2 regression coverage.
