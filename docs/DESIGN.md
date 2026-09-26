# Design — Phase 5 EnhancementPlan UI

## Design goal

Phase 5 UI must show the deterministic `EnhancementPlan` as an evidence-gated intermediate artifact without implying downstream portal execution. Operators should see which rows became validated actions, which require review, which were excluded, and why.

## Registry and plan status

Settings and the status strip display registry status. The Enhancement workspace displays plan status and readiness.

Plan header values:

- plan version and schema version;
- plan id;
- plan SHA-256;
- registry version/hash;
- rule-set version;
- readiness.

No counts are invented. Values come from persisted plan/summary data and controlled IPC calls.

## Enhancement workspace

The Enhancement workspace is now a plan viewer, not a portal execution console.

Sections:

1. Header: version, id, hash, registry/rule context, readiness.
2. Actions: evidence-gated validated plan actions.
3. Review Required: unresolved/uncertain/conflicting/missing evidence.
4. Excluded: Patient Payable, non-domain, unsupported, rejected, and duplicate evidence.
5. Diagnostics: plan diagnostics and validation summary.

## Actions table

Columns:

- Action ID
- Final Code
- Description
- Quantity
- Unit
- Authority
- Provenance

Action rows are data-only. They are not buttons, scripts, or portal commands.

## Review-required table

Columns:

- Review ID
- Reason
- Description
- Raw Code
- Status
- Required evidence

Review-required rows should answer:

1. What was found?
2. Why was it not promoted to action?
3. Which evidence is missing/conflicting?
4. Which resolver/rule status applies?

An unresolved result is acceptable. Inventing a code is not.

## Excluded table

Columns:

- Excluded ID
- Reason
- Description
- Raw Code
- Candidate

Excluded rows preserve source evidence instead of silently discarding parser output.

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
- resolution summary for persisted source records;
- plan summary for persisted source records when available.

Parser candidates remain evidence. They are not automatically business-validated.

## Privacy

Source PDFs may contain patient-sensitive information. The UI should show necessary candidate/resolution/plan evidence only and must not dump complete PDF text into generic diagnostics or audit views.

## Status colors

- Success/validated: `ACTIVE`, `READY`, `COMPLETED`, `VALIDATED`, `VALIDATED_MAPPING`, `DIRECT_REGISTRY_MATCH`, `READY_FOR_PORTAL_VALIDATION`.
- Warning/review: `PARTIAL`, `NOT CONFIGURED`, `VALIDATED_WITH_REVIEW`, `REVIEW_REQUIRED`, `UNRESOLVED_MAPPING`, `NO_MATCH`, `NOT VERIFIED`, `STALE`.
- Error/conflict: `INVALID`, `FAILED`, `BLOCKED`, `RULE_CONFLICT`, `REJECTED`, `CORRUPT`, `ACCESS_ERROR`.

Every status is written as text; color is secondary.

## Interaction boundaries

- All privileged actions go through `window.cghsSuite`.
- Registry status access is controlled through `registry.getStatus`.
- Resolution access is controlled through `resolution.getResult` and `resolution.getStatus`.
- Plan access is controlled through `enhancement.buildPlan`, `enhancement.getPlan`, `enhancement.getPlanSummary`, `enhancement.validatePlan`, and `enhancement.rebuildPlan`.
- There is no generic command execution, shell execution, Python execution, JavaScript eval, arbitrary filesystem browsing, unrestricted PDF access, credential handling, Selenium/CDP action, or final PDF generation.
- Plan rows must not expose a “Run”, “Execute”, “Login”, “Discharge”, or “Click portal” action in Phase 5.
