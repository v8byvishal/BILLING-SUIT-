# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 7 — Post-Discharge Final Bill Ingestion, Pharmacy/Consumables Extraction & Completed-Bill Storage: complete for review.**

The user remains responsible for portal verification and manual discharge. Phase 7 adds no portal navigation, discharge click, login, final-bill upload, folder watcher, settlement, or reconciliation service.

## Final bill workflow

`src/services/final-bill/` reuses the Phase 2 `ingestBillPdf` pipeline and keeps INITIAL BILL and FINAL BILL as distinct normalized models. The CompletedBill links source hashes/files, safe metadata, the historical EnhancementPlan reference, optional execution audit reference, extracted/excluded/review records, reconciliation, storage audit, run ID, timestamp, and status. It does not duplicate full PDF text.

Supported explicit sections:

- IP Pharmacy
- OP Pharmacy
- OT Pharmacy
- OT Consumables
- Ward/Room Consumables
- Cathlab Consumables
- Generic Consumables
- Other clearly labelled `<name> Consumables`

Patient Payable remains excluded. Aggregation is exact and section-scoped. Explicit codes reuse existing reference/custom resolution. Unknown, compound, invalid, uncoded, missing-section, and ambiguous-heading cases remain review-required. Final enrichment never mutates or reruns the EnhancementPlan.

## Matching and status

Exact comparisons use bill number, UHID, and IP number. Any present conflict returns `MATCH_REQUIRED`; no shared identifier also requires matching. The UI permits an explicit operator/reason manual resolution. Review-free matched records are `PARSED`; unresolved records are `REVIEW_REQUIRED`; only durable save changes status to `COMPLETED`.

## External storage

Packages are written outside the executable:

`Storage/Bills/YYYY/MM/<bill-run-vN>/`

- `final/<source PDF>` when a local final path is provided
- `normalized/completed-bill.json`
- `audit/extraction-audit.json`

`Storage/Bills/completed-index.json` tracks final SHA-256, run, version, and package path. Duplicate hashes return `DUPLICATE_FINAL_PDF`. Explicit reprocessing creates version N+1 without overwriting history. Temporary directories and atomic JSON rename are used; failures return `SAVE_FAILED` and never report completion.

## Fixtures and validation

Synthetic fixture: `tests/fixtures/bills/final-bill-sections.json`.

Phase 7 adds 22 deterministic cases for all supported sections, multi-page extraction, Patient Payable exclusion, same-section duplicates, cross-section separation, unknown/compound/missing/ambiguous review, deterministic match/mismatch/manual resolution, duplicate hash, save success/failure, reprocessing versioning, and a 1,000-row final bill.

- Before Phase 7: **83 tests**.
- After Phase 7: `npm test` — **105 passed, 0 failed, 0 skipped**.
- JavaScript syntax checks over all `src/**/*.js`: passed.
- Python syntax checks for `app (1).py` and `portal_bridge.py`: passed; Phase 7 changed no Python.
- `git diff --check`: passed.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Reference snapshot SHA-256 remains `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`.
- Real PDF regression: **NOT RUN**; named production PDFs were not accessible in the workspace.
- Live portal testing: **NOT RUN — LIVE PORTAL REQUIRED**.

## Preserved boundaries

- The 1,998-record snapshot remains `RATE_SOURCE_UNDEFINED` and unchanged.
- Custom registry, review queue, registry hashes, and `PLAN_STALE` remain intact.
- Phase 4 EnhancementPlan → adapter → legacy Selenium/CDP remains unchanged in architecture.
- `src/services/settlement/` remains isolated and untouched.

## Git

- Branch: `arena/01a0de46-billing-suit`
- Phase 6 commit: `577a677`
- PR #1 remains open and must not be merged automatically.
- Phase 7 commit is pending at the time of this entry.

## Stop point

Stop after Phase 7. Do not begin automated discharge/download, folder watching, broader portal control, Settlement/Reconciliation, or advanced AI review.
