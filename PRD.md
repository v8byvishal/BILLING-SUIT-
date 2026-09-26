# CGHS BILLING SUITE VNEXT — Product Requirements Document

**Phase:** 0 — Source Audit and Product Requirement Freeze
**Status:** Draft for human review
**Repository:** `v8byvishal/BILLING-SUIT-` (canonical repository for all evolution)
**Audit date:** 2026-09-26

## Requirement classification legend

| Classification | Meaning |
|---|---|
| `USER_EXPLICIT` | Directly required by the Phase 0 product brief. |
| `SOURCE_CONFIRMED` | Directly evidenced by implementation or repository artifact. |
| `SOURCE_DERIVED` | Requirement derived conservatively from observed source behavior. |
| `INFERRED` | Plausible product need, not established business truth; requires validation. |
| `REQUIREMENT_UNDEFINED` | Product behavior or presentation has not yet been specified. |
| `RULE_UNDEFINED` | Deterministic business rule lacks authoritative evidence. |
| `SOURCE_UNAVAILABLE` | The source needed to confirm the matter is absent from this checkout. |

A conflict is additionally labeled `CONFLICT_REQUIRES_HUMAN_DECISION`. No inference in this document overrides a deterministic CGHS rule.

# 1. Product Overview

CGHS BILLING SUITE VNEXT is the controlled evolution of two existing repository systems: (1) a Python/PyQt bill-PDF parsing and Selenium enhancement utility in `app (1).py`, and (2) the HFOS-derived CGHS Billing Suite Pro v5 Electron billing application. The target product is a Windows desktop EXE for real CGHS hospital billing work. It will ingest a current hospital bill, calculate an auditable enhancement plan using deterministic rules and the authoritative CGHS rate list, assist automation against a human-opened portal session, retain human verification and discharge control, then ingest the final bill, extract eligible pharmacy/consumable supporting sections, compose the intended output, and store operational artifacts outside the executable. (`USER_EXPLICIT`, `SOURCE_CONFIRMED`)

This repository is the single canonical source of truth. All later phases must evolve it in place; no parallel replacement repository or application is permitted. (`USER_EXPLICIT`)

Phase 0 freezes product requirements only. It changes no implementation, rate data, portal behavior, or business rule. (`USER_EXPLICIT`)

# 2. Problem Statement

Daily CGHS billing involves repeated interpretation of variable, paginated hospital bill PDFs; deterministic quantity and code rules; fragile portal entry; manual verification/discharge; and final supporting-section preparation. The current Python utility proves parts of parsing and portal enhancement but uses heuristics and synthetic validation ranges that are unsafe as final authority. The existing v5 desktop application proves offline billing, rate lookup, bill presentation, storage, backup, reporting, and Electron integration, but it is not the same end-to-end enhancement/finalization workflow. VNEXT must preserve proven behavior while joining these capabilities around the actual operator workflow, without silently changing financial rules. (`SOURCE_DERIVED`)

# 3. Target Users

- Primary: hospital CGHS billing operator performing daily bill enhancement and finalization. (`USER_EXPLICIT`)
- Secondary: billing supervisor/owner reviewing exceptions, overrides, audit records, and completed outputs. (`INFERRED`; role controls exist in HFOS, but VNEXT roles need validation.)
- Technical/support user: diagnoses failed parsing, CDP connection, and portal transactions using logs and artifacts. (`SOURCE_DERIVED`)

# 4. Primary Daily Workflow

1. Operator opens the Windows EXE. (`USER_EXPLICIT`)
2. Operator uploads the current hospital bill PDF. (`USER_EXPLICIT`)
3. Operator manually starts Chrome in debugging/CDP mode, opens the real CGHS portal, and authenticates/navigates as required. (`USER_EXPLICIT`)
4. Operator explicitly starts enhancement automation. (`USER_EXPLICIT`)
5. Software reads the bill and identifies its semantic sections. (`USER_EXPLICIT`)
6. Software normalizes and validates codes against the authoritative CGHS rate list and applies only established deterministic rules. (`USER_EXPLICIT`)
7. Software executes the enhancement plan as quickly and safely as portal state permits. (`USER_EXPLICIT`)
8. Software reports complete, partial, stopped, or failed outcomes with item-level evidence. (`SOURCE_DERIVED`)
9. Operator manually verifies the enhancement result. (`USER_EXPLICIT`)
10. Operator manually performs discharge when required. (`USER_EXPLICIT`)
11. Operator uploads the final bill again. (`USER_EXPLICIT`)
12. Software semantically extracts eligible primary/final supporting pharmacy and consumable sections, excluding Patient Payable context. (`USER_EXPLICIT`)
13. Software appends those sections below the generated bill in the approved final-bill format. (`USER_EXPLICIT`; exact layout `REQUIREMENT_UNDEFINED`.)
14. Software stores source, output, supporting, audit, log, and failure artifacts in persistent storage outside the EXE. (`USER_EXPLICIT`)

Control model: **AUTOMATION → RESULT → HUMAN VERIFICATION → MANUAL DISCHARGE → FINAL BILL → AUTOMATIC FINALIZATION/STORAGE**. (`USER_EXPLICIT`)

# 5. Product Goals

- Preserve proven enhancement and billing behavior unless an authoritative change is approved. (`USER_EXPLICIT`)
- Prevent Patient Payable data from contaminating enhancement or final supporting extraction. (`USER_EXPLICIT`)
- Correctly handle compound/merged code representations and retain transformation provenance. (`USER_EXPLICIT`)
- Use rate-list-backed, deterministic, explainable calculations. (`USER_EXPLICIT`)
- Make portal entry fast, idempotent where feasible, reconcilable, stoppable, and recoverable. (`SOURCE_DERIVED`)
- Keep the operator informed and in control at irreversible or ambiguous boundaries. (`USER_EXPLICIT`)
- Produce durable external artifacts independent of the executable. (`USER_EXPLICIT`)
- Preserve privacy, financial integrity, and auditability. (`SOURCE_DERIVED`)

