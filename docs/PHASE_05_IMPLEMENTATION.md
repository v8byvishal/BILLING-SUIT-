# Phase 05 Implementation — Deterministic EnhancementPlan Generation & Validation

Date: 2026-09-27
Branch: `arena/01a0dfad-billing-suit`
Phase 4 baseline: `dd7f943969d456eee0b3465e407dc570d2310eb6`

## Status

Phase 5 adds deterministic `EnhancementPlan` generation and independent validation on top of the Phase 3 parser and Phase 4 registry/rule-resolution layers.

Phase 5 does **not** implement portal execution, Selenium/CDP automation, credential handling, discharge, final-bill composition, or final PDF generation.

## Implemented pipeline

```text
Source PDF
  -> ParserResult
  -> Candidate Set
  -> ResolutionResult Set
  -> EnhancementPlanBuilder
  -> EnhancementPlanValidator
  -> Storage/Source_Bills/<billSessionId>/enhancement/plan.json
  -> Storage/Source_Bills/<billSessionId>/enhancement/plan-summary.json
```

Parser candidates remain source evidence. `ResolutionResult` remains business interpretation. Only the `EnhancementPlan` can expose evidence-gated action rows, and those rows are still not portal automation commands.

## New modules

- `src/services/cghs/plan-builder.js`
  - builds schema-versioned deterministic plans;
  - gates `VALIDATED_MAPPING` and `DIRECT_REGISTRY_MATCH` resolution rows into actions only when all evidence, authority, quantity, rule, context, and staleness gates pass;
  - emits `reviewItems` for uncertain/conflicting/missing evidence;
  - emits `excludedItems` for Patient Payable, non-domain, unsupported, rejected, and duplicate parser candidates;
  - performs deterministic aggregation only by final code + semantic unit + validated rule/registry context + semantic description;
  - computes deterministic `planSha256` and `planId`.

- `src/services/cghs/plan-validator.js`
  - validates schema/version/status/readiness;
  - validates action/review/exclusion identifiers and provenance;
  - verifies quantities are present, numeric, finite, greater than zero, within precision/size bounds, and have supported semantic units;
  - blocks protected raw aliases unless an explicit validated rule produced them;
  - checks rule references, authority status, source-bill membership, aggregation units, security-shaped fields, stale context, and hash integrity.

## Plan schema identity

```text
schemaVersion = 1
planVersion = 5.0.0
```

A plan includes:

- `schemaVersion`
- `planVersion`
- `planId`
- `billSessionId`
- `sourceBillId`
- `createdAt`
- `registryContext`
- `ruleContext`
- `createdAgainst`
- `status`
- `readiness`
- `actions`
- `reviewItems`
- `excludedItems`
- `diagnostics`
- `planSha256`
- `validation`

`planSha256` is computed from a canonical representation that excludes transient timestamp/validation/runtime fields and excludes `planId` itself.

## Action gates

A candidate can become an `actions[]` entry only when all of these are true:

1. source candidate exists in the current parser result;
2. source candidate is `VALID_EVIDENCE`;
3. resolution status is `VALIDATED_MAPPING` or `DIRECT_REGISTRY_MATCH`;
4. authority status is executable (`AUTHORITATIVE`, `PROJECT_APPROVED`, `TEST_ONLY`, or `VERIFIED_RULE`);
5. referenced rule exists and is `VALIDATED`, when a rule is referenced;
6. final code exists;
7. protected raw aliases are not used as final codes unless a validated rule produced them;
8. quantity is present, finite, numeric, `> 0`, not absurdly large, and precision is supported;
9. semantic unit is supported;
10. no unresolved conflict exists;
11. bill session, registry version/source hash, and rule-set version match current context;
12. candidate is not Patient Payable, non-domain, unsupported, rejected, duplicate, or otherwise excluded.

If a gate fails, the candidate becomes review-required or excluded; it is not silently discarded.

## Review and exclusion behavior

`reviewItems[]` preserve:

- source evidence;
- raw input;
- resolver status/reason;
- selected rule/registry reference when present;
- `reasonCode`;
- `requiredEvidence`.

