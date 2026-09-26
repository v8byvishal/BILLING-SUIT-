# Architecture

This repository is a local vanilla Electron/JavaScript desktop application. Phase 1 establishes the safe desktop foundation for CGHS Billing & Enhancement Suite V2 while preserving existing domain services, portal adapters, final-bill modules, and the legacy Python/Selenium executor.

For the Phase 1-specific architecture record, see `docs/ARCHITECTURE.md`.

## Runtime layering

```text
Renderer UI (src/ui, vanilla HTML/CSS/JS)
  ↓ controlled preload API: window.cghsSuite
Preload bridge (src/desktop/preload.js)
  ↓ declared IPC operation contract
Electron main process (src/desktop/main.js)
  ↓ service orchestration
Node domain services and adapters
  ↓ where already implemented
Legacy Python/Selenium/CDP portal executor
```

The renderer does not directly access Node filesystem APIs, shell commands, Python, Selenium, CGHS rule internals, or arbitrary Storage manipulation. Privileged operations must flow through the preload bridge and a declared IPC handler.

## Phase 1 foundation modules

| Area | Path | Responsibility |
|---|---|---|
| Storage | `src/core/storage.js` | External Storage resolution, canonical/compatibility folders, health probes, atomic writes. |
| State | `src/core/application-state-store.js` | Serializable app state, `billSessionId`, and active-workspace isolation. |
| Errors | `src/core/application-error.js` | Sanitized public errors and stable error codes. |
| Settings | `src/core/settings-store.js` | Non-secret persisted settings outside the application package. |
| Diagnostics | `src/services/diagnostics/diagnostics-service.js` | Safe runtime, Storage, Python, and app-state status reports. |
| IPC contract | `src/desktop/ipc-contract.js` | Allowed operation names and request validation. |
| IPC dispatcher | `src/desktop/phase1-ipc.js` | Fail-closed handler dispatch and public error serialization. |
| Preload | `src/desktop/preload.js` | Context-isolated `window.cghsSuite` API and narrow transitional legacy wrappers. |
| Shell | `src/ui/index.html`, `src/ui/renderer.js`, `src/ui/styles.css` | Professional Phase 1 navigation and status UI. |

## Storage model

Phase 1 canonical folders:

```text
Storage/
  Source_Bills/
  Final_Bills/
  Audit/
  Failures/
  Temp/
  Config/
```

Existing service folders remain supported for backward compatibility, including `Cases`, `Bills`, `Custom_Codes`, `Inbox`, `Reports`, `Logs`, `Supporting_Sections`, and legacy failure folders. Phase 1 does not rename or delete existing data.

Storage defaults to an external app-data location when no user path is configured and rejects paths inside the packaged application directory.

## State model

The Phase 1 state store exposes a serializable state tree with:

- app info/status;
- storage health/status;
- current bill and `billSessionId`;
- enhancement status/plan/results;
- final-bill status/source/output;
- portal status;
- settings;
- diagnostics;
- history;
- transient UI state.

Every source bill selection starts a new `billSessionId`. Starting a new bill clears active enhancement, final-bill, validation, portal execution, and transient UI state while preserving audit/history and stored case artifacts.

## IPC and preload policy

The Phase 1 IPC channel is `cghs-suite:operation`. Unsupported operations are rejected before handler dispatch. The contract intentionally does not expose generic command execution, arbitrary Python execution, arbitrary Node execution, shell execution, JavaScript eval, unrestricted filesystem access, or credential storage.

## Preserved business boundaries

Phase 1 does not change:

- CGHS rule and mapping semantics;
- source parser semantics;
- portal duplicate prevention, portal quantity reconciliation, speciality logic, locked quantity handling, Selenium workflow, or CDP behavior;
- final-bill business logic;
- legacy Python executor ownership of browser automation.

Portal readiness is reported as `NOT VERIFIED` until authenticated validation exists.