# 6. Non-Goals

- Phase 0 implementation, redesign, refactoring, architecture migration, or live portal testing. (`USER_EXPLICIT`)
- Autonomous login, discharge, final clinical/financial approval, or unattended production portal operation. (`USER_EXPLICIT`)
- AI/LLM authority over quantities, rates, code validity, or financial calculations. (`USER_EXPLICIT`)
- Generic analytics, CRM, marketing, unrelated scheme workflows, or decorative futuristic/neon/gaming UI. (`USER_EXPLICIT`)
- Treating synthetic code ranges as the CGHS authority. (`USER_EXPLICIT`)
- Assuming fixed page counts, fixed line numbers, or a fixed Patient Payable page. (`USER_EXPLICIT`)
- Inventing `+L`, duplicate-item, final-layout, or missing-code rules. (`USER_EXPLICIT`)

# 7. Existing System Baseline

## 7.1 Repository shape

The checkout contains 37 pre-existing tracked files: a 3.26 MB single-file web application, Electron main/preload files, Node metadata, two test harnesses, a Python utility named `app (1).py`, build notes, and 26 historical/analysis Markdown reports. There are no bill PDFs, spreadsheets, CSV rate files, images, logs, packaged binaries, installer scripts, or the historical test fixture directories referenced by reports. (`SOURCE_CONFIRMED`, `SOURCE_UNAVAILABLE`)

## 7.2 HFOS/Billing Suite v5 baseline

`CGHS_Billing_Suite_Pro.html` is a self-contained vanilla-JavaScript application with embedded PDF libraries and an embedded `MASTER_CGHS` table reported and source-observed as 1,998 entries. The current UI exposes eight views in this v5 snapshot: Dashboard, New Bill, Saved Bills, Reports, Settlement, Local Rates, Settings, and Security & Sync. It includes bill creation, calculation, validation, formal bill display/printing, saved-bill revision behavior, duplicate checks, reports, settlement/matching, local rate handling, audit/security features, and a desktop bridge. (`SOURCE_CONFIRMED`)

`main.js` supplies encrypted sql.js storage, AES-256-GCM envelope encryption, installation key handling via Electron `safeStorage` when available (file fallback otherwise), atomic persistence, encrypted backups/restores, browser snapshot migration, IPC, and an offline update placeholder. `preload.js` exposes a constrained bridge with context isolation. (`SOURCE_CONFIRMED`)

## 7.3 Baseline preservation rule

Existing working behavior is a reference baseline, not automatic final architecture. Before later-phase changes, each affected behavior must be regression-characterized. Historical reports may inform test design but are not substitutes for presently available runnable evidence. (`SOURCE_DERIVED`)

# 8. Legacy app.py Role

The brief calls the critical file `app.py`; the repository contains no exact `app.py`, only `app (1).py`. This document treats `app (1).py` as the supplied legacy enhancement system while preserving the filename discrepancy as a conflict requiring confirmation. (`SOURCE_CONFIRMED`, `CONFLICT_REQUIRES_HUMAN_DECISION`)

## 8.1 Confirmed responsibilities

- **PDF ingestion:** PyMuPDF (`fitz`) opens each selected PDF and extracts page text and blocks. (`SOURCE_CONFIRMED`)
- **Parsing:** `CGHSParsingEngine.parse`, `extract_service_rows`, room-rent extraction, department subtotal extraction, row quantity parsing, oxygen quantity parsing, code normalization, aggregation, rejection records, and patient-name extraction. (`SOURCE_CONFIRMED`)
- **Normalization:** `normalize_cghs_code` uses row-aware `CGHS-*` patterns, category mapping, candidate generation, hardcoded exceptions, and a generated `VALID_CODES` set. (`SOURCE_CONFIRMED`)
- **Aggregation:** repeated normalized occurrences sum quantities; `DRUG100` and `CNSU100` sum monetary subtotals but emit quantity 1; provenance is attached. (`SOURCE_CONFIRMED`)
- **Special rules visible in source:** room-rent-derived CC001/WC001; CN002 computed as `ICU row count × 3 + ward row count × 2`; oxygen CC002 quantities 24 for full day, 12 for half day, otherwise 1; raw CN002 and non-room-rent CC001/WC001 are rejected; pharmacy is represented as DRUG100; consumables as CNSU100. (`SOURCE_CONFIRMED`; authority caveat in §17.)
- **Automation:** Selenium attaches to an existing Chrome debugger at `127.0.0.1:9222`; uses layered XPath/CSS locators, frame probing, Angular/spinner idle checks, dropdown selection, specialty synchronization/clear, quantity lock detection, procedure name and amount fields, enhancement reason, Plus dispatch, mutation observation, row verification, duplicate guards, and reconciliation. (`SOURCE_CONFIRMED`)
- **Retries/timeouts:** CDP connection attempts three times; components use short polling timeouts; outer item retry is intentionally absent to reduce duplicate Plus dispatch; uncertain transactions are assumed committed to prevent duplicate action and logged as such. (`SOURCE_CONFIRMED`)
- **Diagnostics:** console/UI timestamped logging; parser JSON audit reports; on automation failure, screenshot, full DOM, metadata, URL, exception and stack trace under working-directory folders. (`SOURCE_CONFIRMED`)
- **Batch/UI:** PyQt drag/drop and picker for multiple PDFs; queue, parsed result table, status/counters, network profile selector, start and graceful stop; QThread performs automation. (`SOURCE_CONFIRMED`)
- **Packaging assumptions:** Python runtime, PyQt5, PyMuPDF, Selenium, compatible Chrome/ChromeDriver, working-directory write access, and manually started debug Chrome. No Python dependency lock or packaging script is present. (`SOURCE_DERIVED`, `SOURCE_UNAVAILABLE`)

## 8.2 Visible risks/bugs to characterize, not silently fix

