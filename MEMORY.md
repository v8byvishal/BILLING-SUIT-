# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 3 — CGHS Rate List + Deterministic Rule Engine**

Implementation is complete for review. It produces an internal deterministic `EnhancementPlan`; it has no portal adapter and performs no live operation. Official rate-list authority and real-bill validation remain unresolved, so the result is not production-ready and does not claim complete CGHS correctness.

## Rate source actually used

The only available repository rate data was `window.MASTER_CGHS` embedded in `CGHS_Billing_Suite_Pro.html`:

- Extracted records: **1,998**
- Snapshot: `src/services/cghs/data/hfos-reference-rates.json`
- Source kind: `HFOS_EMBEDDED_REFERENCE_SNAPSHOT`
- Authority: **`RATE_SOURCE_UNDEFINED`**
- Version/effective date: unavailable
- Source HTML SHA-256: `40152488c6d8eab690afcd46e940ea1c9fcb34e4f50598afb520e9086f822e5f`
- Extracted data SHA-256: `b596cdaf7b70787bd04a2a26d61bda5110de5de5160411152a6a21c52aeb3838`

No standalone CGHS rate PDF/CSV/XLS/XLSX or official provenance was available. The snapshot is never labeled official. Lookups expose its rate as reference evidence, but financial `amount` remains null while authority is undefined. Unit tests use a clearly synthetic `TEST_ONLY_AUTHORITY` fixture to verify authoritative amount calculation mechanics; it is not production data.

## Rate modules created

`src/services/cghs/rate-list/`:

- `loader.js` — local JSON loading
- `normalizer.js` — deterministic code/rate normalization
- `validator.js` — explicit authority/provenance and checksum validation
- `repository.js` — indexed lookups, statuses, conflicts, custom/local separation

Code classifications:

- `VALID`
- `UNKNOWN`
- `UNRESOLVED_COMPOUND`
- `CUSTOM/LOCAL`
- `INVALID_FORMAT`

Duplicate/conflicting source records throw an error instead of selecting silently.

## Custom/local mechanism

Custom entries remain in a separate index and require reason, creator, and timestamp audit fields. A custom code colliding with source data is refused unless audit explicitly approves `override_authoritative: true`. Source records remain intact. No administration UI was added.

## Rule modules created

`src/services/cghs/rules/`:

- `room-evidence.js`
- `cn002.js`
- `cc001.js`
- `wc001.js`
- `cc002.js`
- `rule-engine.js`

Also created:

- `src/services/cghs/enhancement-plan.js`
- `src/services/cghs/index.js`

## Exact deterministic rules implemented

- **CN002 / `CN002_ROOM_BED`:** ICU evidence rows × 3 plus supported ward evidence rows × 2.
- **CC001 / `CC001_ICU_ROOM_RENT`:** count applicable ICU evidence rows.
- **WC001 / `WC001_WARD_ROOM_RENT`:** count applicable supported ward evidence rows.
- **CC002 / `CC002_OXYGEN_ROW`:** oxygen HALF DAY/12 hours = 12; FULL DAY/24 hours = 24; unqualified oxygen = legacy single unit 1; simultaneous HALF and FULL = `REVIEW_REQUIRED`.

Structured primary Bed Details is preferred to duplicate Room Rent text evidence. Recognized ICU categories: ICU, CCU, PICU, MICU. Recognized ward categories: AC Multibeds, Single, General Ward, explicit Ward. HDU/unknown categories are not guessed; they withhold room-derived quantities as `REVIEW_REQUIRED`.

Raw CN002, CC001, and WC001 are `REJECTED_BY_RULE` and cannot add to derived quantities. Raw C002/CC002 is never directly counted: oxygen-context rows are evaluated by CC002 and non-oxygen rows are rejected. All results/rejections include machine-readable provenance, rule IDs, inputs, source page/section/context, warnings, and actions.

## EnhancementPlan

The plan contains:

- bill/source identity
- rate-source provenance
- direct and rule-derived entries
- quantity/rate/amount evidence
- categorical statuses
- rejected candidates
- Patient Payable exclusions
- unknown codes
- unresolved compound codes
- warnings
- full rule audit

Amounts are computed only for explicitly authoritative test/source data or explicit custom/local values. The bundled unverified snapshot cannot produce financial amounts.

## Compound behavior

