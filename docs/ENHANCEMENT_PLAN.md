# EnhancementPlan Contract

`EnhancementPlan` is the Phase 5 trusted intermediate artifact between Phase 4 resolution and any later portal-validation/final-bill phases.

It answers only this question:

> Which enhancement actions are supported by source evidence and validated deterministic rules, and which evidence must remain review-required or excluded?

It is **not** a browser script, Selenium instruction set, portal command list, credential container, or final bill.

## Pipeline boundary

```text
Source PDF
  -> ParserResult
  -> Candidate Set
  -> ResolutionResult Set
  -> EnhancementPlanBuilder
  -> EnhancementPlanValidator
  -> EnhancementPlan
```

The plan builder consumes resolver output. It must not repair resolver output, redo registry lookup, invent mappings, or add blanket prefix mappings such as `C -> CC`.

## Required top-level fields

| Field | Meaning |
|---|---|
| `schemaVersion` | Plan schema version. Phase 5 uses `1`. |
| `planVersion` | Plan implementation version. Phase 5 uses `5.0.0`. |
| `planId` | Deterministic id derived from canonical plan hash. |
| `billSessionId` | Current bill session. |
| `sourceBillId` | Stored source bill identity. |
| `createdAt` | Creation timestamp for audit only; excluded from deterministic hash. |
| `registryContext` | Registry version, source hash, authority status, and source metadata used for the plan. |
| `ruleContext` | Rule-set version and validated-rule count used for the plan. |
| `createdAgainst` | Parser, registry, registry-source-hash, and rule-set versions. |
| `status` | `VALIDATED`, `VALIDATED_WITH_REVIEW`, `BLOCKED`, `INVALID`, `STALE`, etc. |
| `readiness` | `READY_FOR_PORTAL_VALIDATION`, `NOT_READY`, `BLOCKED`, or `STALE`. |
| `actions` | Evidence-gated, validated plan actions. |
| `reviewItems` | Parser/resolution evidence that needs operator/authority review. |
| `excludedItems` | Parser evidence intentionally excluded from main CGHS enhancement actions. |
| `diagnostics` | Counts, blocking reasons, conflict counts, source candidate ids, and registry authority diagnostics. |
| `planSha256` | SHA-256 over canonical plan content. |
| `validation` | Last independent validator summary. |

## Action shape

Each `actions[]` entry contains data only:

- `actionId`
- `actionType = CGHS_ENHANCEMENT_LINE`
- `candidateId`
- `billSessionId`
- `finalCode`
- `description`
- `quantity`
- `authority`
- `provenance`
- `sourceEvidence`
- `input`
- `resolved`
- `resolution`
- `aggregation`
- `derivation`
- `state = VALIDATED_ACTION`

No action field may be interpreted as JavaScript, shell, browser automation, Python, CDP, Selenium, or portal command text.

## Executable-action gate

An action is emitted only when all gates pass:

- source candidate exists in the current parser result;
- source candidate status is `VALID_EVIDENCE`;
- resolution status is `VALIDATED_MAPPING` or `DIRECT_REGISTRY_MATCH`;
- authority status is acceptable;
- referenced rule is `VALIDATED`, if a rule is referenced;
- final code exists;
- protected raw alias final codes are produced only by explicit validated rules;
- quantity is valid and safe;
- unit is supported;
- no unresolved conflict exists;
- candidate is not excluded;
- bill session, registry version/source hash, and rule-set version match.

Forbidden from action emission:

- `REVIEW_REQUIRED`
- `UNRESOLVED_MAPPING`
- `RULE_CONFLICT`
- `PROVISIONAL`
- `UNVERIFIED`
- `BLOCKED`
- `REJECTED`
- `NO_MATCH`

## Protected raw aliases

These raw aliases must not become final plan codes unless an explicit validated rule produced that exact final code:

```text
C002 C003 C008 C010 C011 C012 C014 N002 P001 T004 T005
```

There is no blanket `C -> CC` mapping and no hidden `C002 -> CC002` fallback.

## Review items

`reviewItems[]` preserve parser and resolver evidence for uncertain rows. Review items include:

- `reviewId`
- `candidateId`
- `sourceEvidence`
- `input`
- `resolution`
- `reasonCode`
- `reason`
- `requiredEvidence`
- `status = REVIEW_REQUIRED`

A review item is a safe outcome. It prevents unsupported evidence from becoming an action while preserving the source trail.

## Excluded items

`excludedItems[]` preserve parser evidence for rows excluded from main CGHS enhancement actions:

- Patient Payable;
- non-domain/admin/payment/summary evidence;
- unsupported/ignored parser candidates;
- rejected resolver rows;
- duplicate parser rows with an evidence-based duplicate key.

Duplicate detection uses page, section, source text, description, raw code, raw quantity, and line numbers. Legitimate repeated source lines with different evidence keys are not deleted; they can aggregate when all action gates and grouping rules allow.

## Aggregation

Aggregation is deterministic and conservative.

Actions aggregate only when these are identical:

- final code;
- semantic unit;
- validated rule or registry context;
- semantic description/context.

Actions never aggregate across:

- different units;
- different rule ids/registry entries;
- different semantic descriptions;
- conflicts;
- Patient Payable or excluded rows.

## Quantity derivation

Quantities are never guessed.

- Missing quantity → review.
- Invalid quantity → review.
- Zero/negative quantity → review.
- Too many decimals → review.
- Absurdly large quantity → review.

Derived quantities must come from Phase 4 validated rules, such as:

- C002 oxygen half-day/full-day rules;
- CN002 ICU/ward formula;
- ICU/ward count derived rules.

The plan stores derivation provenance with rule id, handler/formula, inputs, output code/quantity, and source candidate ids.

## Storage location

```text
Storage/Source_Bills/<billSessionId>/enhancement/plan.json
Storage/Source_Bills/<billSessionId>/enhancement/plan-summary.json
```

The plan and summary are external runtime data and must not be committed as operational patient data.

## Security boundary

The plan must not contain:

- credentials;
- cookies;
- tokens;
- Selenium handles;
- browser/CDP state;
- Python process handles;
- shell commands;
- executable JavaScript strings;
- arbitrary portal commands;
- final PDF bytes or output handles.

Downstream phases must treat `EnhancementPlan` as validated data, not as code.
