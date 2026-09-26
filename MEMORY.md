# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 6 — Review Queue, Custom/Unslotted Code Registry & Controlled User Overrides: complete for review.**

Phase 1–5 parser/rules and the Phase 4 legacy portal architecture remain intact. No fuzzy resolution, second rate system, Selenium logic, settlement, discharge, final bill, folder automation, or production pharmacy/OT workflow was added.

## Persistent custom registry

- Service: `src/services/custom-codes/custom-code-registry.js`
- Runtime definitions: `Storage/Custom_Codes/registry.json`
- Runtime audit: `Storage/Audit/custom-code-audit.jsonl`
- Both paths are outside the executable and created through the existing Storage architecture.
- Registry JSON uses atomic temporary-file rename; audit is append-only JSON Lines.
- Records preserve original entry, canonical exact code, description, optional unit/rate, `MANUAL`/`FIXED`/`PER_DAY` behavior, reason, source, operator, timestamps, active state, override state/reference evidence, notes, scope, and revisions.

The bundled 1,998-record `hfos-reference-rates.json` remains byte-identical with SHA-256 `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba` and remains `RATE_SOURCE_UNDEFINED`.

## Deterministic resolution and planning

- Reference code wins by default.
- Exact active custom code resolves as `CUSTOM/LOCAL` only after explicit creation.
- Reference collision requires `override_authoritative: true` and records reference state plus `OVERRIDE_ENABLED` audit.
- Inactive custom codes resolve as unknown.
- Only positive integer `FIXED` quantity behavior can become `CUSTOM_VALID` in Phase 6. `MANUAL` and `PER_DAY` remain review-required; no formulas are accepted.
- Custom rate is optional and undefined rates are never fabricated.
- EnhancementPlan captures registry revision, global hash, and relevant per-code fingerprints.
- The Phase 4 adapter compares current relevant fingerprints and throws `PLAN_STALE` before execution when a material definition changed.
- Valid `CUSTOM_VALID` actions can cross the existing Phase 4 boundary; unknown/manual/unresolved records remain blocked.

## Review workflow and UI

`review-queue.js` projects unknown, malformed, unresolved compound, rule-undefined, review-required, unsupported evidence, and missing-code advisories from the existing EnhancementPlan. It exposes raw/normalized evidence, code, page, section, quantity, parser/rule decisions, reason, status, and Review/Add Custom/Dismiss actions.

Bill-specific review decisions are audit events only and do not create global codes. The minimal UI adds the review table and custom registry with exact text search, add, edit, deactivate/reactivate, and audit viewing. There is no auto-approve action.

Audit actions include `CREATED`, `UPDATED`, `DEACTIVATED`, `REACTIVATED`, `OVERRIDE_ENABLED`, `OVERRIDE_DISABLED`, `USED_IN_PLAN`, `BLOCKED`, and `REVIEWED`, with actor/reason/source and limited bill identity context.

## Validation

- Before Phase 6: **63 tests**.
- After Phase 6: `npm test` — **83 passed, 0 failed, 0 skipped**.
- Phase 6 adds 20 deterministic cases covering creation, malformed/duplicate rejection, collision/override, unknown→custom resolution, deactivation, advisory safety, global vs bill scope, restart persistence, registry hashes, stale plans, Phase 4 admission/blocking, snapshot immutability, and audit.
- JavaScript syntax checks over all `src/**/*.js`: passed.
- Python syntax checks for `app (1).py` and `portal_bridge.py`: passed; Phase 6 changed no Python.
- `git diff --check`: passed.
- `npm audit --omit=dev`: **0 vulnerabilities**.
- Reference snapshot SHA-256 remained `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`.
- Live portal testing: **NOT RUN — LIVE PORTAL REQUIRED**.

## Git

- Branch: `arena/01a0de46-billing-suit`
- Phase 5 commit: `69227b6`
- PR #1 remains open and must not be merged automatically.
- Phase 6 commit is pending at the time of this entry.

## Stop point

Stop after Phase 6. Do not begin discharge, final bill upload, folder automation, production pharmacy/OT extraction, or Settlement/Reconciliation.
