# Design — Phase 4 Registry and Resolution UI

## Design goal

Phase 4 UI must show real registry status and deterministic rule-resolution preview without implying downstream portal execution. Operators should be able to see what was found, what was resolved, what requires review, and why.

## Registry status

Settings and the status strip display:

- Registry status: `ACTIVE`, `PARTIAL`, `NOT CONFIGURED`, or `INVALID`;
- version;
- source;
- short hash;
- total rule count;
- validated rule count;
- review rule count.

No counts are invented. Values come from `registry.getStatus()`.

## Resolution preview

The Enhancement workspace is now a resolution preview, not an executable EnhancementPlan table.

Columns:

- Page
- Section
- Description
- Raw Code
- Resolved Code
- Quantity
- Status
- Rule
- Evidence

Supported statuses:

- `DIRECT_REGISTRY_MATCH`
- `VALIDATED_MAPPING`
- `REVIEW_REQUIRED`
- `UNRESOLVED_MAPPING`
- `RULE_CONFLICT`
- `REJECTED`
- `NO_MATCH`

## Review-required explanation

Review-required rows should answer:

1. What was found?
2. Why was it not auto-resolved?
3. What evidence is missing?
4. Which rule or conflict applies?

Example display content may be:

```text
Found: C003
Context: Ventilator
Result: REVIEW_REQUIRED
Reason: No validated C003 ventilator to final-code mapping exists in the active registry/rule set.
```

An unresolved result is acceptable. Inventing a code is not.

## Source Bills workspace

Source Bills continues to show parser results:

- selected source file metadata;
- stored source record list;
- parser status;
- page count;
- candidate count;
- parser warnings;
- parser candidate table;
- candidate evidence viewer;
- resolution summary for persisted source records.

Parser candidates remain evidence. They are not automatically business-validated.

## Privacy

Source PDFs may contain patient-sensitive information. The UI should show necessary candidate/resolution evidence only and must not dump complete PDF text into generic diagnostics or audit views.

## Status colors

- Success/validated: `ACTIVE`, `READY`, `COMPLETED`, `VALIDATED_MAPPING`, `DIRECT_REGISTRY_MATCH`.
- Warning/review: `PARTIAL`, `NOT CONFIGURED`, `REVIEW_REQUIRED`, `UNRESOLVED_MAPPING`, `NO_MATCH`, `NOT VERIFIED`.
- Error/conflict: `INVALID`, `FAILED`, `RULE_CONFLICT`, `REJECTED`, `CORRUPT`, `ACCESS_ERROR`.

Every status is written as text; color is secondary.

## Interaction boundaries

- All privileged actions go through `window.cghsSuite`.
- Registry status access is controlled through `registry.getStatus`.
- Resolution access is controlled through `resolution.getResult` and `resolution.getStatus`.
- There is no generic command execution, shell execution, Python execution, JavaScript eval, arbitrary filesystem browsing, unrestricted PDF access, or credential handling.
- Resolution preview rows must not expose a “Run”, “Execute”, or “Click portal” action in Phase 4.
