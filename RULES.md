# Binding Engineering and Safety Rules

These rules define invariants for CGHS Billing Suite VNEXT. Product intent is in `PRD.md`; component structure is in `ARCHITECTURE.md`.

## Determinism

- Codes, quantities, rates, classifications, and Case associations must be derived from explicit source evidence and established deterministic rules.
- No mandatory value may be guessed from similarity, recency, neighboring codes, prior bills, portal ordering, or rate-list presence.
- Validation findings and operator notes are evidence, not executable rules.
- No validation process may auto-fix parser output, rules, an `EnhancementPlan`, Custom Code Registry, or expected fixture.

## Unknown and malformed codes

- Unknown does not mean invalid; it means unresolved until authoritative or explicit local evidence exists.
- `UNKNOWN`, `INVALID_FORMAT`, `RULE_UNDEFINED`, and equivalent unresolved statuses must not become executable automatically.
- Missing-code advice must remain review-required and must not invent a code.
- A code's presence in the bundled snapshot does not independently authorize execution.

## Compound codes

- Compound syntax must be preserved with provenance.
- An unresolved compound remains `UNRESOLVED_COMPOUND` or review-required.
- Components must not be expanded, merged, or assigned quantities without an established rule.
- `+L` and visually similar expressions must not acquire invented semantics.

## Reference rates

- The bundled snapshot remains `RATE_SOURCE_UNDEFINED` until authoritative provenance is established.
- The snapshot SHA-256 is protected as `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`.
- Rates must never be fabricated, inferred from descriptions, or silently substituted.
- Missing or unverified rate authority must remain visible in plans, validation, and UI.

## Custom codes

- The Custom Code Registry is local, separate from reference-rate data, revisioned, and audited.
- A custom record requires an explicit operator action, reason, and source/reference.
- Reference/custom collisions require explicit override handling; custom data must not overwrite the bundled snapshot.
- Inactive custom records are not executable.
- Selenium must never create, activate, edit, or approve custom records.
- Relevant registry changes must invalidate affected existing plans through `PLAN_STALE`.

## Patient Payable

- Patient Payable records must remain traceable but excluded from enhancement candidates and eligible final supporting extraction.
- They must not aggregate with the primary IP Pharmacy context.
- Any leak into an `EnhancementPlan` or eligible final section is an `EXCLUSION_MISMATCH` and blocks unreviewed live execution.
- No fixed page number may be assumed for Patient Payable detection.

## EnhancementPlan

- The `EnhancementPlan` is the sole deterministic contract for portal adaptation.
- It is immutable during execution.
- Selenium must not add/remove codes, change quantities, expand compounds, reinterpret rules, or promote blocked/review records.
- Only statuses explicitly classified executable by the existing plan/review contract may reach the Legacy Python Executor.
- Source or relevant registry changes must trigger freshness validation; `PLAN_STALE` blocks execution.

## Portal automation

- `app (1).py` remains the sole Selenium/CDP executor. No competing browser engine or selector implementation is allowed.
- Authentication, correct-case navigation, and portal context confirmation remain operator responsibilities.
- Only exact deterministic code matching is allowed. Fuzzy, description-based, partial, nearest, first-result, or numeric-neighbor selection is prohibited.
- Search result found is not selection success.
- Selection/click success is not execution success.
- Success requires actual portal-row evidence and expected quantity evidence.
- `QUANTITY_UNVERIFIED`, quantity mismatch, missing row, unexpected duplicate, or uncertain state must not be reported as clean `EXECUTED`.
- Exact pre-existing code/quantity may be `ALREADY_PRESENT`; unexpected duplicate state must be explicit.
- Speciality synchronization and locked-quantity behavior must be verified from re-read portal state.
- Screenshots/DOM diagnostics are failure evidence, not routine successful-action output.

## Retry and idempotency

- Retries must be bounded and recorded.
- A stale element must be re-located and current state revalidated.
- Search may retry after a safe transient timeout.
- Any operation that may already have inserted a row must reconcile actual portal state before another insertion attempt.
- An uncertain insertion must never be blindly repeated.
- No infinite retry loop or automatic interrupted-run resume is allowed.

## Case isolation and locking

- Source SHA-256, not filename or modification time, is authoritative for source identity.
- One initial source hash owns one Case unless explicit linked reprocessing is requested.
- Only the correct active Case with a valid lock and non-stale plan may execute portal actions.
- Background intake must not replace the active Case, plan, browser context, or portal lock owner.
- One failed portal action must not falsify outcomes for unrelated actions.
- Completed Cases are immutable except through explicitly designed versioning/reprocessing.

