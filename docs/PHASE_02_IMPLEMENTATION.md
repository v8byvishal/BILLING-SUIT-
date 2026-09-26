# Phase 02 Implementation — External Storage, Persistent Runtime Data & Recovery Foundation

Date: 2026-09-27
Branch: `arena/01a0dfad-billing-suit`
Baseline: `395acad1d2a765fb741172c81adb9c77c298d404`
Commit target: `phase-02: external storage and runtime persistence foundation`

## Scope delivered

Phase 2 establishes a reliable external runtime persistence layer. It does not change CGHS mappings, CGHS rules, PDF parser semantics, EnhancementPlan semantics, Selenium/CDP behavior, portal automation, final PDF composition, automatic discharge, or credential handling.

Delivered infrastructure:

1. One authoritative `StorageService` in `src/core/storage.js`.
2. External default root contract: `<ApplicationData>/CGHS-Billing-Suite/Storage`.
3. Real Storage health verification with read/write/temp probes.
4. Storage manifest at `Storage/Config/storage-manifest.json`.
5. Source bill file/metadata persistence.
6. SHA-256 identity and duplicate source detection.
7. Persistent bill-session registry.
8. Final-bill placeholder and artifact storage mechanism.
9. Atomic JSON writes.
10. Corrupted JSON detection/preservation.
11. Persistent audit and failure records.
12. Temp lifecycle and startup recovery summary.
13. Allowlisted folder opening.
14. On-demand usage summaries.
15. UI integration for storage status, persisted source records, audit history, settings root, and diagnostics.
16. Phase 2 regression tests.

## Storage root

At runtime, Electron supplies the application data directory through `app.getPath('appData')`. The resolver builds:

```text
<ApplicationData>/CGHS-Billing-Suite/Storage
```

The resolver rejects roots inside the application package. No operational files are stored under the repository or packaged app directory unless the operator explicitly configures a supported external path in a later flow.

## Directory contract

Canonical folders:

```text
Storage/
  Source_Bills/
  Final_Bills/
  Audit/
  Failures/
  Temp/
  Config/
```

Compatibility folders retained:

```text
Storage/
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

## Health semantics

Supported Storage statuses:

- `NOT_INITIALIZED`
- `INITIALIZING`
- `READY`
- `READ_ONLY`
- `ACCESS_ERROR`
- `CORRUPT`
- `ERROR`

`READY` requires all of the following:

- root exists;
- canonical subdirectories exist;
- root can be read;
- root can be written;
- temporary file can be created;
- temporary file can be read;
- temporary file can be removed.

Probe files are removed after checks.

## Manifest

`Storage/Config/storage-manifest.json` has schema version 1 and stores:

- product name;
- created timestamp;
- last validated timestamp;
- storage root;
- canonical directory presence map.

No sensitive values are stored.

## Source bill storage

On source import:

```text
Storage/Source_Bills/<billSessionId>/source.pdf
Storage/Source_Bills/<billSessionId>/metadata.json
```

Metadata includes:

```json
{
  "schemaVersion": 1,
  "billSessionId": "...",
  "sourceBillId": "...",
  "originalFileName": "...",
  "storedFileName": "source.pdf",
  "importedAt": "...",
  "fileSize": 0,
  "sha256": "...",
  "mimeType": "application/pdf",
  "status": "IMPORTED"
}
```

Storage does not fabricate patient name, bill number, dates, pages, sections, parser results, or EnhancementPlan data.

## Duplicate detection and integrity

- SHA-256 is calculated from source bytes and verified after copy.
- File size is verified after copy.
- `Storage/Config/source-bills-index.json` maps SHA-256 to the owning `billSessionId`.
- Re-importing identical bytes returns `DUPLICATE_SOURCE_BILL` and references the existing stored artifact.
- Same original filename with different content is allowed as a different source identity.
- Missing or corrupted stored PDFs are reported as `MISSING` or `CORRUPTED`; metadata is not deleted.

## Bill session registry

Each session record is stored at:

```text
Storage/Config/bill-sessions/<billSessionId>.json
```

Record fields include schema version, `billSessionId`, `sourceBillId`, created/updated timestamps, status, `sourcePath`, `enhancementPlanPath`, and `finalBillPath`.

Transient UI state, Electron objects, Selenium objects, process handles, file descriptors, credentials, cookies, tokens, and browser auth state are not persisted.

## Final bill storage

Phase 2 creates a storage mechanism only:

```text
Storage/Final_Bills/<billSessionId>/metadata.json
Storage/Final_Bills/<billSessionId>/final-bill.pdf   # only when a real final file is provided
```

Initial metadata uses `NOT_GENERATED` with null path/hash. Phase 2 does not create fake final bills and does not implement final PDF composition.

## Atomic writes

Important JSON writes use:

```text
write temp file under Storage/Temp
→ fsync/close
→ rename to final path
```

This avoids half-written JSON after interruption where the filesystem supports atomic rename.

## Corruption handling

Invalid JSON is handled without crashing:

1. parse error is detected;
2. the corrupt artifact is copied to a `.corrupt-<timestamp>` file where practical;
3. state is marked `CORRUPT`;
4. original valuable data is not replaced with `{}`;
5. diagnostics/recovery summaries expose the issue.

## Recovery

On startup, `StorageService.initialize()`:

1. resolves root;
2. creates/validates directory structure;
3. removes stale application-generated temp files only;
4. inspects known metadata files for corruption;
5. validates and updates the manifest;
6. migrates Phase 1 settings if needed;
7. returns a recovery summary.

Recovery never deletes historical source bills, final bills, audit records, failure records, or session metadata.

## UI integration

Phase 2 UI displays real values:

- Dashboard: Storage status, root, manifest status, write-probe result.
- Source Bills: persisted source records from `Storage/Source_Bills`.
- Audit / History: persistent audit records from `Storage/Audit`.
- Settings: configured Storage root from persisted settings/status.
- Diagnostics: root, manifest status, health result, recovery summary, usage summary, and record counts.

## Security boundaries

Storage is not a secret store. Phase 2 rejects or redacts passwords, credentials, cookies, tokens, API keys, and auth/session payloads in settings, diagnostics, audit/failure records, and serialized details.

No unrestricted shell, Python, Node, JavaScript eval, process execution, or arbitrary filesystem API is exposed to the renderer.

## Validation performed

Commands executed:

```bash
node --check src/core/storage.js src/services/diagnostics/diagnostics-service.js src/desktop/ipc-contract.js src/desktop/preload.js src/desktop/main.js src/ui/renderer.js tests/unit/phase2-storage-service.test.js
node --test tests/unit/phase2-storage-service.test.js
npm test
python3 -m unittest discover -s tests/python -p 'test_*.py'
npm run test:desktop
```

Results:

| Check | Result |
|---|---|
| Syntax checks | PASS |
| Phase 2 tests | PASS — 26/26 |
| Full Node suite | PASS — 313/313 after `npm ci --ignore-scripts` |
| Python unittest suite | PASS — 32/32 |
| Desktop smoke | FAIL/BLOCKED before launch — Electron binary unavailable because install scripts were skipped; error: `Electron failed to install correctly`. |

Initial `npm test` before dependency install failed because `pdf-lib` was missing; after dependency install, the full suite passed.

## Explicitly not delivered in Phase 2

- No parser fixes.
- No CGHS code/rule/mapping changes.
- No EnhancementPlan semantic changes.
- No Selenium/CDP/portal automation changes.
- No final PDF composition.
- No automatic discharge.
- No credential entry/storage.
- No live portal readiness claim.
