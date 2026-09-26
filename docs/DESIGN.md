# Design — Phase 6 Portal Preflight & Execution Monitor UI

## Design goal

Phase 6 UI must show the deterministic `EnhancementPlan`, backend-owned portal readiness, and real portal execution progress without implying that renderer state can authorize portal mutation.

Portal execution is not automatic. The operator must run backend preflight and explicitly choose `START ENHANCEMENT`.

## Registry, plan, and portal status

Settings and the status strip display registry status. The Enhancement workspace displays plan status/readiness plus portal preflight/execution status.

Plan header values:

- plan version and schema version;
- plan id;
- plan SHA-256;
- registry version/hash;
- rule-set version;
- readiness.

Portal header values:

- backend preflight status;
- persisted run id;
- execution run state;
- progress counts from persisted execution summary.

No counts are invented. Values come from persisted plan/preflight/run/summary data and controlled IPC calls.

## Enhancement workspace

The Enhancement workspace is both a plan viewer and a controlled portal safety monitor.

Sections:

1. Header: version, id, hash, registry/rule context, readiness.
2. Portal Readiness: backend preflight buttons, start/cancel controls, check table, execution action table.
3. Actions: evidence-gated validated plan actions.
4. Review Required: unresolved/uncertain/conflicting/missing evidence.
5. Excluded: Patient Payable, non-domain, unsupported, rejected, and duplicate evidence.
6. Diagnostics: plan, validation, portal preflight, and execution summary references.

## Portal readiness panel

Controls:

- `Run preflight` calls `portal.preflight`.
- `Start enhancement` is enabled only when backend preflight is `READY` and validated actions exist.
- `Cancel execution` calls `portal.cancelExecution`.

The `Start enhancement` button displays an explicit confirmation dialog before invoking `portal.startExecution({ operatorConfirmed: true })`.

## Preflight checks table

Columns:

- Check
- Status
- Severity
- Message

Examples:

- `PLAN_HASH`
- `PLAN_NOT_STALE`
- `SOURCE_BILL`
- `CDP_ENDPOINT`
- `PORTAL_IDENTITY`
- `AUTHENTICATION`
- `PORTAL_CONTROLS`
- `PORTAL_BILL_CONTEXT`

A blocked check must be visible as text, not only color.

## Portal execution table

Columns:

- Order
- Action
- Code
- Desired Qty
- Existing Qty
- State
- Verification
- Error
- Duration

States shown are backend action states such as `SEARCHING`, `MATCHED`, `QUANTITY_CHECK`, `APPLYING`, `VERIFYING`, `SUCCESS`, `DUPLICATE`, `FAILED`, or `CANCELLED`.

## Actions table

Columns:

- Action ID
- Final Code
- Description
- Quantity
- Unit
- Authority
- Provenance

Action rows are data-only. They are not buttons, scripts, selectors, or portal commands.

## Review-required table

Columns:

- Review ID
- Reason
- Description
- Raw Code
- Status
- Required evidence

Review-required rows must never execute. They should answer:

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

Source PDFs, portal pages, screenshots, and DOM captures may contain patient-sensitive information. The UI should show necessary candidate/resolution/plan/preflight/run evidence only and must not dump complete PDF text, screenshots, DOM, cookies, tokens, credentials, or browser profile paths into generic diagnostics or audit views.

## Status colors

- Success/validated: `ACTIVE`, `READY`, `COMPLETED`, `SUCCESS`, `DUPLICATE`, `VALIDATED`, `VALIDATED_MAPPING`, `DIRECT_REGISTRY_MATCH`, `READY_FOR_PORTAL_VALIDATION`.
- Warning/review: `PARTIAL`, `NOT CONFIGURED`, `VALIDATED_WITH_REVIEW`, `REVIEW_REQUIRED`, `UNRESOLVED_MAPPING`, `NO_MATCH`, `NOT VERIFIED`, `NOT STARTED`, `STALE`, `CANCELLED`, `COMPLETED_WITH_FAILURES`.
- Error/conflict: `INVALID`, `FAILED`, `BLOCKED`, `RULE_CONFLICT`, `REJECTED`, `CORRUPT`, `ACCESS_ERROR`, `UNAVAILABLE`.

Every status is written as text; color is secondary.

## Interaction boundaries

- All privileged actions go through `window.cghsSuite`.
- Registry status access is controlled through `registry.getStatus`.
- Resolution access is controlled through `resolution.getResult` and `resolution.getStatus`.
- Plan access is controlled through `enhancement.buildPlan`, `enhancement.getPlan`, `enhancement.getPlanSummary`, `enhancement.validatePlan`, and `enhancement.rebuildPlan`.
- Portal access is controlled through `portal.preflight`, `portal.getPreflight`, `portal.revalidate`, `portal.startExecution`, `portal.getExecution`, `portal.getExecutionSummary`, and `portal.cancelExecution`.
- There is no generic command execution, shell execution, Python execution, JavaScript eval, arbitrary filesystem browsing, unrestricted PDF access, credential handling, raw Selenium/CDP action, discharge automation, or final PDF generation.
- Plan rows must not expose raw “Run”, “Login”, “Discharge”, or “Click portal” operations.

## Live portal status

No approved authenticated live portal run was performed in this phase.

```text
LIVE_PORTAL: NOT VERIFIED
```