- Synthetic generated `VALID_CODES` ranges can accept nonexistent codes and reject legitimate/new ones; not authoritative. (`SOURCE_CONFIRMED`)
- No explicit compound expression parser for examples such as `B068+L / B075+L / B126` was found; normalization may interpret tokens heuristically. (`SOURCE_CONFIRMED`)
- Patient Payable exclusion is regex/slice based, not a durable semantic section model. `extract_dept_subtotal` skips a whole slice if it contains `Patient Payable`, `Grand Total`, or `Payer Payable`, which can omit valid primary sections; conversely `extract_consumables_total` has no explicit Patient Payable exclusion. (`SOURCE_CONFIRMED`)
- The comment claims Patient Payable exclusion for DRUG100, but implementation evidence is only the fragile subtotal heuristic. (`SOURCE_CONFIRMED`)
- Text concatenation across pages loses explicit section/page boundaries for subtotal helpers. (`SOURCE_DERIVED`)
- Room-rent classification defaults every non-ICU row to ward; Bed Details fields are not explicitly modeled. (`SOURCE_CONFIRMED`)
- Quantity parsing truncates non-integer quantities and defaults ambiguous rows to 1. (`SOURCE_CONFIRMED`)
- Patient-name regex supports only Latin letters, dots, and spaces. (`SOURCE_CONFIRMED`)
- Dropdown matching uses substring match, not proven exact identity selection in all cases. (`SOURCE_CONFIRMED`)
- Portal duplicate/reconciliation checks count matching row text, which may confuse codes or pre-existing entries; an uncertain transaction can be marked assumed committed without proof. (`SOURCE_DERIVED`)
- `NETWORK_DELAY` profiles are selected in UI but their configuration is not passed into the orchestrator’s fixed component timeouts. (`SOURCE_CONFIRMED`)
- Diagnostics may contain patient data and full portal DOM in unencrypted working-directory folders. (`SOURCE_CONFIRMED`)
- Success completion message logs “ALL PROCEDURES VERIFIED” based on software reconciliation, not human verification. Future wording must distinguish these. (`SOURCE_DERIVED`)
- The current PyQt visual style explicitly uses neon particles/gaming language; it must not be carried into VNEXT. (`SOURCE_CONFIRMED`, `USER_EXPLICIT`)

# 9. HFOS v5 Reference Role

HFOS v5 is represented by the Electron/HTML Billing Suite Pro snapshot and historical reports. (`SOURCE_CONFIRMED`)

**Preserve/reuse candidates:** embedded CGHS lookup behavior pending rate provenance validation; deterministic bill row calculation; validation and amount guards; formal bill table concepts; saved bill revision/audit concepts; duplicate alerts; offline operation; encrypted SQLite adapter; atomic write/backup/restore concepts; constrained preload IPC; export/report utilities where relevant. (`SOURCE_DERIVED`)

**Adapt:** navigation must center the 14-step CGHS enhancement workflow; patient/bill model must include parsed source evidence and automation state; external Storage must be operator-visible and independent of EXE; bill presentation must support eligible appended supporting sections; rate list must become traceably authoritative rather than merely embedded. (`USER_EXPLICIT`, `SOURCE_DERIVED`)

**Do not carry forward automatically:** settlement/CRM-like surfaces not required for daily enhancement; generic dashboard emphasis; mobile/cloud sync; default owner/PIN behavior reported historically; browser-localStorage compatibility beyond controlled migration need; all-schemes vocabulary; unrelated PDF tools; current gaming UI. (`SOURCE_DERIVED`)

**Unknown:** “HFOS v5” is not named as a distinct directory/file; whether this exact v5 RC snapshot is the intended HFOS v5 reference requires confirmation. (`SOURCE_UNAVAILABLE`, `CONFLICT_REQUIRES_HUMAN_DECISION`)

# 10. Billing UI Reference Role

The existing interface uses a left/top tab navigation pattern, KPI cards, searchable tables, bill forms, status chips, validation panels, modals/toasts, light/dark tokens, responsive layouts, and dedicated print CSS/PDF generation. New Bill captures BPLIP, bill number, patient, age/sex, admission/discharge dates and code rows; Saved Bills offers filtering, edit/duplicate/delete/verify; Security exposes backup/restore/migration. (`SOURCE_CONFIRMED`)

VNEXT should retain proven information-density, clear bill tables, inline validation, explicit statuses, and formal print concepts, but adapt screens to Upload → Analysis → Enhancement Plan → Automation → Human Verification → Final Upload → Supporting Extraction → Composition/Storage. It must not blindly clone unrelated dashboard, settlement, mobile, sync, or marketing surfaces. (`USER_EXPLICIT`, `SOURCE_DERIVED`)

Exact typography, spacing, component library, and final navigation are `REQUIREMENT_UNDEFINED`; later design must prioritize legibility and hospital workflow, not futuristic styling. (`REQUIREMENT_UNDEFINED`)

# 11. Core Product Features

- Current/final PDF ingestion with immutable source identity and stage labeling. (`USER_EXPLICIT`)
- Semantic, section-aware bill parser and normalized bill model. (`USER_EXPLICIT`)
- Authoritative rate-list validation and controlled custom entries. (`USER_EXPLICIT`)
- Deterministic rule engine with versioned evidence. (`USER_EXPLICIT`)
- Reviewable enhancement plan before portal action. (`SOURCE_DERIVED`)
- Human-triggered CDP portal automation with per-item outcomes. (`USER_EXPLICIT`)
- Human verification checkpoint and manual discharge boundary. (`USER_EXPLICIT`)
- Final supporting-section extraction and composition. (`USER_EXPLICIT`)
- External persistent Storage, recovery, logs, and audit trail. (`USER_EXPLICIT`)
- Advisory missing-code/anomaly detection separated from authoritative calculation. (`USER_EXPLICIT`)

# 12. Enhancement Automation Requirements

