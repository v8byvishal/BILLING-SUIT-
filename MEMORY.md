# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 8 — Folder-Based Bill Intake, One-Bill Workflow State Machine & Operational Case Management: complete for review.**

Phase 8 wraps the existing parser, planner, custom registry, Phase 4 executor boundary, and Phase 7 final-bill service in persistent case orchestration. It adds no parser, Selenium engine, OCR, portal discharge/upload/download, settlement, AI review, or background autonomous service.

## External intake and cases

The existing configurable external Storage root now creates:

- `Storage/Inbox/Initial/`
- `Storage/Inbox/Final/`
- `Storage/Cases/<case-id>/{initial,enhancement,final,normalized,audit}/`

Manual scans are sorted and metadata-first. Hidden, temporary (`.tmp`, `.part`, `.crdownload`), and non-PDF files are ignored. A candidate must have unchanged size/mtime over two observations and satisfy minimum age before SHA-256 calculation and registration. Inbox sources are copied into case storage and never automatically deleted. Archive failures are explicit.

## Persistent case model

Atomic case manifests retain case/version/parent identity, initial/final source references and hashes, bill number/UHID/IP number, state/stage, timestamps, EnhancementPlan and registry revision/hash references, execution/final/completed references, review flags, and errors. A SHA-256 index returns `EXACT_DUPLICATE`/`KNOWN_SOURCE`; explicit reprocessing creates a linked version rather than overwriting history. COMPLETED manifests are immutable.

The allowlisted state machine includes NEW, INGESTING, READY_FOR_PLAN, PLAN_READY, REVIEW_REQUIRED, READY_FOR_PORTAL, PORTAL_EXECUTING, PORTAL_EXECUTED, VERIFICATION_REQUIRED, DISCHARGE_REQUIRED, FINAL_BILL_REQUIRED, FINAL_BILL_LOADED, FINAL_BILL_REVIEW_REQUIRED, MATCH_REQUIRED, READY_TO_SAVE, COMPLETED, FAILED, BLOCKED, and RECOVERY_REQUIRED. Every transition is audited with event ID, case ID, timestamp, previous/new state, reason, and limited source reference.

## Lock and recovery

`Storage/Cases/active-case-lock.json` records case ID, random ownership token, PID, acquisition, and heartbeat. A live lock prevents another case from replacing the browser context or executing simultaneously. Only the owner releases it. Dead/expired locks are recoverable. On restart, any `PORTAL_EXECUTING` case becomes `RECOVERY_REQUIRED`; portal automation never auto-resumes.

Existing relevant-record `PLAN_STALE` checks remain enforced before the lock/executor boundary. The exact persisted plan and custom registry revision/hash are retained in each case.

## Manual checkpoints and final continuation

Portal result verification and manual discharge are separate explicit operator acknowledgements. Discharge confirmation only writes audit/state and performs no portal action. Final PDFs attach to the active FINAL_BILL_REQUIRED case through Phase 7 exact identifier reconciliation; no recent-case fallback exists. Final extraction/storage advances the same case to READY_TO_SAVE/COMPLETED.

## Minimal UI

The shell adds an Operational Cases queue with case ID, bill number, status, update time, review flags, Open, manual Initial/Final inbox scans, and state-gated verification/discharge acknowledgement. It does not auto-switch a locked case and has no background polling dashboard.

## Validation

- Before Phase 8: **105 tests**.
- Phase 8 adds **24 deterministic tests** for source deduplication, file stability/partial/temp handling, restart persistence, active lock/stale recovery, plan registry identity/staleness, final association, completed immutability/reprocessing, interrupted execution recovery, manual discharge boundary, transition/audit rules, archive failure, queued isolation, and a 200-PDF inbox.
- After Phase 8: `npm test` — **129 passed, 0 failed, 0 skipped**.
- JavaScript syntax checks over every `src/**/*.js`: passed.
- Python syntax checks for `app (1).py` and `portal_bridge.py`: passed; Phase 8 changed no Python.
- `git diff --check`: passed.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Reference snapshot SHA-256 remains `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`.
- Real PDF regression: **NOT RUN**; privacy-approved production PDFs remain unavailable.
- Live portal testing: **NOT RUN — LIVE PORTAL REQUIRED**.

## Preserved boundaries

- Phase 4 Selenium/CDP remains the only browser executor.
- Phase 6 custom registry/review and PLAN_STALE remain intact.
- Phase 7 CompletedBill packages remain under `Storage/Bills/` and readable.
- The reference snapshot remains `RATE_SOURCE_UNDEFINED`.
- `src/services/settlement/` remains isolated and untouched.

## Git

- Branch: `arena/01a0de46-billing-suit`
- Phase 7 commit: `4cf408d`
- PR #1 remains open and must not be merged automatically.
- Phase 8 commit is pending at the time of this entry.

## Stop point

Stop after Phase 8. Do not begin automated portal upload/download/discharge, OCR, advanced AI review, or Settlement/Reconciliation.
