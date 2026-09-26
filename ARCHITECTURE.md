# Architecture

## System overview

CGHS Billing Suite VNEXT is a local Electron desktop application. Electron hosts a vanilla HTML/CSS/JavaScript UI and a Node.js main process. Node services own PDF ingestion, deterministic planning, reviews, Cases, validation, final-bill processing, and local persistence. Portal execution crosses a narrow JSON boundary into the preserved Python executor, which attaches Selenium to a manually authenticated Chrome session through CDP.

```text
Electron renderer
  ↕ constrained preload IPC
Electron main process
  → Node domain services
  → external Storage
  → Portal Adapter / Python runner
       → packaged portal-executor.exe (production)
       → portal_bridge.py
       → app (1).py — sole Selenium/CDP executor
       → CGHS portal
```

No Node service duplicates Selenium behavior, and Python does not own CGHS planning rules.

## High-level data flows

### Initial bill and portal flow

```text
Initial PDF
  → bill-ingestion services
  → normalized Bill Model
  → CGHS rate repository + deterministic rule engine
  → EnhancementPlan
  → Review Queue / Custom Code Registry freshness checks
  → Production Validation Run and explicit operator confirmation
  → Portal Adapter
  → Legacy Python bridge/executor
  → exact option selection
  → actual portal row/quantity reconciliation
  → Portal Execution Audit
  → Case verification state
```

### Final-bill flow

```text
Manually obtained Final PDF
  → SHA-256 identity
  → deterministic Case matching
  → final-section extraction
  → Patient Payable exclusion
  → CompletedBill draft
  → explicit review/match resolution where needed
  → completed package in external Storage
```

### Inbox flow

```text
Initial or Final inbox
  → existing InboxScanner stability check
  → SHA-256
  → duplicate/source-index check
  → bounded InboxWatcher queue when explicitly enabled
  → existing CaseWorkflowService
```

The `InboxWatcher` is an optional scheduler around the existing scanner. It does not acquire the portal lock, change the active case, call Selenium, execute plans, or discharge.

## Runtime components

### Desktop and UI

- `src/desktop/main.js` — Electron lifecycle, IPC registration, service composition, active UI context, and shutdown.
- `src/desktop/preload.js` — context-isolated renderer API.
- `src/ui/index.html`, `renderer.js`, `styles.css` — vanilla desktop UI for Cases, parsing, plans, reviews, validation, portal control, final bills, and watcher operations.

The renderer does not read files or start processes directly; privileged operations use preload IPC.

### Core runtime

- `src/core/config.js` — validated runtime configuration.
- `src/core/user-config.js` — external user-config initialization and non-destructive schema migration.
- `src/core/storage.js` — external Storage resolution and required-folder initialization.
- `src/core/logger.js` — local production logging.
- `src/core/runtime-paths.js` — development versus packaged resource resolution.
- `src/core/release-tools.js` — artifact hashing and release-manifest generation.

### Bill ingestion

`src/services/bill-ingestion/` owns PDF text loading, pages, logical rows, field parsing, section detection, code normalization, compound syntax detection, aggregation, bed details, and the normalized Bill Model. It does not decide portal behavior.

The implementation is text-based. OCR is not present.

### CGHS planning

`src/services/cghs/` owns:

- the bundled reference snapshot and repository abstraction;
- deterministic rule modules;
- `EnhancementPlan` construction; and
- plan provenance and statuses.

The bundled snapshot is explicitly `RATE_SOURCE_UNDEFINED`; it is not documented as authoritative.

### Reviews and custom codes

`src/services/custom-codes/` owns the persistent Custom Code Registry and Review Queue. Custom records are local, audited, revisioned, and separate from bundled reference data. Relevant registry changes can make an existing plan `PLAN_STALE`.

### Cases and intake

`src/services/cases/` owns:

- Case manifests and source-hash index;
- allowlisted state transitions;
- active-case portal lock;
- initial/final import orchestration;
- inbox stability scanning;
- optional periodic `InboxWatcher`; and
- restart recovery.

Only one Case can own portal execution. Restarted `PORTAL_EXECUTING` work becomes `RECOVERY_REQUIRED`; it is not auto-resumed.

### Validation

`src/services/validation/` owns two related layers:

- Phase 9 expected-versus-actual bill/plan validation and discrepancy persistence; and
- persistent Phase 12 `Production Validation Run` records linking source identity, parser/plan/registry versions, explicit plan confirmation, portal results, timing, notes, final bill, and completed storage.

Validation observes and annotates existing artifacts. It does not mutate business logic or expected fixtures.

### Final bill

`src/services/final-bill/` owns deterministic initial/final reconciliation, final pharmacy/consumable extraction, Patient Payable exclusion, `CompletedBill` creation, explicit match resolution, and completed-package persistence.