- Attach only to the operator’s existing, authenticated Chrome debugging session; never own credentials/login. (`USER_EXPLICIT`)
- Require explicit operator start and provide graceful stop; no new portal transaction may begin after cancellation is observed. (`SOURCE_DERIVED`)
- Display the enhancement plan, target code/quantity/amount, source evidence, validation status, and unresolved items before execution. (`SOURCE_DERIVED`)
- Retain resilient locator strategies and support modern dropdown/select variants, frames, asynchronous loading, overlays, locked/editable quantity modes, amount-based entries, and portal mutation checks. (`SOURCE_DERIVED`)
- Select exact intended procedures; substring matches alone are insufficient where more than one option can match. (`SOURCE_DERIVED`)
- Verify each transaction against resulting portal state before proceeding. Never blindly re-click Plus after an uncertain outcome. (`SOURCE_DERIVED`)
- Distinguish `CONFIRMED_SUCCESS`, `CONFIRMED_FAILED`, `UNCERTAIN_REQUIRES_REVIEW`, `SKIPPED_ALREADY_PRESENT`, and `USER_STOPPED`; do not label uncertainty as verified. (`SOURCE_DERIVED`)
- Retry only idempotent preparation/read operations. Portal mutations require reconciliation and, if unresolved, human decision. (`SOURCE_DERIVED`)
- Capture sanitized diagnostics on error, including locator/state/timing and optional screenshot/DOM under privacy controls. (`SOURCE_DERIVED`)
- Portal locator/version compatibility and the approved enhancement reason are `RULE_UNDEFINED` pending a controlled portal specification/simulator and operator validation. (`RULE_UNDEFINED`)

# 13. Bill Parsing Requirements

- Parse by semantic sections and table structure, not fixed page number or line number. (`USER_EXPLICIT`)
- Preserve page, section, row text/bounds where available, original token, normalized value, and confidence/reason for every extracted field. (`USER_EXPLICIT`, `SOURCE_DERIVED`)
- Recognize where present: patient header, name, UHID, IP number, bill number, admission/discharge dates, Bed No, Ward Name, department, service name, service code, tariff alias, quantity, duration, service dates, payer payable, department subtotal/total, pharmacy, consumables, Bed Details, Patient Payable, profile breakup, and final totals. (`USER_EXPLICIT`)
- Explicitly model Bed Details: From Date, To Date, Duration, Bed No, Bed Category. (`USER_EXPLICIT`)
- Support variable pagination, repeated headers, wrapped rows, continuation tables, OCR/text-order anomalies, and section labels repeated in different parent contexts. (`USER_EXPLICIT`, `SOURCE_DERIVED`)
- Keep unknown/ambiguous rows; never silently discard them. (`USER_EXPLICIT`)
- Duplicate normalized codes are aggregated only after section exclusion, token splitting, normalization, and validation. Aggregation must retain all contributing rows and math. (`USER_EXPLICIT`)
- Scanned/image-only PDF and OCR policy is `REQUIREMENT_UNDEFINED`; current Python source only confirms text extraction. (`SOURCE_UNAVAILABLE`)
- Actual bill-layout conformance remains blocked because no bill files are present. (`SOURCE_UNAVAILABLE`)

# 14. Compound / Merged Code Requirements

- Detect compound expressions, including `B068+L`, `B075+L`, `B126`, and slash-delimited combinations such as `B068+L / B075+L / B126`, plus equivalent patterns evidenced by future fixtures. (`USER_EXPLICIT`)
- Preserve the exact original expression and source context before transformation. (`USER_EXPLICIT`)
- Tokenize separators without treating the whole expression as one unknown code. (`USER_EXPLICIT`)
- Resolve each component using an authoritative, documented grammar/mapping. The meaning of suffix/prefix `+L` is **`RULE_UNDEFINED`**; no meaning is assigned here. (`USER_EXPLICIT`, `RULE_UNDEFINED`)
- Preserve semantic links among split components so that splitting does not erase package/qualifier meaning. (`USER_EXPLICIT`)
- Validate each resulting code independently against the authoritative rate list; unresolved components remain visible as unknown/ambiguous. (`USER_EXPLICIT`)
- Aggregate duplicates only after successful normalization; record original token → split components → normalized codes → validation result → quantity contribution. (`USER_EXPLICIT`)
- Do not execute unresolved compound items automatically. (`SOURCE_DERIVED`)
- Required source: representative bills and authoritative syntax definition for `+L` and related forms. (`SOURCE_UNAVAILABLE`)

# 15. Patient Payable Exclusion Requirements

- A distinct Patient Payable section has `EXCLUDE_FROM_ENHANCEMENT = TRUE`. (`USER_EXPLICIT`)
- Unless explicitly changed later, it has `EXCLUDE_FROM_FINAL_SUPPORTING_EXTRACTION = TRUE`. (`USER_EXPLICIT`)
- Its codes, quantities, amounts, pharmacy, consumables, duplicates, totals, and rows must not enter primary enhancement calculation, aggregation, enhancement total, or final supporting extraction. (`USER_EXPLICIT`)
- Exclusion must use semantic/structural parent section context and boundaries, not page number. (`USER_EXPLICIT`)
- `IP Pharmacy` under a primary bill section and `IP Pharmacy` under Patient Payable are separate scoped nodes. The latter must never contaminate the former. (`USER_EXPLICIT`)
- Parser output must show detected Patient Payable boundaries and exclusion reasons for audit. (`SOURCE_DERIVED`)
- Ambiguous section boundaries must block affected automatic calculations and request review rather than guess. (`SOURCE_DERIVED`)
- The legacy implementation’s text-slice heuristics do not satisfy this final requirement and are baseline evidence only. (`SOURCE_CONFIRMED`)

# 16. CGHS Rate List Requirements