Phase 3 consumes Phase 2 components without reparsing source text. It looks up each syntactic base token, preserves the raw expression, and retains qualifier tokens. Multi-component or qualified forms such as `B068+L / B075+L / B126` remain `UNRESOLVED_COMPOUND` / `RULE_UNDEFINED`. No `+L` meaning, component combination, or rate sum is invented.

## Patient Payable status

Patient Payable remains semantically excluded. Excluded section items become `EXCLUDED_BY_SECTION` audit records and never enter direct rate candidates, room rules, oxygen rules, quantities, or amounts. Primary IP Pharmacy and Patient Payable IP Pharmacy remain separate.

## Minimal UI

The existing PDF operation now parses once and evaluates once. A small read-only table shows code, quantity, rate evidence, amount, source/rule, and status. It visibly shows `RATE_SOURCE_UNDEFINED`. No portal, custom-rate administration, settlement, or final-composition controls were added.

## Files modified

- `ARCHITECTURE.md`, `RULES.md`, `PHASES.md`, `DESIGN.md`, `MEMORY.md`
- `src/desktop/main.js`
- `src/services/bill-ingestion/bed-details-parser.js` (adds semantic context/exclusion flags to parsed bed evidence)
- `src/ui/index.html`, `src/ui/renderer.js`, `src/ui/styles.css`

## Legacy files intentionally untouched

- `app (1).py`
- `CGHS_Billing_Suite_Pro.html`
- root `main.js` and root `preload.js`
- all legacy Selenium/CDP behavior, portal locators, retries, and enhancement workflow
- existing settlement implementation/reports and `src/services/settlement/README.md`
- `PRD.md`

## Real PDFs tested

**`REAL_FIXTURES_UNAVAILABLE`.** No PDFs exist in the repository/session. Specifically, `38222.pdf`, `40343.pdf`, `39951.pdf`, and `40332.pdf` were not accessible. No patient-specific expectation was hardcoded and no fabricated real-PDF claim was made. The existing deterministic synthetic PDF and structured-text fixtures remain clearly labeled synthetic.

## Tests actually run

Command: `npm test`

**Result: 25 passed, 0 failed.** This includes all Phase 1/2 regression tests plus Phase 3 tests for:

- 1,998-record snapshot count/checksum and undefined authority;
- known, unknown, malformed, missing-rate, compound, custom/local, duplicate/conflict lookups;
- undefined source withholding financial amounts;
- CN002, CC001, WC001 derivation and provenance;
- oxygen HALF DAY, FULL DAY, ambiguous phrases;
- raw special-code rejection/no double count;
- Patient Payable exclusion;
- direct duplicate aggregation;
- unknown/custom plan entries;
- compound component lookups without invented semantics;
- HDU ambiguity review;
- repeat evaluation producing deep-identical output.

Additional commands:

- JavaScript syntax checks over `src/**/*.js`: passed.
- `npm audit --omit=dev`: 0 production dependency vulnerabilities.
- `git diff --check`: passed before the implementation commit.

## Settlement/Reconciliation boundary

Repository settlement reports and the implementation embedded in `CGHS_Billing_Suite_Pro.html` were inspected again. No separately named new reconciliation document file was present; the supplied phase instructions remain the available Registration-ID/IP-first/OP-fallback specification. Settlement remains isolated in `src/services/settlement/` and was not imported, duplicated, modified, or implemented in the CGHS rule engine.

## Unresolved issues

- Official current CGHS rate source, version, effective date, category, and alias provenance are unavailable.
- The embedded source has no WC001 record; derived WC001 therefore remains explicitly unknown under that snapshot.
- Real bills and real parser/rule interaction remain unvalidated.
- HDU and unsupported room categories require an authoritative classification decision.
- Compound `+L` semantics remain undefined.
- Scanned/OCR bills remain unsupported.
- Portal amount semantics are intentionally not addressed.
- The Phase 1 Electron runtime smoke-test environment blocker remains unresolved.

## Git state

- Branch: `arena/01a0de46-billing-suit`
- Phase 3 implementation commit: `da0b0bd`
- Phase 2 implementation commit: `dc9af61`
- Phase 1 foundation commit: `a5915fd`
- Phase 0 PRD commit: `ffb485b`
- Pull request remains open and must not be merged automatically.

## Next phase

**Phase 4 — Enhancement Automation**, only after human review and separate instructions. Phase 4 has not started. No portal connection, Selenium/CDP change, or enhancement submission is present in Phase 3.
