# Rule Resolution — Phase 4

## Purpose

The rule resolver answers:

```text
What does this parser candidate mean according to the active registry and explicit deterministic rules?
```

It does not answer:

```text
Should Selenium click this?
```

Phase 4 produces `ResolutionResult` records, not portal actions and not final bill PDFs.

## Flow

```text
Source PDF
  -> Phase 3 parser evidence
  -> Candidate
  -> Registry lookup
  -> Rule resolution
  -> ResolutionResult
  -> REVIEW_REQUIRED or VALIDATED_MAPPING / DIRECT_REGISTRY_MATCH
```

Parser success never forces business-rule success.

## Rule set

Default rule set version:

```text
4.0.0
```

Rule statuses:

- `VALIDATED`
- `PROVISIONAL`
- `UNVERIFIED`
- `DEPRECATED`
- `BLOCKED`

Only `VALIDATED` rules may produce `VALIDATED_MAPPING`.

Current default rule count:

- total rules: 20
- validated rules: 16
- review rules: 4

## Rule schema

```json
{
  "ruleId": "CGHS_C_008_BLOOD_TRANSFUSION",
  "version": "4.0.0",
  "priority": 900,
  "status": "VALIDATED",
  "handler": "CONTEXTUAL_ALIAS",
  "input": { "codeRaw": "C008" },
  "conditions": [
    { "type": "DESCRIPTION_CONTAINS_ALL", "terms": ["Blood", "Transfusion", "Charge"] }
  ],
  "output": { "finalCode": "CC008", "quantity": "SOURCE_QUANTITY", "unit": null },
  "sourceReference": {
    "file": "PHASE_04_PROJECT_REQUIREMENTS",
    "section": "8",
    "authority": "user-provided locked mapping"
  },
  "tests": ["CGHS_C_008_BLOOD_TRANSFUSION"]
}
```

Rule logic is handled by controlled programmatic handlers. Registry/rule JSON is never executed.

## Resolution result schema

Every candidate returns a non-empty result:

```json
{
  "schemaVersion": 1,
  "candidateId": "candidate-0001",
  "billSessionId": "bill-session-...",
  "runId": "parser-run-...",
  "registryVersion": "...",
  "registrySourceHash": "...",
  "ruleSetVersion": "4.0.0",
  "status": "VALIDATED_MAPPING",
  "input": {
    "codeRaw": "C008",
    "description": "Blood Transfusion Charge",
    "quantity": null,
    "section": "PROCEDURES"
  },
  "output": {
    "finalCode": "CC008",
    "quantity": null,
    "unit": null
  },
  "ruleId": "CGHS_C_008_BLOOD_TRANSFUSION",
  "registryEntryId": null,
  "authorityStatus": "PROJECT_APPROVED",
  "reason": "...",
  "evidence": [],
  "conflicts": []
}
```

Statuses:

- `VALIDATED_MAPPING`
- `DIRECT_REGISTRY_MATCH`
- `REVIEW_REQUIRED`
- `UNRESOLVED_MAPPING`
- `RULE_CONFLICT`
- `REJECTED`
- `NO_MATCH`

## Precedence

Phase 4 resolver precedence is documented and deterministic:

1. Patient Payable separation — review-required before main CGHS aggregation.
2. Compound-expression preservation — ambiguous or split components remain review-required.
3. Exact authoritative registry match for non-raw-alias final codes.
4. Explicit validated transformation rules.
5. Explicit derived rules.
6. Explicit category-composition rules.
7. Review-only/provisional/unverified/blocking rules.
8. Description/fuzzy candidate matches — review-required only.
9. Raw alias protection — review-required if no validated rule matched.
10. No match — `NO_MATCH`.

If two `VALIDATED` rules produce different outputs, the resolver returns `RULE_CONFLICT` and does not choose a winner.

## Locked mappings

Implemented as explicit named deterministic rules:

| Rule ID | Required input/context | Output |
|---|---|---|
| `CGHS_C_004_NIV_MACHINE_PER_DAY` | `C004` + NIV Machine Per Day | `CC004` |
| `CGHS_C_008_BLOOD_TRANSFUSION` | `C008` + Blood Transfusion Charge | `CC008` |
| `CGHS_C_010_ENDOTRACHEAL_INTUBATION` | `C010` + Endotracheal Intubation | `CC010` |
| `CGHS_C_011_CENTRAL_LINE` | `C011` + Central Line | `CC011` |
| `CGHS_C_012_NEBULIZER_THERAPY` | `C012` + Nebulizer Therapy | `CC012` |
| `CGHS_C_014_RYLES_TUBE_INSERTION` | `C014` + Ryles Tube Insertion Charge | `CC014` |

The resolver does not broaden these beyond their documented contexts.

## C002 rules

Implemented:

| Rule ID | Required context | Output |
|---|---|---|
| `C002_OXYGEN_HALF_DAY` | `C002` + Oxygen + Half Day / 12 hours | `CC002`, quantity `12` |
| `C002_OXYGEN_FULL_DAY` | `C002` + Oxygen + Full Day / 24 hours | `CC002`, quantity `24` |
| `C002_PACKED_CELLS_REVIEW` | `C002` + Packed Cells / Blood Bank | `REVIEW_REQUIRED` |

Packed cells and blood-bank contexts do not become `CC002` merely because `C002` appears.

## C003 rules

Implemented as review-required:

- `C003_VENTILATOR_REVIEW`
- `C003_FRESH_FROZEN_PLASMA_REVIEW`

The resolver never invents `CC003`.

## Derived rules

Implemented explicitly:

| Rule ID | Required source evidence | Output |
|---|---|---|
| `CC001_ICU_COUNT_DERIVED` | ICU count | `CC001`, quantity = ICU count |
| `WC001_WARD_COUNT_DERIVED` | Ward count | `WC001`, quantity = Ward count |
| `CN002_ICU_WARD_FORMULA` | ICU count and Ward count | `CN002`, quantity = ICU × 3 + Ward × 2 |

Missing or ambiguous counts produce `REVIEW_REQUIRED`; missing evidence is never treated as zero.

## Category composition rules

Implemented as explicit families:

| Rule ID | Input | Output |
|---|---|---|
| `CATEGORY_CGHS_L_B_TO_LB` | `CGHS-L` + `Bxxx` | `LBxxx` |
| `CATEGORY_CGHS_RI_NUMERIC_TO_RI` | `CGHS-RI` + numeric | `RIxxx` |
| `CATEGORY_CGHS_CI_NUMERIC_TO_CI` | `CGHS-CI` + numeric | `CIxxx` |
| `CATEGORY_CGHS_G_P_TO_GP` | `CGHS-G` + `Pxxx` | `GPxxx` |
| `CATEGORY_CGHS_P_T_TO_PT` | `CGHS-P` + `Txxx` | `PTxxx` |

There is no generic prefix function.

## Raw alias protection

The following raw aliases are protected:

```text
C002, C003, C008, C010, C011, C012, C014, N002, P001, T004, T005
```

They are not final executable codes unless a specific validated rule establishes a mapping.

## No blanket C to CC rule

Forbidden transformations are not implemented:

```js
// forbidden and absent
if (code.startsWith('C')) code = 'CC' + code.slice(1);
```

Examples that do not map by blanket rule:

- `C001 -> CC001`
- `C002 -> CC002`
- `C003 -> CC003`
- `C008 -> CC008`

Only explicit validated rules can produce these mappings.

## Persistence and audit

Resolution output is stored beside the source parse result:

```text
Storage/Source_Bills/<billSessionId>/resolution-result.json
```

Resolution audit event:

```text
CGHS_RULE_RESOLUTION_COMPLETED
```

Audit stores run id, bill session id, registry version, registry source hash, rule set version, status, and counts. It does not store the complete source PDF text.

## Security

The resolver:

- does not call Selenium, Chrome, CDP, `portal_bridge`, or the Python portal executor;
- does not generate final bill PDFs;
- does not call external APIs;
- does not use random selection;
- does not use LLM/AI matching;
- does not use `eval()` or `new Function()`;
- does not execute arbitrary registry or rule expressions.
