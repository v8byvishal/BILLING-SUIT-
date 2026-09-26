# CGHS Billing Suite VNEXT — Foundation Architecture

## Phase 1 decision

Electron remains the desktop technology because the repository already contains a proven Electron baseline. Phase 1 introduces a minimal folder-based shell without moving, importing, or changing the legacy Python enhancement system or HFOS application.

## Runtime layers

```text
Renderer (`src/ui`)
  ↓ explicit read-only IPC methods
Preload (`src/desktop/preload.js`)
  ↓ allowlisted channels only
Electron main (`src/desktop/main.js`)
  ↓
Core foundations (`src/core`)
  ├─ configuration
  ├─ external Storage
  ├─ structured logging
  └─ application state
```

The renderer has `nodeIntegration: false`, `contextIsolation: true`, and `sandbox: true`. It receives only four explicit methods: application status, Storage information, public configuration, and renderer-ready reporting. There is no shell execution, arbitrary path access, file mutation, parser, Selenium, CDP, or portal IPC.

## External Storage

Default runtime location:

```text
<OS Documents>/CGHS Billing Suite VNEXT/Storage/
```

An absolute override can be supplied with `VNEXT_STORAGE_PATH`. Relative paths and paths inside the application/package are rejected. Startup creates and write-checks:

- `Source_Bills/`
- `Final_Bills/`
- `Supporting_Sections/`
- `Logs/`
- `Failed/`
- `Reports/`

The repository `storage/` tree is a documented empty template only; runtime user data is never written there. Long-term naming, encryption, retention, and migration remain later-phase decisions.

## Existing database

The old root `main.js` contains the v5 encrypted sql.js database implementation. It is intentionally untouched and remains reference/legacy code. The Phase 1 shell does not create a database. Future phases must decide migration only after regression characterization.

## Error and shutdown boundary

Initialization is guarded. Configuration, Storage, logger, and renderer failures are surfaced via logs/console and a desktop error dialog where possible. Uncaught exceptions and rejected promises are fatal and controlled. Shutdown writes a final structured log entry. If Storage itself cannot be initialized, writing to its log directory is impossible; the error is still surfaced through stderr and the desktop dialog.

## Application state

`src/core/app-state.js` declares the PRD workflow vocabulary and initializes to `IDLE`. Phase 1 does not execute transitions or claim completed business work.

## Phase 2 bill-ingestion boundary

`src/services/bill-ingestion/` now owns local PDF loading and validation, page-aware text extraction, semantic section segmentation, metadata/item/Bed Details parsing, syntactic code normalization, exact-expression aggregation, Patient Payable exclusion, diagnostics, and Normalized Bill Model creation.

```text
Local PDF → pdf-loader → page-aware extracted document → bill-parser → BillDocument
```

Every page retains raw text and page number. Every extracted section/item retains page and raw source context. Patient Payable is represented as an excluded semantic context, including nested IP Pharmacy; exclusion is marker/context based rather than page based. Aggregation includes only primary items and groups only exact normalized expressions within the same semantic section. No rate validation or CGHS quantity/business calculation occurs.

The Electron main process exposes one controlled `bill:select-and-parse` operation through preload. The renderer can select a PDF and display parsing status/counts; it receives no unrestricted filesystem API.

`src/services/settlement/README.md` is the only new settlement artifact. Registration-ID reconciliation, IP-first/OP-fallback matching, Bill No/UHID enrichment, and settlement statuses remain a separate future service and are not imported into parsing.

## Phase 3 deterministic CGHS service

`src/services/cghs/` consumes the Phase 2 `BillDocument` and produces a machine-readable `EnhancementPlan` without portal access.

```text
BillDocument
  ├─ exact direct-code aggregates → rate repository
  ├─ Bed Details / Room Rent → CN002, CC001, WC001 rules → rate repository
  └─ oxygen source rows → CC002 rule → rate repository
                              ↓
                       EnhancementPlan
```

The rate-list layer loads, validates, normalizes, indexes, and looks up local JSON sources. The only repository rate data is a 1,998-record snapshot extracted byte-for-byte from the embedded `MASTER_CGHS` object in `CGHS_Billing_Suite_Pro.html`. Its source/effective version cannot be proven, so metadata and every resulting plan identify it as `RATE_SOURCE_UNDEFINED`; its rates are visible as reference evidence but cannot produce financial amounts. A separately supplied source explicitly marked `AUTHORITATIVE` can produce deterministic rate × quantity amounts. Auditable custom/local entries are indexed separately and never overwrite source records.

Dedicated rules preserve legacy behavior: CN002 uses ICU rows ×3 plus supported ward rows ×2; CC001 counts ICU evidence; WC001 counts supported ward evidence; and CC002 evaluates oxygen rows as half day 12/full day 24/unqualified legacy single unit 1. Ambiguous categories or oxygen phrases return `REVIEW_REQUIRED`. Raw CN002/CC001/WC001 and raw C002/CC002 candidates are rejected from direct counting and retained in audit.

Compound syntax is consumed from Phase 2. Each base component is looked up, but expressions with qualifiers or multiple components remain `UNRESOLVED_COMPOUND`/`RULE_UNDEFINED`; no `+L` semantics are invented.

The Electron renderer receives the plan through the existing controlled PDF operation and shows a small diagnostics table. No rate-editing UI, portal operation, Registration-ID matching, or Settlement/Reconciliation processing is exposed.

## Phase 4 legacy portal boundary

```text
EnhancementPlan → plan-adapter.js safety gate → portal-execution-service.js
  → python-runner.js JSON child process → portal_bridge.py
  → existing BatchAutomationThread / TreatmentPlanOrchestrator
  → Chrome CDP 127.0.0.1:9222 → verified portal rows → execution audit
```

The adapter passes structured code, final quantity, evidence, rule/reason, classification, derived flag, and audit metadata only. Unsafe and excluded records remain in the audit and never invoke Selenium. The bridge contains no selectors or CGHS rules: it synchronously invokes the existing executor in `app (1).py`. Minimal additive instrumentation records per-action `EXECUTED`, `ALREADY_PRESENT`, or `FAILED` outcomes while preserving legacy PyQt signals, retries, diagnostics, reconciliation, and final audit behavior.

Electron exposes allowlisted preview and explicit execute IPC calls. The UI shows executable/blocked counts, requires confirmation, reports verification/status, and renders the structured audit. It never handles credentials or login. Settlement/Reconciliation is not imported.

## Development and packaging

- Install pinned dependencies: `npm install`
- Run locally: `npm start`
- Development environment: `npm run dev` (POSIX shell; on Windows set `VNEXT_ENV=development` before `npm start`)
- Run foundation unit tests: `npm test`
- Run Electron launch/IPC/shutdown smoke test: `npm run test:desktop`
- Create an unpacked host-platform package: `npm run build:dir`
- Target Windows portable EXE: `npm run build:win`

The current Phase 1 output target is an Electron Builder Windows x64 portable EXE (`CGHS-Billing-Suite-VNEXT-<version>-<arch>.exe`). It is a packaging direction, not a release-ready artifact. Code signing, installer UX, icons, Windows hardware validation, and final portable/installer policy remain unresolved for Phase 9.
