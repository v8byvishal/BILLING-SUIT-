# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 4 — Legacy Portal Enhancement Boundary: complete for review.**

The Phase 3 `EnhancementPlan` now crosses a narrow safety adapter into the existing Python Selenium/Chrome-CDP executor. No second browser engine or competing business-rule layer was created. Live validation: **NOT RUN — LIVE PORTAL REQUIRED**.

## Implemented flow

`Phase 2 BillDocument → Phase 3 EnhancementPlan → plan-adapter.js → portal-execution-service.js → python-runner.js → portal_bridge.py → app (1).py BatchAutomationThread/TreatmentPlanOrchestrator → CDP 127.0.0.1:9222 → portal-state verification → structured audit`

- `src/adapters/legacy-portal/plan-adapter.js` accepts only `SOURCE_VERIFIED`/`RULE_VERIFIED` entries with valid code and positive integer final quantity. It passes evidence, source/rule, classification, derived flag, and audit metadata.
- Unknown, unresolved compound, undefined-rule, review-required, malformed, unsupported, rejected, and Patient Payable/excluded content remains blocked and auditable.
- `python-runner.js` provides a JSON child-process boundary and parses a final `VNEXT_RESULT=` marker while preserving stdout/stderr.
- `portal_bridge.py` validates the contract and invokes the existing `BatchAutomationThread`; it contains no selectors or CGHS rules.
- Minimal additive instrumentation in `app (1).py` exposes verified per-action `EXECUTED`, `ALREADY_PRESENT`, and `FAILED` records, including reconciliation, diagnostics, CDP retries, and fatal failures. Existing PyQt behavior and portal implementation remain in place.
- `portal-execution-service.js` merges blocked records and executor outcomes, rejects missing/invalid terminal records as `UNKNOWN`, and reports `PARTIAL` for mixed outcomes.

CN002, CC001, WC001, and CC002 calculations remain solely in Phase 3. Selenium receives final quantities and never guesses codes, compounds, or rules. Portal success requires verified state; duplicate rows remain `ALREADY_PRESENT`.

## UI and security

The Electron allowlist now exposes portal preview and execute operations. The minimal UI shows executable/blocked counts, requires user confirmation, displays terminal verification counts, and renders the audit. The executor still attaches only to an already authenticated Chrome debugging session at `127.0.0.1:9222`; credentials, login, and security bypass are not automated.

## Rate-source status

The 1,998-record `src/services/cghs/data/hfos-reference-rates.json` snapshot remains **`RATE_SOURCE_UNDEFINED`**. It is not official and cannot produce authoritative financial amounts. No fabricated authority was added.

## Validation

- `npm test`: **39 passed, 0 failed** (Phase 1–4).
- Phase 4 includes 14 deterministic fake-runner cases covering verified success, already-present duplicates, failure, partial execution, CDP/runner failure, missing/invalid outcomes, retries/diagnostics, post-exception reconciliation, unsafe blocking, Patient Payable exclusion, malformed input, deterministic special-code ordering/final quantities, and audit identity.
- JavaScript syntax checks passed for all changed JavaScript modules.
- Python syntax checks passed for `app (1).py` and `portal_bridge.py`.
- `git diff --check`: passed.
- Live validation: **NOT RUN — LIVE PORTAL REQUIRED**.
- Real PDF validation: **REAL_FIXTURES_UNAVAILABLE**.

## Explicit boundaries

Settlement/Reconciliation remains isolated under `src/services/settlement/` and was not imported or modified. Final bill processing/upload, attachments, discharge workflow, automatic folder pickup, pharmacy/OT consumables, credential storage, and broad legacy refactoring remain out of scope.

## Unresolved issues

- No authenticated live CGHS portal/Chrome debugging session was available.
- No genuine bill PDFs were available.
- Official current CGHS rate authority remains unavailable.
- Compound `+L`, HDU classification, scanned/OCR bills, and portal amount semantics remain unresolved.
- Electron runtime smoke installation remains environment-blocked by prior TLS/network download failures.

## Git state

- Branch: `arena/01a0de46-billing-suit`
- Phase 3 implementation: `da0b0bd`
- Phase 3 documentation: `3a86628`
- PR #1 remains open and must not be merged automatically.
- Phase 4 implementation/documentation commit is pending at the time this memory entry was written.

## Stop point

Stop after Phase 4 review delivery. Do not begin Phase 5 or later work automatically.