- The actual approved CGHS rate list is authoritative for code existence, description, rate, tariff alias, and category where applicable. (`USER_EXPLICIT`)
- Store rate-list provenance: source document/file, effective date/version, import date, checksum, and approval status. (`SOURCE_DERIVED`)
- Validate normalized codes against that version and show unknown, newly appearing, deprecated, ambiguous alias, or mismatched category outcomes. (`USER_EXPLICIT`)
- Support locally added/unslotted codes only through explicit, auditable entries with reason, source, approver, effective scope/date, and no silent mutation of authority data. (`USER_EXPLICIT`)
- Do not discard new/unknown codes and do not manufacture mappings from code-shape ranges. (`USER_EXPLICIT`)
- HFOS’s embedded 1,998-entry `MASTER_CGHS` is reusable only after provenance and current authority are verified. (`SOURCE_DERIVED`)
- The authoritative standalone rate file/effective schedule is absent. (`SOURCE_UNAVAILABLE`)

# 17. CN002 / WC001 / Ward / ICU / Oxygen Rule Preservation

The following is observable legacy behavior and must be preserved as a regression baseline until confirmed or superseded by an authoritative rule source:

- CN002 raw service occurrences are rejected; CN002 quantity is calculated from room-rent rows as `(ICU rows × 3) + (ward rows × 2)`. (`SOURCE_CONFIRMED`)
- WC001 quantity is the count of non-ICU room-rent rows; current source notes AC multibed/single categories. (`SOURCE_CONFIRMED`)
- CC001 quantity is the count of ICU room-rent rows. (`SOURCE_CONFIRMED`)
- CC002 oxygen quantity is 24 for FULL DAY/24 hours, 12 for HALF DAY/12 hours, otherwise 1, and quantities are summed. (`SOURCE_CONFIRMED`)
- Raw CC001/WC001 outside room-rent derivation are rejected; CC002 without an oxygen row keyword is rejected. (`SOURCE_CONFIRMED`)

However, the user refers to “already-established” rules while no authoritative rule document or real Bed Details samples exist. Whether row count, Bed Details duration, date spans, category transitions, partial days, overlapping stays, or oxygen occurrences are the ultimate authority is `RULE_UNDEFINED`. The formulas above must not be altered in Phase 0, but must not be promoted beyond “legacy baseline” until the missing source is supplied. (`CONFLICT_REQUIRES_HUMAN_DECISION`, `SOURCE_UNAVAILABLE`)

# 18. Missing-Code / Anomaly Detection

- Detect unexpected, invalid, unknown, duplicate, and potentially missing codes when sufficient evidence exists. (`USER_EXPLICIT`)
- Deterministic checks (rate-list membership, arithmetic, mandatory relationships established by rules, section exclusions) are authoritative and reproducible. (`USER_EXPLICIT`)
- AI/LLM or heuristic reasoning may suggest anomalies and explain evidence but must be labeled advisory, confidence-scored, and unable to alter quantities/rates or auto-submit portal entries. (`USER_EXPLICIT`)
- Advisory output must cite source rows and the rule/evidence used; users can accept, reject, or defer suggestions without rewriting source facts. (`SOURCE_DERIVED`)
- The existing HFOS `HBIE` is described in source/reports as read-only advisory and is a reference concept, not automatically approved VNEXT behavior. (`SOURCE_CONFIRMED`)
- The clinical/billing relationships sufficient to infer each missing code are `RULE_UNDEFINED`. (`RULE_UNDEFINED`)

# 19. Pharmacy Extraction

- After manual enhancement verification/discharge and final-bill upload, detect eligible primary/final sections including IP Pharmacy, OP Pharmacy, and OT Pharmacy. (`USER_EXPLICIT`)
- Preserve item identity, source description/code where available, quantity, unit price, amount, parent section, page, row context, and extraction status. (`USER_EXPLICIT`)
- Exclude every pharmacy subsection whose ancestor/context is Patient Payable. (`USER_EXPLICIT`)
- Do not equate legacy DRUG100 subtotal enhancement logic with final item-level extraction; they are separate functions. (`SOURCE_DERIVED`)
- Duplicate pharmacy line policy (sum, preserve lines, batch-aware merge, or no merge) is `RULE_UNDEFINED`. (`USER_EXPLICIT`)

# 20. Consumables Extraction

- Detect eligible Consumables, OT Consumables, Ward Consumables, Cathlab Consumables, and other clearly identifiable supporting consumable sections. (`USER_EXPLICIT`)
- Preserve item identity, quantity, unit price, amount, parent section/category, page, row context, and extraction status. (`USER_EXPLICIT`)
- Exclude all Patient Payable descendants. (`USER_EXPLICIT`)
- Do not equate legacy CNSU100 subtotal enhancement logic with final item-level extraction. (`SOURCE_DERIVED`)
- Duplicate consumable line policy and category precedence are `RULE_UNDEFINED`. (`RULE_UNDEFINED`)

# 21. Final Bill Composition

- Append approved extracted pharmacy/consumable sections below the generated bill in the intended final billing format. (`USER_EXPLICIT`)
- Composition must not alter original extracted values; transformations and pagination must be auditable. (`SOURCE_DERIVED`)
- User must preview and confirm composition before finalization. (`SOURCE_DERIVED`)
- Exact section order, headings, columns, typography, letterhead, signatures, continuation pages, totals, and whether content is redrawn versus source-page appended are `REQUIREMENT_UNDEFINED`. (`REQUIREMENT_UNDEFINED`)
- Required source: approved final bill sample/template and print/PDF acceptance criteria. (`SOURCE_UNAVAILABLE`)

# 22. External Storage

- User data must never depend on being inside the EXE or installation bundle. (`USER_EXPLICIT`)
- Use a durable external Storage area conceptually covering source bills, final bills, supporting sections, logs, failed cases, and reports. (`USER_EXPLICIT`)
- Preserve immutable source uploads and link subsequent final uploads/outputs to the same case without filename-only identity. (`SOURCE_DERIVED`)
- Use atomic writes, collision-safe naming, recovery, backup/restore, integrity checks, and clear storage-location visibility. (`SOURCE_DERIVED`; patterns exist in v5.)
- Exact directory layout, retention, naming, encryption, and configurable location belong to later architecture and are `REQUIREMENT_UNDEFINED`. (`USER_EXPLICIT`)
- Existing Electron `%APPDATA%` encrypted DB is valuable baseline behavior but does not by itself satisfy the requested project Storage artifact area. (`SOURCE_DERIVED`)

