# Architecture — Phase 1 Desktop Foundation

CGHS Billing & Enhancement Suite V2 remains a local vanilla Electron/JavaScript desktop application. Phase 1 establishes safer runtime boundaries without rewriting existing validated bill, CGHS, final-bill, portal, or Python executor behavior.

## Layering

```text
Renderer UI (vanilla HTML/CSS/JS)
  ↓ window.cghsSuite only
Preload bridge (context isolated, narrow API)
  ↓ cghs-suite:operation IPC contract
Electron main process
  ↓ controlled service calls
Node domain services and adapters
  ↓ where already implemented
Legacy Python/Selenium/CDP portal executor
```

The renderer must not directly access Node filesystem APIs, child processes, Python, Selenium, CGHS rule logic, or arbitrary Storage manipulation. Privileged work goes through the preload API and a declared IPC operation.

## Key Phase 1 modules

| Area | Module | Responsibility |
|---|---|---|
| Storage | `src/core/storage.js` | Resolve external Storage, create canonical and compatibility folders, health/read-write probes, atomic writes. |
| State | `src/core/application-state-store.js` | Central serializable app state and `billSessionId` ownership checks. |
| Errors | `src/core/application-error.js` | Sanitized public errors with stable codes. |
| Settings | `src/core/settings-store.js` | Non-secret persisted desktop settings outside the app package. |
| Diagnostics | `src/services/diagnostics/diagnostics-service.js` | Safe runtime/storage/Python/status reports. |
| IPC contract | `src/desktop/ipc-contract.js` | Declared operation names and request validation. |
| IPC dispatcher | `src/desktop/phase1-ipc.js` | Fail-closed operation dispatch and public error serialization. |
| Preload | `src/desktop/preload.js` | `window.cghsSuite` controlled API plus narrow transitional `window.vnext`. |
| Shell | `src/ui/index.html`, `src/ui/renderer.js`, `src/ui/styles.css` | Phase 1 navigation and status UI. |

## Storage boundary

Canonical runtime folders:

```text
Storage/Source_Bills
Storage/Final_Bills
Storage/Audit
Storage/Failures
Storage/Temp
Storage/Config
```

Compatibility folders for existing services remain available, including `Cases`, `Bills`, `Custom_Codes`, `Inbox`, `Reports`, `Logs`, and historical failure/supporting-section folders. Phase 1 does not rename or delete existing data.

Storage resolution rejects paths inside the application package. The default uses application data where available, falling back to documents only when application data is unavailable.

## Application state boundary

The Phase 1 state store is the single renderer-facing state source. Active source-bill state is isolated by `billSessionId`:

- new source bill selection starts a new `billSessionId`;
- prior enhancement plan, final-bill source/output, portal audit, validation run, and transient UI state are cleared;
- history records and stored case artifacts remain preserved;
- session-owned mutations reject mismatched `billSessionId` values.

## IPC boundary

The Phase 1 IPC channel is `cghs-suite:operation`. Requests must be objects containing one declared operation from `src/desktop/ipc-contract.js`. Unsupported operations fail before handler dispatch.

The contract intentionally does not include generic operations such as command execution, arbitrary Python execution, shell execution, JavaScript eval, or unrestricted filesystem read/write.

## Portal boundary

Portal status is exposed as `NOT VERIFIED` in Phase 1. Existing portal adapter and legacy Python executor are preserved, but Phase 1 does not claim authenticated live portal readiness and does not add new Selenium/CDP behavior.

## Final-bill boundary

The Phase 1 UI provides the final-bill workspace structure only. Existing final-bill services remain present, but Phase 1 does not implement final PDF composition or claim generated final output.
