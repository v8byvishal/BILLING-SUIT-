# Storage Migration — Phase 2

## Purpose

Phase 2 introduces `StorageService` as the authoritative runtime persistence layer while preserving existing service data. Migration is intentionally non-destructive and idempotent.

## Old structure

Phase 1 created canonical folders and compatibility folders, but persistent runtime data was still split across older services and a Phase 1 settings file.

Known pre-Phase 2 locations:

| Path | Purpose | Status in Phase 2 |
|---|---|---|
| Electron `userData/phase1-settings.json` | Phase 1 non-secret settings | Migrated to `Storage/Config/application-settings.json` if target does not already exist. |
| `Storage/Cases/` | Existing case manifests, normalized bills, plans, workflow audit | Retained unchanged. |
| `Storage/Custom_Codes/` | Custom code registry and audit | Retained unchanged. |
| `Storage/Inbox/Initial`, `Storage/Inbox/Final` | Inbox scanner/watcher folders | Retained unchanged. |
| `Storage/Bills/` | Existing completed-bill packages | Retained unchanged. |
| `Storage/Logs/` | Existing logs and watcher JSONL | Retained unchanged. |
| `Storage/Failed/` | Historical failure compatibility folder | Retained unchanged; new failure records use `Storage/Failures/`. |
| `Storage/Reports/`, `Storage/Supporting_Sections/` | Historical/compatibility folders | Retained unchanged. |

## New structure

Phase 2 canonical folders:

```text
Storage/
  Source_Bills/
  Final_Bills/
  Audit/
  Failures/
  Temp/
  Config/
```

New Phase 2 files:

```text
Storage/Config/storage-manifest.json
Storage/Config/application-settings.json
Storage/Config/source-bills-index.json
Storage/Config/bill-sessions/<billSessionId>.json
Storage/Source_Bills/<billSessionId>/source.pdf
Storage/Source_Bills/<billSessionId>/metadata.json
Storage/Final_Bills/<billSessionId>/metadata.json
Storage/Audit/audit-YYYY-MM-DD.jsonl
Storage/Failures/<failureId>.json
```

## Migration behavior

On startup, `StorageService.initialize()`:

1. resolves the external Storage root;
2. creates missing canonical and compatibility directories;
3. cleans stale application-generated temp files only;
4. checks known metadata JSON files for corruption;
5. creates or reloads `storage-manifest.json`;
6. migrates Phase 1 settings from Electron `userData/phase1-settings.json` to `Storage/Config/application-settings.json` if and only if the Phase 2 settings file does not already exist;
7. returns a recovery summary.

## Idempotency

Migration is idempotent:

- Running initialization repeatedly does not duplicate canonical folders.
- Existing `application-settings.json` is not overwritten by legacy settings migration.
- Existing source bill records are not overwritten during duplicate import; SHA-256 duplicate detection returns `DUPLICATE_SOURCE_BILL`.
- Existing case/custom-code/inbox/bills/logs compatibility data is not moved or deleted.

## Failure behavior

- If Storage root is unavailable or not a directory, status is `ACCESS_ERROR`; `ensureStorage()` fails safely instead of falling back into the app directory.
- If Storage is readable but not writable, health reports `READ_ONLY`.
- If critical JSON is invalid, status/operation result is `CORRUPT` where applicable; the corrupt artifact is preserved as `.corrupt-<timestamp>` where practical.
- Historical files are not silently replaced with empty objects.
- Failures are recorded under `Storage/Failures/` when Storage itself is usable.

## Rollback behavior

Phase 2 does not perform destructive migrations, so rollback consists of running older code against the same Storage root:

- Existing compatibility folders remain in their previous locations.
- Phase 2-added canonical files can remain unused by older code.
- Do not delete `Source_Bills`, `Final_Bills`, `Audit`, `Failures`, `Temp`, or `Config` unless an operator has separately backed up required data.

## Legacy compatibility consumers

| Compatibility path | Current consumer | Reason retained | Migration status |
|---|---|---|---|
| `Cases` | `src/services/cases/case-store.js`, `case-workflow-service.js`, validation services | Existing case state machine and artifacts depend on it. | Retained; future migration must be tested separately. |
| `Custom_Codes` | `src/services/custom-codes/custom-code-registry.js` | Registry persistence depends on this path. | Retained. |
| `Inbox/Initial`, `Inbox/Final` | `src/services/cases/inbox-scanner.js`, `inbox-watcher.js` | Existing inbox workflow depends on these folders. | Retained. |
| `Bills` | `src/services/final-bill/completed-bill-storage.js` | Existing completed package storage uses this path. | Retained; Phase 2 only adds canonical final-bill artifact mechanism. |
| `Logs` | `src/core/logger.js`, desktop bootstrap, inbox watcher | Runtime logging depends on this path. | Retained. |
| `Failed` | Historical compatibility folder | Avoid destructive removal of previous failure data. | Retained; new failure records use `Failures`. |
| `Reports`, `Supporting_Sections` | Historical/compatibility paths | Preserved because old workflows may reference them. | Retained. |

## Security notes

Migration and settings persistence do not store:

- portal passwords;
- credentials;
- API keys;
- access tokens;
- authentication cookies;
- browser session objects;
- CDP secrets.

Diagnostics and failure messages are sanitized.
