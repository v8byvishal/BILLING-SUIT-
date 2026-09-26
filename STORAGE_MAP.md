# Storage Map

Backend: async adapter over localStorage (`sGet`/`sSet`/`sDel` → `window.storage`).

## Static keys
- `activity-log`
- `admin-pin`
- `app-settings`
- `backup-settings`
- `bill:`
- `bills-index`
- `daily-backups`
- `device-id`
- `device-session`
- `draft`
- `error-log`
- `file-library`
- `hospital-profile`
- `ingest-source-profiles`
- `install-at`
- `last-daily-backup`
- `local-rates`
- `pdf-history`
- `print-settings`
- `rate-overrides`
- `restore-points`
- `search-history`
- `sec-users`
- `security-audit`
- `settlement-audit`
- `settlement-master`
- `sync-config`
- `sync-handle-name`
- `sync-meta`

## Dynamic key prefixes
- `bill:<id>`