## Recovery

- Interrupted `PORTAL_EXECUTING` work becomes `RECOVERY_REQUIRED`.
- Restart must not auto-resume uncertain portal execution.
- The operator must inspect and reconcile portal state before a separately authorized continuation.
- A crash or process failure must never produce false `COMPLETED` or portal success.
- Missing packaged helpers, resource failures, and child-process failures must be explicit errors.

## Inbox intake

- Manual and automatic intake must use the same `InboxScanner` and Case workflow.
- Automatic periodic scanning is disabled by default and has explicit lifecycle control.
- Existing stability checks must reject or defer hidden, temporary, partial, non-PDF, and changing files.
- Intake queues and concurrency must remain bounded; `QUEUE_FULL` leaves files in place.
- Initial and Final inbox meanings must remain separate.
- `InboxWatcher` may scan, hash, deduplicate, register, and invoke allowed non-portal workflow only.
- It must never call Selenium/CDP, acquire the portal lock, execute an `EnhancementPlan`, authenticate, verify/discharge, or transfer portal files.

## Final bill

- The final bill is a distinct source and workflow context from the initial bill.
- Association uses exact deterministic identifiers and source hashes, never newest Case/PDF, filename, patient-name similarity, arrival order, or folder order.
- Conflicting or insufficient evidence produces `MATCH_REQUIRED`; it must not silently attach.
- Final extraction must not mutate historical initial bill, plan, or portal audit.
- `CompletedBill` storage must remain linked to the same Case with audit evidence.
- Original inbox files must not be automatically deleted.

## Discharge and credentials

- Discharge remains a manual operator action. Software records acknowledgement only.
- CGHS login remains manual.
- Usernames, passwords, API keys, session tokens, and scraped credentials must not be stored.
- No authentication bypass or unattended portal operation is permitted.

## Privacy and local processing

- Bill processing, Cases, validation, logs, and configuration remain local.
- No external document upload, cloud processing, telemetry, or crash-reporting SaaS is allowed without a separately approved design.
- Ordinary logs should avoid complete patient records and secrets.
- Real-PDF fixtures require explicit privacy approval and must not be committed unless governed by the fixture policy.

## Storage and configuration

- Runtime user data must live outside program files, `app.asar`, source directories, and release outputs.
- Storage paths must be absolute, external, and writable.
- Initialization creates missing directories without resetting existing Cases, Custom Codes, audits, bills, validation records, or watcher settings.
- User configuration is external and migrated non-destructively; unknown fields are preserved.
- Application replacement or deletion of a portable EXE must not delete external data.

## Audit

- Important state transitions, source registration, plan/version identity, review decisions, portal results, retries, diagnostics, validation findings, manual acknowledgements, final association, and storage outcomes must be auditable.
- Audit records must preserve Case/run/source identity and timestamps.
- Reports must separate parser, plan, portal, final-bill, and storage evidence rather than infer unsupported root causes.
- Use `UNKNOWN_ROOT_CAUSE` when evidence is insufficient.

## Windows build and release

- Windows release claims require an actual Windows artifact; Linux source validation is not Windows runtime validation.
- Release manifests and hashes must be generated from actual artifacts only.
- Program files and user data must remain separate.
- Release cleanup may delete only confirmed generated output directories.
- Build verification must fail closed on missing artifacts/helpers/resources, hash/version mismatch, failed tests, or changed protected snapshot.
- A build is not a release candidate until actual Windows startup, external data/config, packaged helper, clean exit, and required runtime acceptance pass.
- Workflow availability on GitHub depends on the workflow being present on the default branch; documentation must not claim otherwise.

## Prohibited shortcuts

Never introduce:

- fuzzy or approximate code substitution;
- description or nearest-code guessing;
- synthetic valid-code blacklists as authority;
- fabricated rates or mappings;
- silent plan overrides or quantity correction;
- silent duplicate merging;
- silent final-bill attachment;
- filename/recency-based Case matching;
- automatic baseline generation from actual output;
- fake real-PDF or live-portal test claims;
- placeholder EXEs, fabricated hashes, or fake Windows release claims;
- automatic login, discharge, portal final-bill transfer, OCR, settlement/reconciliation, cloud processing, or autonomous AI behavior unless separately approved and implemented.