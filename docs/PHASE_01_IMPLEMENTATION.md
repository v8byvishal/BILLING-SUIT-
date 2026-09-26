# Phase 01 Implementation — Desktop Foundation, Application Shell & Safe Architecture

Date: 2026-09-27
Branch: `arena/01a0dfad-billing-suit`
Commit target: `phase-01: establish desktop foundation and application shell`

## Scope delivered

Phase 1 establishes the safe desktop foundation for CGHS Billing & Enhancement Suite V2 on the existing vanilla Electron/JavaScript stack. It does not change validated parser, CGHS rule, final-bill, portal, Selenium/CDP, or legacy Python executor semantics.

Delivered foundation areas:

1. Stable Electron shell with a professional Phase 1 application UI.
2. Centralized, serializable application state.
3. Explicit active-bill isolation through `billSessionId`.
4. Canonical runtime Storage layout under `Storage/`.
5. Controlled preload and IPC boundaries.
6. Settings persistence outside the application package.
7. Diagnostics/status foundation with safe redaction boundaries.
8. Error/lifecycle handling primitives for recoverable UI reporting.
9. Regression tests for Phase 1 storage, state, IPC, settings, and diagnostics behavior.

## Runtime Storage layout

Phase 1 creates the canonical runtime folders:

```text
Storage/
  Source_Bills/
  Final_Bills/
  Audit/
  Failures/
  Temp/
  Config/
```

Existing service folders remain supported as compatibility folders so prior bill-ingestion, case, custom-code, validation, inbox, completed-bill, and logging services are not broken:

```text
Supporting_Sections/
Logs/
Failed/
Reports/
Custom_Codes/
Bills/
Inbox/Initial/
Inbox/Final/
Cases/
```

Storage defaults to an external application-data location when no user path is configured. Paths inside the application package are rejected.

## Central state and bill-session isolation

`src/core/application-state-store.js` owns the Phase 1 serializable state tree:

- `appInfo`
- `appStatus`
- `storageStatus`
- `currentBill`
- `enhancement`
- `finalBill`
- `diagnostics`
- `settings`
- `history`
- `portal`
- `transientUI`

Every active source bill receives a `billSessionId`. Starting a new source bill resets the active enhancement, portal/final-bill transient context, validation run context, execution audit, and UI transient state while preserving history and stored cases/failures. Session-owned mutations validate the active `billSessionId` and reject mismatches.

## Preload and IPC contract

The renderer uses a single controlled preload surface exposed as `window.cghsSuite`.

Supported Phase 1 operation groups:

- `app.getInfo`, `app.getStatus`, `app.getDiagnostics`
- `storage.getStatus`, `storage.openRoot`, `storage.openFolder`, `storage.listRecent`
- `bill.getCurrent`, `bill.clearCurrent`, `bill.select`, `bill.reset`
- `enhancement.getPlan`, `enhancement.getStatus`
- `finalBill.getStatus`
- `settings.get`, `settings.update`
- `history.list`
- `diagnostics.openFolder`

No generic command, shell, Python, Node, JavaScript-eval, arbitrary filesystem, credential, or unrestricted process execution API is exposed.

A narrow `window.vnext` compatibility surface remains temporarily for legacy workflow handlers and maps to existing named IPC channels only. It does not expose generic execution.

## Application shell

The Phase 1 shell in `src/ui/index.html`, `src/ui/renderer.js`, and `src/ui/styles.css` provides:

- Dashboard
- Source Bills
- Enhancement
- Final Bill
- Audit / History
- Settings
- Diagnostics

The shell shows real runtime state where available and clearly marks unsupported/unverified work. It does not invent parser output, enhancement actions, final PDFs, portal readiness, or metrics.

## Diagnostics

`src/services/diagnostics/diagnostics-service.js` provides safe diagnostics reports containing:

- app/runtime identity
- storage health
- current bill session identity
- Python availability/version probe
- sanitized high-level application state
- explicit portal status as `NOT VERIFIED`

Diagnostics avoid credentials, cookies, tokens, full environment dumps, and arbitrary filesystem traversal.

## Validation performed

Validation commands executed after Phase 1 implementation:

```bash
node --check src/desktop/main.js src/desktop/preload.js src/ui/renderer.js src/core/storage.js src/core/application-state-store.js src/desktop/ipc-contract.js src/desktop/phase1-ipc.js src/core/settings-store.js src/services/diagnostics/diagnostics-service.js
node --test tests/unit/phase1-*.test.js
npm test
python3 -m unittest discover -s tests/python -p 'test_*.py'
npm run test:desktop
```

| Check | Result |
|---|---|
| JavaScript syntax checks | PASS |
| Phase 1 unit tests | PASS — 15/15 |
| Full Node test suite | PASS — 287/287 |
| Python unittest suite | PASS — 32/32 |
| Desktop smoke test | FAIL/BLOCKED before launch — Electron binary missing because install scripts were skipped; error: `Electron failed to install correctly`. |

Electron desktop runtime validation is therefore **not PASS** in this environment.

## Explicitly not delivered in Phase 1

- No CGHS rule or mapping semantic changes.
- No parser redesign or OCR behavior.
- No final PDF composition engine.
- No portal automation redesign.
- No live portal validation.
- No automatic discharge.
- No credential entry or credential storage.
- No fake dashboards, metrics, parser output, portal readiness, or generated final bills.
