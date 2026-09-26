# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 5 — Production PDF Regression, Parser Accuracy Hardening & Enhancement Validation: complete for review.**

Phase 1–4 architecture remains intact. Phase 5 patches the existing Phase 2 parser and Phase 3 plan only; it adds no parser replacement, Selenium engine, settlement, discharge, final-bill upload, storage automation, or unrelated UI.

## Real PDF status

The conversation listed `38222.pdf`, `40343.pdf`, `39951.pdf`, and `40332.pdf` as attachments, but `/home/user/uploads` and repository searches contained none of those files during implementation. Therefore:

**REAL PDF REGRESSION = NOT RUN**

No real-PDF result is claimed. Synthetic, de-identified production-structure fixtures are under `tests/fixtures/bills/`, with a documented path for adding reviewed real fixtures later.

## Parser hardening

- Added `logical-row-builder.js`, which joins only explicit labeled code fields proven to continue on the immediate next line.
- Extended code syntax to retain repeated qualifiers such as `B042+043+044` and narrowly normalize spaces such as `B 126` only inside evidenced code tokens.
- Preserved raw expressions, contributing source lines, page, section, normalization decision, and plan provenance.
- Restricted unlabeled extraction to standalone/delimiter-bounded code cells so code-like prose does not become an enhancement candidate.
- Added advisory `POSSIBLY_MISSING_CODE` / `REVIEW_REQUIRED` for structured service+quantity rows without a code; no code is generated or guessed.
- Kept Patient Payable exclusion before aggregation. Duplicate aggregation continues across pages/repeated headers only within the same semantic section type.
- Added explicit EnhancementPlan `execution_summary` categories: executable, blocked, and review-required. This is additive to the existing plan contract.
- Existing CN002, CC001, WC001, and CC002 rules are unchanged and still consume structured evidence.
- The Phase 4 adapter remains the only browser-bound safety gate and remains compatible.

## Fixtures and regression coverage

Human-readable synthetic fixtures:

- `tests/fixtures/bills/production-structure.json`
- `tests/fixtures/bills/oxygen-cases.json`
- `tests/fixtures/bills/stale-bill-b.json`
- `tests/fixtures/bills/README.md`

Phase 5 adds 24 deterministic cases covering multi-page duplicates, primary/Patient Payable pharmacy separation, ICU/ward special rules, oxygen half/full/ambiguous outcomes, `+L` compounds, repeated-plus compound syntax, wrapped codes, unknown/malformed/undefined outcomes, false-positive prose, repeated headers, continuation pages, 1,000-row volume, mixed executable/blocked plans, missing-code review, state isolation, and Phase 4 adapter compatibility.

## Rate source

The bundled 1,998-record snapshot remains **`RATE_SOURCE_UNDEFINED`**. It is not official, no entry is fabricated, and similar-looking codes are never substituted.

## Validation

- Before Phase 5: **39 tests**.
- After Phase 5: `npm test` — **63 passed, 0 failed, 0 skipped**.
- Phase 5 additions: **24 deterministic tests**.
- JavaScript syntax checks over every `src/**/*.js`: passed.
- Python syntax checks for the existing Phase 4 modified files `app (1).py` and `portal_bridge.py`: passed; Phase 5 changed no Python.
- `git diff --check`: passed.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Automated testing: completed.
- Real PDF regression: **NOT RUN** because the named attachments were not present in the workspace filesystem.
- Live portal testing: **NOT RUN — LIVE PORTAL REQUIRED**.

## Git

- Branch: `arena/01a0de46-billing-suit`
- Phase 4 commit: `a061209`
- PR #1 remains open and must not be merged automatically.
- Phase 5 commit is pending at the time of this entry.

## Stop point

Stop after Phase 5. Do not begin discharge, final bill, consumables production, automatic storage, or Settlement/Reconciliation work.
