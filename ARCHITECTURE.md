# Architecture

This repository is a local vanilla Electron/JavaScript desktop application. Phase 2 adds an authoritative external runtime persistence layer while preserving existing domain services, parser behavior, CGHS rules, portal adapters, final-bill logic, and the legacy Python/Selenium executor.

For detailed Phase 2 storage architecture, see `docs/ARCHITECTURE.md`, `docs/PHASE_02_IMPLEMENTATION.md`, and `docs/STORAGE_MIGRATION.md`.

## Runtime layering

```text
Renderer UI (src/ui, vanilla HTML/CSS/JS)
  ↓ controlled preload API: window.cghsSuite
Preload bridge (src/desktop/preload.js)
  ↓ declared IPC operation contract
Electron main process (src/desktop/main.js)
  ↓ service orchestration
StorageService (src/core/storage.js)
  ↓ external Storage root outside application package
Node domain services and adapters
  ↓ where already implemented
Legacy Python/Selenium/CDP portal executor
```

The renderer does not directly access Node filesystem APIs, shell commands, Python, Selenium, CGHS rule internals, or arbitrary Storage manipulation. Privileged work must flow through the preload bridge and a declared IPC handler.

## External Storage root

The canonical default root is resolved from Electron's standard application data location:

```text
<ApplicationData>/CGHS-Billing-Suite/Storage
```

The resolver rejects paths inside the application package. Operational data must not silently fall back into the repository, Desktop, Downloads, Program Files, or the installed app directory.

## Canonical Storage contract

```text
Storage/
  Source_Bills/
  Final_Bills/
  Audit/
  Failures/
  Temp/
  Config/
```

Compatibility folders remain present for existing services:

```text
Cases/
Bills/
Custom_Codes/
Inbox/Initial/
Inbox/Final/
Logs/
Reports/
Supporting_Sections/
Failed/
```

These compatibility folders are documented and retained non-destructively until their consumers are migrated in a later controlled phase.

## StorageService responsibilities

`src/core/storage.js` exports `StorageService`, the authoritative runtime persistence abstraction. It owns:

- root resolution and package-directory rejection;
- canonical/compatibility directory creation;
- real health checks with read/write/temp create/remove verification;
- manifest creation/reload at `Storage/Config/storage-manifest.json`;
- atomic file/JSON writes through temp + fsync + rename;
- corruption detection and preservation of invalid JSON artifacts;
- source bill import under `Storage/Source_Bills/<billSessionId>/`;
- SHA-256 and size integrity checks;
- duplicate source detection by SHA-256;
- bill-session registry under `Storage/Config/bill-sessions/`;
- final bill placeholder/storage mechanism under `Storage/Final_Bills/<billSessionId>/`;
- structured audit/failure records;
- application-generated temp cleanup and startup recovery summaries;
- allowlisted folder opening and on-demand usage summaries.

## Persistent records

### Source bill

`Storage/Source_Bills/<billSessionId>/metadata.json` stores only import facts: schema version, session/source id, original filename, stored filename, import time, file size, SHA-256, MIME type, and import status. Parser-derived patient, bill, date, page, and section information is not fabricated by storage.

### Bill session

`Storage/Config/bill-sessions/<billSessionId>.json` stores source/final/plan paths and durable workflow status. It does not store renderer state, BrowserWindow objects, Selenium handles, process handles, credentials, cookies, or tokens.

### Audit and failure

Audit records are JSON lines in `Storage/Audit/audit-YYYY-MM-DD.jsonl`. Failure records are JSON files in `Storage/Failures/`. Messages and diagnostic fields are sanitized to avoid secrets.

## Status semantics

Storage health uses explicit statuses:

- `NOT_INITIALIZED`
- `INITIALIZING`
- `READY`
- `READ_ONLY`
- `ACCESS_ERROR`
- `CORRUPT`
- `ERROR`

Operational outcomes distinguish `SUCCESS`, `DUPLICATE`, `DUPLICATE_SOURCE_BILL`, `NOT_FOUND`, `INVALID`, `CORRUPT`, `READ_ONLY`, `ACCESS_ERROR`, and `IO_ERROR` rather than collapsing failures to `false`, `null`, or empty arrays.

## IPC and preload policy

The Phase 2 IPC channel remains controlled by `src/desktop/ipc-contract.js`. Storage operations added in Phase 2 include source-record listing and usage summary. Folder opening is allowlisted by folder key; there is no generic shell execution API.

## Preserved business boundaries

Phase 2 does not change:

- CGHS mapping/rule semantics;
- parser semantics;
- portal duplicate prevention, portal quantity reconciliation, speciality logic, locked quantity handling, Selenium workflow, or CDP behavior;
- final-bill business logic;
- legacy Python executor ownership of browser automation.

Portal readiness is still `NOT VERIFIED` until authenticated validation exists.
