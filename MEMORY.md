# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 1 — Project Foundation + EXE Shell + External Storage**
Implementation complete; awaiting human review. The Electron launch smoke test is implemented but could not execute in the Arena Linux environment because the Electron runtime binary download failed at TLS/network transport. This is an explicit validation blocker, not a product success claim.

## Completed work

- Added a folder-based Electron foundation under `src/` without moving legacy files.
- Added a minimal professional readiness renderer; no business workflow is represented as implemented.
- Added a sandboxed preload with four explicit, read-only IPC operations.
- Added configuration loading and validation.
- Added runtime-resolved external Storage creation and write verification.
- Added structured JSON-lines logging under external `Storage/Logs`.
- Added startup/fatal error handling and controlled shutdown logging.
- Added the future workflow state vocabulary, initialized only to `IDLE`.
- Added pinned Electron/Electron Builder configuration and Windows portable build direction.
- Added unit tests and an Electron startup/renderer IPC/shutdown smoke-test harness.
- Added architecture, design, phase, and rule-preservation documentation.

## Files created

- `.gitignore`
- `ARCHITECTURE.md`
- `DESIGN.md`
- `RULES.md`
- `PHASES.md`
- `MEMORY.md`
- `config/default.json`
- `scripts/smoke-test.js`
- `src/core/app-state.js`
- `src/core/config.js`
- `src/core/logger.js`
- `src/core/storage.js`
- `src/desktop/main.js`
- `src/desktop/preload.js`
- `src/ui/index.html`
- `src/ui/renderer.js`
- `src/ui/styles.css`
- Structural `.gitkeep` files under `src/adapters`, `src/services`, `src/shared`, all six `storage/` categories, `tests/integration`, and `tests/fixtures`
- Unit tests under `tests/unit/`

## Files modified

- `package.json` — VNEXT entry point, scripts, pinned desktop tooling, packaging configuration
- `package-lock.json` — reproducible dependency lock

## Legacy files intentionally untouched

- `app (1).py` — legacy Python parser/enhancement/Selenium baseline
- `CGHS_Billing_Suite_Pro.html` — HFOS/Billing Suite baseline
- root `main.js` and root `preload.js` — v5 Electron/database reference implementation
- All CGHS rates, calculations, locators, retries, CDP behavior, and historical reports
- `PRD.md`

No exact root `app.py` exists; the filename conflict remains as documented in `PRD.md`.

## Tests actually run

1. `npm test` — **PASS: 6 tests, 0 failed**
   - application state initialization/validation
   - default configuration load
   - unsafe relative Storage path rejection
   - structured logger initialization/write
   - external Storage resolution and six-directory creation
   - application-package Storage rejection
2. `npm audit --omit=dev` — **PASS: 0 production dependency vulnerabilities**
3. `npm run test:desktop` — **NOT PASSED / ENVIRONMENT BLOCKED**
   - Electron npm package metadata installed, but its runtime binary could not be downloaded.
   - Standard install failed certificate verification; mirror/retry also failed before TLS connection.
   - The harness therefore did not launch Electron in this environment.
4. `git diff --check` — **PASS** before the foundation commit.

No parser, CGHS rule, Selenium, CDP, production portal, bill-processing, or final-PDF tests were run.

## Storage strategy

Default: `<OS Documents>/CGHS Billing Suite VNEXT/Storage`. An absolute path override is accepted through `VNEXT_STORAGE_PATH`. Relative paths and paths inside the application package are rejected. Startup creates `Source_Bills`, `Final_Bills`, `Supporting_Sections`, `Logs`, `Failed`, and `Reports`, then verifies writability. Repository `storage/` folders are empty templates only and ignore runtime contents.

## Unresolved issues

- Execute `npm install` and `npm run test:desktop` in an environment that can download the pinned Electron 31.7.7 runtime; confirm launch, renderer, IPC, and shutdown.
- Run `npm run build:win` and validate the portable EXE on Windows 10/11. No Windows artifact was produced in Phase 1.
- Development dependencies report npm audit findings transitively; production dependency audit reports zero. Review tooling versions before release hardening.
- Code signing, icons, installer UX, supported architecture policy, Storage encryption/retention, and final packaging policy remain later-phase work.
- Existing encrypted v5 sql.js storage is preserved in legacy root `main.js`; migration/continued role remains undecided.

## Git state

- Branch: `arena/01a0de46-billing-suit` (Arena session-fixed branch)
- Phase 1 foundation implementation commit: `a5915fd`
- Phase 0 commit: `ffb485b`
- Pull request: existing repository PR is updated from this same branch; see final Phase 1 report for URL/status.

## Next phase

**Phase 2 — Bill ingestion + parser + normalized bill model**, only after human review and separate instructions. Do not begin automatically. Legacy parsing/business behavior must remain unchanged until regression fixtures and explicit Phase 2 scope are approved.
