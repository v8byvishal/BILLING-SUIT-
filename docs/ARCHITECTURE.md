# Architecture — Phase 2 External Storage Foundation

CGHS Billing & Enhancement Suite V2 remains a local vanilla Electron/JavaScript desktop application. Phase 2 adds a production-grade external runtime data layer without changing validated parser, CGHS, final-bill, portal, Selenium/CDP, or Python executor behavior.

## Runtime boundary

```text
Renderer UI
  ↓ window.cghsSuite only
Preload bridge
  ↓ cghs-suite:operation IPC contract
Electron main process
  ↓ controlled service calls
StorageService
  ↓ external Storage root outside app package
Existing Node domain services and adapters
```

Renderer code must not access arbitrary filesystem APIs, child processes, Python, Selenium, Storage folder manipulation, or CGHS rule logic. Storage access is mediated by main-process handlers and `StorageService`.

## Authoritative storage abstraction

`src/core/storage.js` is the single authoritative runtime storage abstraction. It exports `StorageService` plus compatibility functions used by older tests/services.

Core responsibilities:

- `resolveRoot()`
- `initialize()`
- `healthCheck()`
- `ensureDirectories()`
- `getStatus()`
- `writeFile()` / `readFile()`
- `moveFile()` / `copyFile()`
- `deleteTempFile()`
- `writeJson()` / `readJson()`
- `appendAudit()`
- `appendFailure()`
- `createTempPath()`
- `openFolder()`
- `getUsageSummary()`
- `importSourceBill()`
- `getSourceBillRecord()` / `listSourceBills()`
- `writeBillSession()` / `readBillSession()` / `listBillSessions()`
- `ensureFinalBillPlaceholder()` / `storeFinalBillFile()`

## Root resolution

Default root:

```text
<ApplicationData>/CGHS-Billing-Suite/Storage
```

Electron supplies `<ApplicationData>` through `app.getPath('appData')`. The resolver rejects any root inside the application package.

## Directory contract

Canonical folders:

```text
Storage/Source_Bills
Storage/Final_Bills
Storage/Audit
Storage/Failures
Storage/Temp
Storage/Config
```

Compatibility folders retained:

```text
Storage/Cases
Storage/Bills
Storage/Custom_Codes
Storage/Inbox/Initial
Storage/Inbox/Final
Storage/Logs
Storage/Reports
Storage/Supporting_Sections
Storage/Failed
```

Compatibility folders are non-destructive and remain because current services still consume them.

## Manifest

`Storage/Config/storage-manifest.json` contains:

- `schemaVersion`
- `product`
- `createdAt`
- `lastValidatedAt`
- `storageRoot`
- canonical directory presence map

No secrets are stored. Schema versioning supports future migrations.

## Source bill storage

A source import creates:

```text
Storage/Source_Bills/<billSessionId>/source.pdf
Storage/Source_Bills/<billSessionId>/metadata.json
```

Metadata stores import facts only: `billSessionId`, `sourceBillId`, original/stored filename, import timestamp, size, SHA-256, MIME type, and status. Storage does not invent patient names, bill numbers, pages, dates, or parser output.

Duplicate detection uses SHA-256 through `Storage/Config/source-bills-index.json`. Uploading the same bytes again returns `DUPLICATE_SOURCE_BILL` and references the existing artifact.

## Bill-session registry

Each durable session record lives at:

```text
Storage/Config/bill-sessions/<billSessionId>.json
```

The registry stores source, plan, final-bill path references and durable status. It does not store renderer memory, window handles, process handles, Selenium/CDP state, browser credentials, cookies, tokens, or auth payloads.

## Audit and failure storage

Audit records are structured JSONL entries in:

```text
Storage/Audit/audit-YYYY-MM-DD.jsonl
```

Failure records are structured JSON files in:

```text
Storage/Failures/<failureId>.json
```

Both are sanitized and avoid raw environment dumps, credentials, tokens, cookies, or browser-profile secrets.

## Atomic writes and corruption handling

Critical JSON writes use temporary files under `Storage/Temp`, flush/close, then rename to the final path. Invalid JSON is detected and preserved as a `.corrupt-<timestamp>` copy where practical. The original corrupt data is not silently replaced with an empty object.

## Startup recovery

On initialization, StorageService:

1. resolves the root;
2. ensures canonical and compatibility directories;
3. cleans stale application-generated temp artifacts only;
4. checks known metadata files for corruption;
5. validates/updates the manifest;
6. migrates legacy Phase 1 settings when needed;
7. returns a recovery summary.

Historical data is not deleted during recovery.

## UI and diagnostics

The Phase 2 UI shows real storage health, persisted source records, persistent audit history, and actual configured Storage root. Diagnostics include storage root, manifest status, health result, read/write/temp probes, recovery summary, usage summary, and record counts.