# 23. Human Verification

- No automation result becomes final merely because Selenium completed. (`USER_EXPLICIT`)
- Present planned versus observed portal outcomes, exceptions, exclusions, unknowns, and uncertain transactions for operator review. (`SOURCE_DERIVED`)
- Record verifier identity/time and outcome without implying portal or discharge approval beyond what the human confirms. (`SOURCE_DERIVED`)
- Manual discharge remains outside software automation unless a future explicit requirement changes the boundary. (`USER_EXPLICIT`)
- Final upload must be explicitly identified as final-bill stage and associated with the verified case. (`SOURCE_DERIVED`)

# 24. Live Portal Boundary

**Automatable software tasks:** local PDF parsing, section classification, rate validation, deterministic calculation, plan preparation, operator-triggered Selenium interaction through an existing CDP session, portal state reading/reconciliation, local diagnostics, final-bill extraction/composition/storage, and local simulation/testing. (`USER_EXPLICIT`)

**Human-controlled tasks:** Chrome/debug startup, production portal login/session, navigation where needed, permission to start/stop enhancement, review of ambiguous/uncertain state, final enhancement verification, manual discharge, and acceptance of final output. (`USER_EXPLICIT`)

Development agents must not access or operate the live hospital portal. Portal automation development must use mocks/simulators/sanitized fixtures until the operator conducts controlled validation. (`USER_EXPLICIT`)

# 25. Error and Recovery Requirements

- Parser failure must retain source file and partial evidence; no silent empty success. (`SOURCE_DERIVED`)
- Rate-list absence/version mismatch and unresolved compound/unknown code must block unsafe automatic submission. (`SOURCE_DERIVED`)
- CDP unavailable/session lost/wrong page/locator ambiguity must fail safely with corrective guidance. (`SOURCE_DERIVED`)
- Every portal mutation must have a transaction identity/state and reconciliation evidence. Unknown state must require review, not automatic replay. (`SOURCE_DERIVED`)
- Graceful stop completes or reconciles the in-flight action and prevents the next mutation. (`SOURCE_DERIVED`)
- Recovery after restart must show case stage and never automatically resume portal mutations. (`SOURCE_DERIVED`)
- Preserve screenshots/DOM only when needed and securely; diagnostics capture failure must itself be reported. (`SOURCE_DERIVED`)
- Storage writes must be atomic and recoverable; restore must verify backup before replacement, following the v5 proven pattern. (`SOURCE_DERIVED`)

# 26. Auditability

For each case retain, subject to privacy/retention policy:

- source/final file identity and checksum;
- parser/rule/rate-list versions;
- semantic sections and exclusions;
- original tokens, normalized/split codes, unknowns, and reasons;
- quantity/rate/amount inputs and deterministic math;
- every duplicate aggregation contributor;
- Patient Payable exclusion flags;
- enhancement plan and operator start/stop;
- per-portal-action intent, observed result, retries/reconciliation, and uncertainty;
- failures and diagnostic artifact references;
- human verification/discharge acknowledgment state;
- supporting extraction and composition lineage;
- output paths and checksums.

All are `SOURCE_DERIVED` from the explicit auditability and human-control requirements. Audit records must be append-oriented; corrections create a new revision rather than erase history. (`SOURCE_DERIVED`; revision concepts exist in HFOS.)

# 27. Performance Goals

- Primary priority is correctness and duplicate-safe portal behavior; speed must not bypass validation, reconciliation, or human gates. (`USER_EXPLICIT`, `SOURCE_DERIVED`)
- Parsing and plan generation should provide visible progress and keep the desktop UI responsive. (`SOURCE_DERIVED`)
- Portal automation should replace fixed sleeps with state-based waits where safe, as the legacy source generally attempts. (`SOURCE_DERIVED`)
- Batch processing must expose per-case and per-item progress and support cancellation. (`SOURCE_CONFIRMED`, `SOURCE_DERIVED`)
- Numerical targets for startup, PDF parse, rate lookup, portal throughput, batch size, and composition are `REQUIREMENT_UNDEFINED` pending representative bills, hardware, and a portal simulator. (`REQUIREMENT_UNDEFINED`)
- Historical HFOS performance claims are contextual only; their referenced raw fixtures/harnesses are absent and they do not measure VNEXT enhancement. (`SOURCE_UNAVAILABLE`)

# 28. Security / Privacy Considerations

- Bills, portal DOM, screenshots, logs, patient identifiers, and outputs are sensitive operational/health data; minimize collection and exposure. (`SOURCE_DERIVED`)
- Operate offline by default; no cloud/telemetry/LLM upload without explicit future privacy approval. (`SOURCE_DERIVED`)
- Never store portal credentials or automate login. (`USER_EXPLICIT`)
- Apply least-privilege IPC, path validation, safe rendering/escaping, and context isolation for an Electron implementation; v5 provides reference patterns. (`SOURCE_DERIVED`)
- Encrypt sensitive persistent data and backups where approved; protect keys with OS facilities where available. (`SOURCE_DERIVED`)
- Sanitize logs and gate screenshot/DOM capture; legacy raw DOM diagnostics are a known exposure. (`SOURCE_DERIVED`)
- Access roles, retention period, secure deletion, backup custody, and whether external PDFs must be encrypted are `REQUIREMENT_UNDEFINED`. (`REQUIREMENT_UNDEFINED`)

# 29. EXE / Desktop Deployment Requirements

