# EnhancementPlan Validation

`EnhancementPlanValidator` is independent of `EnhancementPlanBuilder`. It re-checks the persisted plan before any later phase can trust it.

## Validator entry point

Module:

```text
src/services/cghs/plan-validator.js
```

Main API:

```js
const { EnhancementPlanValidator } = require('./plan-validator');
const result = new EnhancementPlanValidator({ ruleSetContext }).validate(plan, context);
```

The validator returns:

- `status`: `PASS`, `WARN`, or `FAIL`;
- `valid`: true when there are no `FAIL` issues;
- `issues`: structured findings;
- `expectedHash`: canonical plan hash;
- `stale`: stale-context result.

## Validation domains

### 1. Schema and identity

Checks include:

- plan is an object;
- `schemaVersion = 1`;
- `planVersion = 5.0.0`;
- `planId`, `billSessionId`, and `sourceBillId` exist;
- plan status and readiness are in the known enum sets;
- blocked/stale/readiness states are internally consistent.

### 2. Registry and rule context

Checks include:

- `registryContext.registryVersion` exists;
- `registryContext.registrySourceHash` exists;
- `registryContext.authorityStatus` exists;
- `ruleContext.ruleSetVersion` exists;
- `createdAgainst` records parser version, registry version, registry source hash, and rule-set version.

### 3. Actions

Every action must have:

- unique `actionId`;
- source candidate id;
- source evidence;
- final code;
- valid quantity;
- supported unit;
- `VALIDATED_MAPPING` or `DIRECT_REGISTRY_MATCH` resolution status;
- executable authority;
- validated rule or registry entry reference;
- valid aggregation group;
- `state = VALIDATED_ACTION`.

The validator rejects protected raw aliases as final codes unless the action references a validated rule.

### 4. Review items

Every review item must have:

- unique `reviewId`;
- reason;
- `reasonCode`;
- source evidence when tied to a candidate;
- `status = REVIEW_REQUIRED`.

### 5. Excluded items

Every excluded item must have:

- unique `exclusionId`;
- reason;
- source evidence when tied to a candidate;
- `status = EXCLUDED`.

### 6. Source-bill membership and provenance

When validation context supplies source candidate ids, the validator ensures:

- actions reference only parser candidates from the source bill;
- review items reference only parser candidates from the source bill;
- excluded items reference only parser candidates from the source bill;
- every parser candidate is represented by an action, review item, or excluded item.

This prevents silent evidence loss.

### 7. Aggregation

The validator checks aggregation identifiers and prevents a group from mixing units. Builder grouping is still independently conservative: final code + unit + rule/registry context + semantic description.

### 8. Security scan

The validator rejects credential- or execution-shaped fields whose names match sensitive/executable patterns, including:

- password;
- credential;
- cookie;
- token;
- secret;
- API key;
- authorization/authentication;
- Selenium;
- CDP;
- Python process;
- shell command;
- generic command/execute/portal action fields.

The plan is data only.

### 9. Stale detection

`detectStalePlan(plan, context)` compares:

- parser version;
- registry version;
- registry source hash;
- rule-set version.

A stale plan produces a `WARN` issue (`PLAN_STALE`) unless there are other failures. Stale detection does not repair or rebuild the plan silently.

### 10. Hash verification

`computePlanHash(plan)` canonicalizes the plan and excludes:

- `createdAt`;
- `planSha256`;
- `validation`;
- `runtimeDiagnostics`;
- `planId`.

Any mismatch between `plan.planSha256` and the canonical hash is `PLAN_HASH_MISMATCH`.

## Quantity validation

`validateQuantity(value)` enforces:

- present when required;
- numeric;
- finite;
- `> 0`;
- not greater than `100000`;
- precision no greater than 3 decimal places.

Supported quantity issue codes:

- `QUANTITY_MISSING`
- `QUANTITY_INVALID`
- `QUANTITY_NAN`
- `QUANTITY_INFINITY`
- `QUANTITY_ZERO`
- `QUANTITY_NEGATIVE`
- `QUANTITY_ABSURDLY_LARGE`
- `QUANTITY_PRECISION_UNSUPPORTED`

Missing quantities never default to `1`; invalid quantities never default to `0`.

## Persistence validation flow

The desktop main process validates before writing the plan and exposes a controlled re-validation IPC operation:

```text
enhancement.validatePlan
```

Validation reads the persisted plan, validates it against current parser/registry/rule context, and returns the validator result. If stale, an audit event `PLAN_MARKED_STALE` is appended.

## PASS meaning

A Phase 5 validator PASS means the persisted `EnhancementPlan` is internally consistent and safe as a deterministic intermediate artifact. It does not mean:

- portal automation is ready;
- live CGHS portal execution has been tested;
- final PDF generation exists;
- official CGHS source authority has been established.
