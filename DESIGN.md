# Product Design System

## Design goal

CGHS Billing Suite VNEXT should feel like a professional hospital billing workstation: clear, calm, evidence-oriented, and safe under time pressure. The interface should minimize cognitive load and make the active Case, current workflow state, review obligations, and portal risk obvious.

The design is not an AI-chat interface, analytics dashboard, cyberpunk console, or decorative consumer application.

## Current visual personality

- Professional and operational
- Low-noise and information-dense where necessary
- Readable at typical Windows desktop viewing distances
- Trustworthy rather than promotional
- Explicit about uncertainty, blocked work, and manual responsibility

## Actual theme tokens

The current UI is a light theme implemented in `src/ui/styles.css`.

| Role | Current token/value | Use |
|---|---|---|
| Application background | `#f3f5f7` | Main desktop canvas |
| Surface | `#ffffff` | Panels, cards, tables |
| Primary text | `#17212b` | Headings and body text |
| Secondary text | `#65717d` | Supporting descriptions and metadata |
| Border/divider | `#dce2e7` | Panel and table structure |
| Primary action | `#215a86` | Main buttons, links, active emphasis |
| Primary hover | `#18496f` | Main-action hover |
| Success/ready | `#23815b` | Ready/success indicator |
| Review/warning | `#855f14` on `#fff6df` | Review-required and caution states |

Future style work should add error, blocked, disabled, and recovery tokens consistently rather than scattering arbitrary colors. Status meaning must always include text, not color alone.

## Typography

The actual font stack is:

```css
"Segoe UI", Arial, sans-serif
```

This uses the native Windows UI font where available and requires no bundled web font. Current body text is approximately 14px with a 1.5 line height; operational tables use denser 12px text. Text below 11px should be limited to secondary labels and must remain legible.

## Spacing and shape

- Main shell: centered, maximum width near 1180px, with generous desktop padding.
- Major sections: approximately 28px vertical separation.
- Panels: white surfaces, subtle 1px borders, 10–14px corner radii.
- Table cells: compact but readable 10px vertical / 14px horizontal padding.
- Primary controls: 8px radius and clear 11px × 18px padding.
- Shadows: subtle and reserved for hierarchy, not decoration.

Spacing should group related evidence and separate workflow stages. Dense tables are appropriate; dense unlabeled controls are not.

## Layout hierarchy

The current desktop shell contains:

1. **Top bar** — product identity and application readiness.
2. **Welcome/readiness panel** — local PDF action plus application, Storage, and environment status.
3. **Operational Cases** — active Case context, manual scans, watcher controls, workflow state, and Case actions.
4. **Parse result** — file, pages, item/exclusion counts, and result message.
5. **EnhancementPlan** — code, quantity, rate evidence, amount, source/rule, and status.
6. **Bill validation** — expected-baseline action, plan confirmation, notes, discrepancies, and evidence.
7. **Enhancement Review** — unresolved records and explicit actions.
8. **Custom Code Registry** — search, records, activation/editing, and audit.
9. **Portal execution boundary** — preview, explicit execution, status summary, and structured audit.
10. **Final bill** — manual-discharge acknowledgement, local final PDF, matching, extracted items, and save action.
11. **Footer** — version and resolved external Storage path.

The existing “Workflow boundaries” copy contains historical wording; documentation treats implemented panels and service behavior as authoritative. Future UI cleanup may correct stale labels but is not part of this documentation task.

## Component guidance

### Tables

- Keep headers concise and stable.
- Preserve horizontal scrolling for wide evidence tables.
- Keep the code, quantity, status, and reason visible together where possible.
- Do not hide blocked/review evidence behind success percentages.
- Use row actions with explicit verbs such as Review, Classify, Resolve, Prepare, or Save.

### Forms

- Use native controls and visible labels or meaningful accessible names.
- Clearly distinguish required fields from optional rate/source fields.
- Validate before persistence and retain the operator's entered evidence on recoverable errors.
- Custom-code forms must make override intent and activation status explicit.

### Review queues and validation

- Show source section/page, expected versus actual values, status, and reason.
- Evidence details may use expandable/preformatted output, but summaries should remain readable.
- Human classification must never look like automatic correction.
- `PLAN_STALE`, `MATCH_REQUIRED`, and `RECOVERY_REQUIRED` need direct explanations and next steps.

### Progress and diagnostics

- Long-running actions should expose current operation and disabled/busy controls.
- Portal execution should show current code, expected quantity, retries, elapsed duration, and verification state when available.
- Diagnostics should be detailed on failure and concise on success.
- Watcher status should show lifecycle state, last scan, queue, new records, duplicates, waiting files, and errors without becoming a dashboard.

## Status semantics

| Status | Meaning | Presentation requirement |
|---|---|---|
| `EXECUTED` | Actual portal row and quantity verified | Success text/icon; include actual evidence |
| `ALREADY_PRESENT` | Exact intended state existed before insertion | Distinct neutral-success label; do not imply new insertion |
| `COMPLETED` | Workflow/storage completion supported by evidence | Strong success with Case/run reference |
| `REVIEW_REQUIRED` | Human decision/evidence needed | Amber review label plus reason and action |
| `MATCH_REQUIRED` | Final source cannot be attached deterministically | Amber review label; show conflicting/missing identifiers |
| `BLOCKED` | Action intentionally prevented | Muted/blocked label plus immutable reason |
| `FAILED` | Operation failed with evidence | Error label plus layer, message, and diagnostic reference |
| `QUANTITY_MISMATCH` | Actual quantity differs | Error/review treatment with expected and actual values |
| `RECOVERY_REQUIRED` | Interrupted/uncertain state must be inspected | High-visibility warning; no automatic resume action |
| `PLAN_STALE` | Source/registry no longer matches plan identity | Blocking warning and regeneration/review guidance |
| `NOT_RUN` | Validation was not performed | Neutral label; never style as pass |

## Interaction principles

- Keep the active Case visible before any Case-sensitive operation.
- Require explicit confirmation before live portal execution and other consequential actions.
- Do not hide manual authentication, verification, discharge, or match responsibilities.
- Disable invalid actions rather than allowing predictable failures.
- Explain why an item is blocked or review-required.
- Preserve operator input and evidence across recoverable state changes.
- Never present background intake as background portal automation.
- Never infer completion from absence of an error.

## Errors

User-facing errors should identify the layer and a useful next action:

- application startup/configuration;
- Storage permissions/path;
- parser or validation;
- Case state or `PLAN_STALE`;
- Python executor/resource;
- portal search/selection/row/quantity;
- final-bill match/extraction; or
- release/runtime acceptance.

A raw stack trace may be retained in diagnostics but must not be the only operator message.

## Desktop behavior

- Primary target: Windows x64 desktop.
- Current minimum page width is 720px; the Electron window minimum is 860×560.
- The shell adapts below approximately 900px by stacking the welcome area and reducing workflow cards to two columns.
- Operational tables scroll within bounded panel heights.
- Paths may contain spaces and Unicode and should truncate visually without losing the full stored value.
- Program files may be read-only; UI should display the external Storage path clearly.

## Accessibility and readability

- Use semantic headings, tables, forms, and native buttons.
- Maintain visible keyboard focus and native keyboard behavior.
- Use descriptive labels and `aria-live` where operation results change.
- Do not communicate state through color alone; always include status text.
- Maintain sufficient contrast for text, borders, and controls.
- Avoid tiny text for actionable or critical content.
- Confirmation dialogs must state the Case/action consequence, not use generic “Are you sure?” wording.

This document describes the intended design behavior of existing product surfaces. It does not authorize new UI features or a redesign.