- Deliver as a Windows desktop EXE suitable for daily offline hospital use. (`USER_EXPLICIT`)
- Data and operational artifacts persist independently from EXE replacement/uninstall. (`USER_EXPLICIT`)
- Package all required runtime dependencies with deterministic versions; provide clear Chrome debugging startup guidance and compatibility checks. (`SOURCE_DERIVED`)
- Support Windows 10/11 validation on actual hospital hardware before release. (`SOURCE_DERIVED`; v5 report also flags this.)
- Preserve install/portable data paths during upgrades and provide migration/rollback. (`SOURCE_DERIVED`)
- Code signing, installer technology, supported architectures, auto-update policy, Python-vs-Electron process topology, and Chrome/driver distribution are `REQUIREMENT_UNDEFINED`. (`REQUIREMENT_UNDEFINED`)
- Repository build notes reference Electron 31.7.7, an `app/` directory, `desktop-bridge.js`, `build/`, `node_modules`, and `06_Documentation/installer.nsi`, none of which are present. Packaging is therefore not reproducible from this checkout. (`SOURCE_CONFIRMED`, `SOURCE_UNAVAILABLE`)

# 30. Phase-Level Product Roadmap

1. **Phase 0:** source audit and PRD only — this document. No implementation. (`USER_EXPLICIT`)
2. **Phase 1:** project skeleton, EXE foundation, external Storage. (`USER_EXPLICIT`)
3. **Phase 2:** bill ingestion, parser, normalized bill model. (`USER_EXPLICIT`)
4. **Phase 3:** CGHS rate list and deterministic rule engine. (`USER_EXPLICIT`)
5. **Phase 4:** portal enhancement automation. (`USER_EXPLICIT`)
6. **Phase 5:** enhancement verification workflow/UI. (`USER_EXPLICIT`)
7. **Phase 6:** final-bill pharmacy/consumable extraction and composition. (`USER_EXPLICIT`)
8. **Phase 7:** storage, recovery, logs, auditability. (`USER_EXPLICIT`)
9. **Phase 8:** performance and reliability optimization. (`USER_EXPLICIT`)
10. **Phase 9:** EXE packaging/deployment. (`USER_EXPLICIT`)
11. **Phase 10:** full regression testing and release validation. (`USER_EXPLICIT`)

Each phase requires its own approved scope and must preserve earlier acceptance criteria. No later phase begins automatically. (`USER_EXPLICIT`)

# 31. Acceptance Criteria

## Phase 0 acceptance

- [x] Canonical repository and full tracked tree inventoried.
- [x] Actual Python, HTML/JS, Electron, storage, tests, build notes, and reports inspected; not README-only.
- [x] `app (1).py` audited at function/class level and left unchanged.
- [x] Existing enhancement and HFOS billing behaviors recorded as baselines, with authority caveats.
- [x] Daily workflow and live human/software boundary explicitly defined.
- [x] Compound handling, undefined `+L` semantics, post-normalization aggregation, and transformation audit trail required.
- [x] Patient Payable has both required exclusion flags and contextual `IP Pharmacy` separation.
- [x] Bed Details and legacy CN002/WC001/ICU/ward/oxygen behavior recorded without inventing new formulas.
- [x] Rate list made authoritative; synthetic ranges disallowed as authority; unknowns retained.
- [x] Advisory missing-code reasoning separated from deterministic calculation.
- [x] Pharmacy/consumable final extraction and append-below-bill workflow required, with undefined policies identified.
- [x] External Storage and EXE/data separation required.
- [x] Undefined requirements, unavailable sources, and conflicts listed.
- [x] Only `PRD.md` is changed in Phase 0.

## Future product acceptance gates

- Representative fixture suite proves semantic Patient Payable exclusion across varying page counts and duplicate section names. (`USER_EXPLICIT`)
- Compound fixtures prove each component’s traceable normalization and no whole-expression unknown false positive. (`USER_EXPLICIT`)
- Deterministic outputs match human-approved expected results for all established special rules. (`SOURCE_DERIVED`)
- Unknown/ambiguous codes cannot be silently submitted or discarded. (`USER_EXPLICIT`)
- Portal simulator tests prove no blind mutation retry and correct uncertainty handling; live validation remains operator-controlled. (`SOURCE_DERIVED`)
- Final output matches an approved sample and preserves extracted line values. (`SOURCE_DERIVED`)
- Restart, backup, restore, upgrade, and uninstall tests prove external data survival. (`SOURCE_DERIVED`)
- Windows release receives manual operator validation on intended hardware. (`SOURCE_DERIVED`)

# 32. Undefined / Blocked Requirements

| ID | Classification | Requirement/evidence needed |
|---|---|---|
| U-01 | `SOURCE_UNAVAILABLE` | Real current and final hospital bill PDFs, including Patient Payable, Bed Details, compound codes, varied pagination, and eligible supporting sections. |
| U-02 | `RULE_UNDEFINED` | Authoritative grammar/meaning of `+L` and equivalent compound syntax. |
| U-03 | `SOURCE_UNAVAILABLE` | Current authoritative CGHS rate list with provenance/effective date and tariff alias definitions. |
| U-04 | `RULE_UNDEFINED` | Human-approved CN002/WC001/CC001/CC002 ward/ICU/oxygen rule document and edge cases. |
| U-05 | `RULE_UNDEFINED` | Pharmacy and consumable duplicate-line treatment. |
| U-06 | `REQUIREMENT_UNDEFINED` | Approved final bill composition sample/template and print rules. |
| U-07 | `RULE_UNDEFINED` | Evidence-to-code rules for likely missing-code detection. |
| U-08 | `REQUIREMENT_UNDEFINED` | Storage location/configuration, naming, retention, encryption, and recovery policy. |
| U-09 | `SOURCE_UNAVAILABLE` | Controlled portal DOM/specification or simulator, sanctioned locators, and approved enhancement reason values. |
| U-10 | `REQUIREMENT_UNDEFINED` | Numeric performance targets and representative hardware/batch volumes. |
| U-11 | `REQUIREMENT_UNDEFINED` | OCR/scanned PDF support and confidence/review policy. |
| U-12 | `REQUIREMENT_UNDEFINED` | Roles, permissions, audit retention, backup custody, and privacy policy. |
| U-13 | `SOURCE_UNAVAILABLE` | Reproducible v5 build assets, installer, desktop bridge, app directory, and historical fixture/test suite. |
| U-14 | `REQUIREMENT_UNDEFINED` | Final architecture/process split and packaging/signing/update strategy (belongs to later architecture). |