`excludedItems[]` preserve source evidence for parser rows that must not enter main CGHS enhancement actions, including Patient Payable, non-domain, unsupported, rejected, and duplicate evidence.

## Quantity behavior

Phase 5 never converts missing quantity to `1` and never converts invalid quantity to `0`.

Supported validation failures include:

- `QUANTITY_MISSING`
- `QUANTITY_INVALID`
- `QUANTITY_NAN`
- `QUANTITY_INFINITY`
- `QUANTITY_ZERO`
- `QUANTITY_NEGATIVE`
- `QUANTITY_ABSURDLY_LARGE`
- `QUANTITY_PRECISION_UNSUPPORTED`

Only Phase 4 validated rules may derive quantities such as C002 half/full day oxygen and CN002 formula outputs. Derivation provenance records rule id, inputs, formula/handler, and source candidate ids.

## Storage additions

Phase 5 persists under the existing Phase 2 source-bill folder:

```text
Storage/Source_Bills/<billSessionId>/enhancement/plan.json
Storage/Source_Bills/<billSessionId>/enhancement/plan-summary.json
```

No operational Storage data is committed to Git.

## IPC / UI additions

Controlled IPC operations added:

- `enhancement.buildPlan`
- `enhancement.getPlan`
- `enhancement.getPlanSummary`
- `enhancement.validatePlan`
- `enhancement.rebuildPlan`

The renderer accesses these only through `window.cghsSuite.enhancement`. The UI shows plan version, id, hash, registry/rule context, readiness, actions, review-required rows, excluded rows, and diagnostics.

## Audit events

Phase 5 writes audit events for:

- `PLAN_BUILD_STARTED`
- `PLAN_VALIDATION_STARTED`
- `PLAN_VALIDATION_PASSED`
- `PLAN_VALIDATION_FAILED`
- `PLAN_BUILD_COMPLETED`
- `PLAN_MARKED_REVIEW_REQUIRED`
- `PLAN_MARKED_READY_FOR_PORTAL_VALIDATION`
- `PLAN_MARKED_STALE`
- `PLAN_BUILD_FAILED`

## Tests and fixtures

New non-PHI synthetic fixtures:

- `tests/fixtures/plans/phase5-matrix.json`
- `tests/fixtures/plans/validated-plan.golden.json`

New test suite:

- `tests/unit/phase5-enhancement-plan.test.js`

The matrix covers 50 plan-construction scenarios across validated actions, direct registry matches, aggregation, duplicates, Patient Payable separation, non-domain/unsupported exclusion, every non-executable resolution status, invalid quantities, protected raw aliases, C002/CN002 derived quantities, stale/hash/security validation, blocking states, provenance preservation, and IPC contract checks.

## Validation run

- `npm ci --ignore-scripts` — PASS for dependency installation; npm reported 14 audit vulnerabilities (13 high, 1 critical), not remediated in Phase 5.
- `node --check src/services/cghs/plan-validator.js src/services/cghs/plan-builder.js src/core/storage.js src/services/cghs/index.js src/desktop/main.js src/desktop/ipc-contract.js src/desktop/preload.js src/ui/renderer.js tests/unit/phase5-enhancement-plan.test.js` — PASS.
- `node --test tests/unit/phase1-ipc-contract.test.js tests/unit/phase3-source-parser.test.js tests/unit/phase4-registry-resolution.test.js tests/unit/phase5-enhancement-plan.test.js` — PASS, 92/92 tests.
- `node --test tests/unit/phase5-enhancement-plan.test.js` — PASS, 10/10 subtests including the 50-case matrix.
- `npm test` — PASS, 401/401 tests.
- `python3 -m unittest discover -s tests/python -p 'test_*.py'` — PASS, 32/32 tests.
- `npm run test:desktop` — BLOCKED before Electron launch: `Electron failed to install correctly` because Electron was installed with scripts skipped.

## Explicit non-goals

- No portal execution.
- No Selenium/CDP invocation.
- No Python portal executor invocation.
- No credential entry or credential storage.
- No automatic discharge.
- No final-bill composition.
- No final PDF generation.
- No official CGHS data claim beyond the existing Phase 4 registry authority state.
