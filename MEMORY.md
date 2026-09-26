# Project Memory

Read this file first for current implementation state. Detailed source audit evidence is in `docs/SOURCE_AUDIT.md`; Phase 1 implementation notes are in `docs/PHASE_01_IMPLEMENTATION.md`; current roadmap status is in `PHASES.md`.

## Current Project Status

- **Current branch:** `arena/01a0dfad-billing-suit`
- **Baseline before Phase 1 work:** `22ba5eec067fa347268ba1af88db3a847962deaa`
- **Phase 1 commit target:** `phase-01: establish desktop foundation and application shell`
- **Product version:** `5.0.0-rc.2`
- **Current milestone:** Phase 1 Desktop Foundation, Application Shell & Safe Architecture implemented in the working tree.
- **Overall status:** Phase 1 source implementation and unit/integration test validation are expected to be completed on this branch. Electron runtime launch/package validation remains environment-dependent unless Electron is installed and launched separately.

## Phase 1 implementation summary

Phase 1 keeps the existing vanilla Electron/JavaScript stack and adds a safer desktop foundation without changing validated parser, CGHS rule, final-bill, portal, Selenium/CDP, or legacy Python behavior.

Implemented foundations:

- Canonical runtime Storage in `src/core/storage.js` with `Storage/{Source_Bills,Final_Bills,Audit,Failures,Temp,Config}` and compatibility folders for existing services.
- Serializable Phase 1 app state in `src/core/application-state-store.js`.
- Explicit active-bill isolation through `billSessionId`.
- Current-bill reset that clears active enhancement/final/portal/validation/transient state while preserving history and stored artifacts.
- Sanitized error model in `src/core/application-error.js`.
- Non-secret settings persistence in `src/core/settings-store.js`.
- Safe diagnostics service in `src/services/diagnostics/diagnostics-service.js`.
- Controlled IPC contract and dispatcher in `src/desktop/ipc-contract.js` and `src/desktop/phase1-ipc.js`.
- Context-isolated preload API in `src/desktop/preload.js` via `window.cghsSuite`.
- Professional Phase 1 shell in `src/ui/index.html`, `src/ui/renderer.js`, and `src/ui/styles.css`.
- Phase 1 tests in `tests/unit/phase1-*.test.js`.

## Safety constraints to preserve

- The renderer must not directly access arbitrary filesystem APIs, child processes, Python, Selenium, Storage folder manipulation, or CGHS rule logic.
- Do not expose generic execution APIs such as `execute(command,payload)`, `runShell`, `runPython`, or `executeJS`.
- Do not modify CGHS mapping/rule semantics, C002/C003 behavior, quantity rules, portal duplicate prevention, portal quantity reconciliation, speciality logic, locked quantity behavior, Selenium workflow, CDP behavior, or final-bill business rules as part of Phase 1.
- Do not add credential entry/storage, automatic discharge, blind duplicate Plus clicks, unsupported DOM lock bypasses, invented CGHS codes/rates/portal behavior, global alias transforms, or unrun PASS claims.
- Portal status remains `NOT VERIFIED` until authenticated portal validation exists.

## Current architecture snapshot

```text
Renderer UI (vanilla HTML/CSS/JS)
  -> window.cghsSuite controlled API
Preload bridge (context isolation)
  -> cghs-suite:operation IPC contract
Electron main process
  -> Node services and adapters
  -> external Storage
  -> preserved portal adapter / Python executor where already implemented
```

The renderer-facing Phase 1 state tree contains app info/status, storage status, current bill, enhancement, final bill, diagnostics, settings, history, portal status, and transient UI state.

## Validation log

Validation commands run during Phase 1 implementation:

- `node --check src/desktop/main.js src/desktop/preload.js src/ui/renderer.js src/core/storage.js src/core/application-state-store.js src/desktop/ipc-contract.js src/desktop/phase1-ipc.js src/core/settings-store.js src/services/diagnostics/diagnostics-service.js` — PASS.
- `node --test tests/unit/phase1-*.test.js` — PASS, 15/15 tests.
- `npm test` — PASS, 287/287 tests.
- `python3 -m unittest discover -s tests/python -p 'test_*.py'` — PASS, 32/32 tests.
- `npm run test:desktop` — FAIL/BLOCKED before Electron launch: `Electron failed to install correctly` after dependency install with scripts skipped.

Known environment notes:

- Earlier dependency install used `npm ci --ignore-scripts`; Electron postinstall was skipped. `npm run test:desktop` was attempted and failed before launch with `Electron failed to install correctly`; do not claim packaged/runtime Electron smoke PASS unless Electron is installed and launched successfully later.
- Live CGHS portal validation is not verified in this environment.
- Windows EXE, clean-machine, and packaged artifact validation are not Phase 1 claims.

## Important paths

- `src/desktop/main.js` — Electron lifecycle and service wiring.
- `src/desktop/preload.js` — renderer preload bridge.
- `src/desktop/ipc-contract.js` — allowed Phase 1 operations.
- `src/desktop/phase1-ipc.js` — controlled IPC dispatcher.
- `src/core/storage.js` — external Storage foundation.
- `src/core/application-state-store.js` — centralized Phase 1 state.
- `src/core/settings-store.js` — persisted settings.
- `src/services/diagnostics/diagnostics-service.js` — diagnostics reports.
- `src/ui/index.html`, `src/ui/renderer.js`, `src/ui/styles.css` — Phase 1 desktop shell.
- `tests/unit/phase1-*.test.js` — Phase 1 regression coverage.