## Source conflicts

1. **Filename:** brief requires `app.py`; repository has only `app (1).py`. Treated as legacy source, but rename/canonical identity requires human confirmation. (`CONFLICT_REQUIRES_HUMAN_DECISION`)
2. **Version identity:** HTML/reports contain historical 3.1, 3.2, 3.5, 4.0 and UI string histories, while package/Electron report identify 5.0.0-rc.1; test source expects an internal `APP_VERSION` 4.0. Distinguish desktop package version from embedded core version until version policy is approved. (`CONFLICT_REQUIRES_HUMAN_DECISION`)
3. **Views:** older analysis reports describe 10 views including PDF Tools and Mobile; current v5 reports/tests describe eight, and current markup exposes eight active navigation buttons. Current source is the baseline; reports are historical. (`SOURCE_CONFIRMED`)
4. **Dependencies/build:** old analysis says package metadata is test-only and includes jsdom/Puppeteer; current package contains only sql.js and is Electron runtime metadata. Current files are later evidence, but complete packaging assets are missing. (`SOURCE_CONFIRMED`)
5. **Storage:** external project Storage is explicitly required, whereas current Electron stores encrypted DB/backups in Electron userData (`%APPDATA%` on Windows). Later architecture must reconcile artifact visibility/location without silently replacing proven DB safety. (`CONFLICT_REQUIRES_HUMAN_DECISION`)
6. **Rule authority:** legacy source contains concrete CN002/room/oxygen formulas, but no authoritative rule document or real bill evidence is present. Preserve as baseline; human/domain authority must confirm. (`CONFLICT_REQUIRES_HUMAN_DECISION`)
7. **Patient Payable claim versus implementation:** source normalization text says “Patient Payable excluded,” but parser uses fragile regex slicing and consumables has no explicit exclusion. The desired semantic guarantee is not confirmed by implementation. (`SOURCE_CONFIRMED`)
8. **Historical tests versus checkout:** reports claim large passing test matrices, but most harnesses/fixtures/raw results are absent. Only `test-desktop.js` and `test-migration.js` remain, and they were not executed in Phase 0. Historical claims are not re-certified. (`SOURCE_UNAVAILABLE`)

# 33. Source Inventory and Evidence

## Files actually inspected

**Core implementation:**
- `app (1).py` — all 3,247 lines; imports/constants, parser helpers and engine, diagnostics, DOM resolver/synchronizer, controllers, orchestrator, batch thread, PyQt UI, startup.
- `CGHS_Billing_Suite_Pro.html` — structure/styles/views and implementation searched/audited at function and subsystem level; embedded master data, billing, storage adapter, parser/import, settlement, reports, security and UI surfaces identified.
- `main.js` — Electron lifecycle, encrypted SQLite persistence, IPC, backup/restore, migration, update placeholder.
- `preload.js` — desktop bridge/API exposure.
- `package.json`, `package-lock.json` — product/version/dependency metadata.
- `test-desktop.js`, `test-migration.js` — available Electron and migration test intent/assumptions.

**Build/config/reference:**
- `BUILD_INSTRUCTIONS.txt`, `PORTABLE_HOWTO.txt`, `BROWSER`.
- `00_PROJECT_ANALYSIS_REPORT.md`, `ADVANCED_SETTLEMENT_REPORT.md`, `BILL_PRESENTATION_REPORT.md`, `CASE_GROUP_ENGINE_REPORT.md`, `CLOUD_SYNC_SECURITY_REPORT.md`, `DEPENDENCY_MAP.md`, `ENGINE_AUDIT_REPORT.md`, `FEATURE_MAP.md`, `FUNCTION_MAP.md`, `INGESTION_ENGINE_REPORT.md`, `MATCHING_ENGINE_REPORT.md`, `PHASE2_ZERO_AMOUNT_MISMATCH_REPORT.md`, `PHASE3_FINANCIAL_INTEGRITY_REPORT.md`, `PHASE4_HBIE_AI_REPORT.md`, `PHASE_2B_REPORT.md`, `RELEASE_AUDIT_REPORT.md`, `REPORT_MAPPING_FIX.md`, `ROBUST_SETTLEMENT_REPORT.md`, `SETTLEMENT_MODULE_REPORT.md`, `STORAGE_MAP.md`, `UI_MAP.md`, `UI_WORKFLOW_REPORT.md`, `UNIVERSAL_READER_REPORT.md`, `UPGRADE_V3.2_REPORT.md`, `V4_PRODUCTION_READINESS_REPORT.md`, `V5_RC_DESKTOP_RELEASE_REPORT.md`, `VALIDATION_REPORT.md`.

## Sources confirmed absent

No exact `app.py`; no separate HFOS v5 tree; no bill/sample PDFs; no rate-list CSV/XLS/XLSX/PDF; no assets/images; no operational logs or generated reports; no Python dependency/packaging file; no `app/`, `build/`, `desktop-bridge.js`, installer NSI, historical `tests/` tree, fixtures, raw benchmark outputs, packaged EXE, or release ZIP. (`SOURCE_UNAVAILABLE`)

## Validation performed in Phase 0

Read-only repository inventory, file-size/type review, Git status/history review, AST enumeration of Python classes/functions, source searches, and static source reading were performed. No application tests, live portal operations, production validation, package build, or claim of current test success was made. (`SOURCE_CONFIRMED`)