### Portal boundary

- `src/adapters/legacy-portal/plan-adapter.js` filters the immutable `EnhancementPlan` into executable and blocked records.
- `src/services/portal/portal-execution-service.js` normalizes executor results for Node audit and Case workflow.
- `src/adapters/legacy-portal/python-runner.js` safely starts the bridge/helper with `spawn`, argument arrays, `shell: false`, timeout, structured stdout, stderr, exit, and explicit availability errors.
- `src/adapters/legacy-portal/portal_bridge.py` validates the JSON contract and invokes the preserved executor.
- `app (1).py` remains the sole Selenium/CDP browser executor.
- `portal_execution_core.py` is a Selenium-free decision helper for exact matching, reconciliation, retries, metrics, and offline tests; it is not a second browser engine.

The Python executor consumes approved actions. It must not add codes, reinterpret rules, alter quantities, or modify the Custom Code Registry.

### Settlement

`src/services/settlement/` contains only an isolation README. Settlement/reconciliation is not implemented in the active application architecture.

## Data ownership

| Artifact | Owner | Persistence |
|---|---|---|
| Normalized Bill Model | bill-ingestion services | Case `normalized/` artifacts |
| `EnhancementPlan` | CGHS planning services | Case `enhancement/plan.json` |
| Custom Code Registry | custom-code service | external `Storage/Custom_Codes/` |
| Review Queue | review service, derived from plan/validation | Case/UI context and audit |
| Case | case store/workflow | external `Storage/Cases/` |
| Portal Execution Audit | portal execution service + Case workflow | Case `enhancement/` artifact |
| Production Validation Run | production-validation service | Case `validation/production/` |
| `CompletedBill` | final-bill services | Case artifacts and completed package |
| Watcher audit | `InboxWatcher` | external `Storage/Logs/inbox-watcher.jsonl` |

## External Storage boundary

Runtime user data must be outside application files and `app.asar`.

Default Windows Storage:

```text
%USERPROFILE%\Documents\CGHS Billing Suite VNEXT\Storage
├── Inbox\Initial
├── Inbox\Final
├── Cases
├── Custom_Codes
├── Audit
├── Bills
├── Logs
├── Reports
├── Source_Bills
├── Final_Bills
├── Supporting_Sections
└── Failed
```

The configured Storage path must be absolute and outside the application package. Initialization creates missing directories but does not reset existing data.

External user configuration:

```text
%APPDATA%\CGHS Billing Suite VNEXT\config.json
```

Bundled `config/default.json` supplies defaults; `user-config.js` performs non-destructive schema migration and preserves unknown settings.

## Security and privacy boundaries

- Processing and persistence are local.
- Authentication is manual; credentials and CGHS session tokens are not stored.
- No external document upload, telemetry, or cloud processing is implemented.
- Renderer privileges are constrained through preload IPC and context isolation.
- Diagnostic artifacts are failure-oriented and must not be treated as general patient-data exports.
- Release outputs must not contain runtime Storage, patient PDFs, credentials, or tokens.

## Packaging architecture

The supported release target is a Windows x64 portable Electron executable:

```text
Node/Electron source
  + bundled static defaults/assets
  + PyInstaller portal-executor.exe
  → electron-builder portable EXE
  → release manifest and SHA-256 checksums
```

- `packaging/portal-executor.spec` packages `portal_bridge.py`, `app (1).py`, Selenium, PyQt5, PyMuPDF, and `portal_execution_core.py`.
- `scripts/build-windows-release.ps1` is the one-command Windows build handoff.
- Release scripts generate and verify build identity, application artifact hash, and embedded Python executor hash.
- `.github/workflows/windows-release.yml` uses the same PowerShell entry point when available on the default branch.

Source tooling is implemented, but no actual Windows artifact has been built or run in Arena. Windows runtime and clean-machine acceptance remain pending.

## Dependency direction

1. UI depends on preload contracts, not filesystem/process internals.
2. Desktop composition depends on domain services.
3. Bill ingestion does not depend on portal automation.
4. CGHS planning depends on normalized bill and rate/custom snapshots, not Selenium.
5. Portal adaptation depends on an immutable plan.
6. Python depends only on the validated execution request and portal state, not Node business rules.
7. Final-bill and validation services consume existing artifacts without rewriting their history.
8. Watcher orchestration depends on the existing scanner/workflow and never on portal execution.
9. Packaging depends on runtime resources; runtime user data never depends on the program directory.

## Future architecture

No additional architecture is committed. OCR, automated discharge, portal final-bill transfer, settlement/reconciliation, cloud processing, and distributed locking are **not implemented** and require separate product and architecture decisions.