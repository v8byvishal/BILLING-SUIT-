# Phase 11 — Optional automatic inbox intake

The watcher is a thin lifecycle and bounded-queue layer around the existing Phase 8 `InboxScanner` and `CaseWorkflowService`. It performs automatic **periodic** scanning, not real-time filesystem watching.

## Defaults

- Enabled: `false`
- Poll interval: 30,000 ms
- Stability/minimum age: 1,000 ms, enforced by the existing scanner
- Maximum in-memory queue: 100
- Safe non-portal concurrency: 1 (hard-capped at 4)

Settings are in `config/default.json`. External Storage continues to define `Inbox/Initial` and `Inbox/Final`; no personal path is hard-coded.

## Safety boundary

The watcher can scan, hash, deduplicate, register/parse initial sources, and deterministically associate final sources. It does not receive or invoke Selenium, Chrome/CDP, portal execution, the active portal lock, discharge, credentials, upload/download, OCR, or settlement services. Initial and final candidates call separate existing workflow methods. An uncertain final association returns `MATCH_REQUIRED` and remains available for explicit operator handling.

Manual and automatic scans use the same scanner and case workflow. Persistent SHA-256 indexing remains authoritative across polling cycles and restarts. Queue overflow emits `QUEUE_FULL` and leaves source files untouched. Shutdown clears the timer and stops scheduling work. Audit events are appended locally to `Storage/Logs/inbox-watcher.jsonl`.

The small Operational cases control area exposes watcher state, start/pause/resume/stop controls, last scan, queue size, new-case, duplicate, waiting, and error counts. Automatic startup occurs only when `automaticInboxWatch.enabled` is explicitly true and never resumes portal execution.

## Validation boundary

- AUTOMATED WATCHER TESTING: offline deterministic scanner, queue, lifecycle, and boundary tests.
- LIVE PORTAL TESTING: not run and not required; the watcher never accesses the portal.
- REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE.
