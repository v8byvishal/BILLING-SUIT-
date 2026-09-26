# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 9 — Production Bill Validation, Discrepancy Detection & Real-PDF Regression Harness: complete for review.**

Phase 9 adds an evidence-first validation layer around existing normalized bill, EnhancementPlan, custom registry, final extraction, and persistent case artifacts. It does not change parsing/rules, produce actions, guess codes, update baselines, or add OCR/portal/discharge/settlement behavior.

## Validation engine

`src/services/validation/bill-validator.js` consumes exactly one existing BillDocument and EnhancementPlan plus a reviewed expected JSON. Machine-readable reports include fixture/case/run/source identity, parser/plan versions, custom registry context, matches, blocked records, discrepancies, open review records, counts, and concise source evidence.

Implemented findings:

- `EXTRA_CODE`
- `POSSIBLY_MISSING_CODE`
- `QUANTITY_MISMATCH`
- `STATUS_MISMATCH`
- `SECTION_MISMATCH`
- `EXCLUSION_MISMATCH`
- `DERIVED_QUANTITY_MISMATCH`
- `COMPOUND_STATUS_MISMATCH`
- `UNKNOWN_CODE`
- `UNRESOLVED_COMPOUND`
- `RULE_UNDEFINED`
- `REVIEW_REQUIRED`

A missing code is named only when the reviewed expected entry includes concrete row/page/rule evidence. Otherwise a code-free review finding is emitted. Derived CN002/CC001/WC001/CC002 checks retain rule-vs-plan layer evidence. Patient Payable leakage is high-visibility exclusion mismatch. Pharmacy/consumable validation remains enrichment-only.

## Human review and persistence

`validation-store.js` persists reports beneath `Storage/Cases/<case-id>/validation/` and records case audit. Human decisions are limited to `CONFIRMED`, `FALSE_POSITIVE`, `EXPECTED_VARIATION`, and `NEEDS_REVIEW`; they annotate findings and never auto-fix. Validation discrepancies extend the existing Phase 6 review queue.

The minimal UI selects an expected JSON for the active case, shows summary/discrepancy evidence, and records classifications. Expected files are never written by runtime validation.

## Real-PDF harness

- Command: `npm run test:real-bills`
- Discovery: `tests/fixtures/bills/real/<fixture-id>/`
- Required local files: one PDF plus `expected.json`
- Privacy gate: `metadata.privacy_approval_status` must equal `APPROVED`
- Documentation/template: `tests/fixtures/bills/real/README.md` and `expected.template.json`
- Optional external fixture root: `VNEXT_REAL_FIXTURES`

The harness performs one PDF parse, one plan evaluation, and one validation pass. It writes `actual-report.json`; it never creates or updates expected baselines.

Actual result in this workspace:

**REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE**

The named 40332/40343/39951/38222 PDFs were not accessible. Synthetic tests are not represented as production validation.

## Validation results

- Before Phase 9: **129 tests**.
- Phase 9 adds **26 deterministic tests**.
- After Phase 9: `npm test` — **155 passed, 0 failed, 0 skipped**.
- JavaScript syntax checks over every `src/**/*.js`: passed.
- Python syntax checks for `app (1).py` and `portal_bridge.py`: passed; Phase 9 changed no Python.
- `git diff --check`: passed.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Reference snapshot SHA-256 remains `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`.
- Live portal testing: **NOT RUN — LIVE PORTAL REQUIRED**.

## Preserved boundaries

No fuzzy matching, valid-code blacklist, AI guessing, OCR, automated discharge, portal final-bill download/upload, or Settlement/Reconciliation was added. Phase 4 browser execution, Phase 6 custom registry/PLAN_STALE, Phase 7 completed storage, and Phase 8 case locking/recovery remain intact.

## Git

- Branch: `arena/01a0de46-billing-suit`
- Phase 8 commit: `91e0cef`
- PR #1 remains open and must not be merged automatically.
- Phase 9 commit is pending at the time of this entry.

## Stop point

Stop after Phase 9. Do not begin OCR, automated discharge/download, broader portal control, Settlement/Reconciliation, or autonomous code generation.
