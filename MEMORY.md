# CGHS Billing Suite VNEXT — Project Memory

## Current phase

**Phase 2 — Bill Ingestion + PDF Parser + Normalized Bill Model**

Implementation is complete for review. No real hospital bill PDFs were available in the repository/session, so real-layout accuracy remains unvalidated. The parser is not production-ready and does not claim 100% accuracy.

## Completed work

- Added local PDF path/readability/signature/size validation and page-aware text extraction with `pdfjs-dist`.
- Preserved source file identity, SHA-256, raw page text, line content, and one-based page numbers.
- Added semantic section segmentation with explicit start/end/content and cross-page state.
- Added source metadata, patient/admission/billing field extraction without fabricated defaults.
- Added service item extraction with source section/page/line/raw context.
- Added purely syntactic single/compound code normalization.
- Added exact-expression, same-section primary aggregation with occurrence references.
- Added structural Bed Details extraction only; no ward/ICU calculations.
- Added semantic Patient Payable context and nested-section exclusion.
- Added practical parsing audit data and rejected-token reasons.
- Added minimal Select PDF → Parsing → Result/status UI and controlled preload IPC.
- Added a documentation-only future Settlement/Reconciliation boundary.

## Parser modules created

`src/services/bill-ingestion/`:

- `pdf-loader.js`
- `page-parser.js`
- `section-detector.js`
- `field-parser.js`
- `code-normalizer.js`
- `compound-code-parser.js`
- `bed-details-parser.js`
- `aggregator.js`
- `normalized-model.js`
- `bill-parser.js`
- `index.js`

## Normalized Bill Model

```text
BillDocument
├── model_version
├── source { file_path, file_name, byte_size, sha256 }
├── metadata
├── patient
├── admission
├── billing
├── pages[] { page_number, raw_text, lines[] }
├── sections[]                 # primary only
│   └── items[]
├── items[]                    # primary flattened items only
├── aggregates[]               # primary exact-expression aggregation only
├── bed_details[]
├── excluded_sections[]        # Patient Payable hierarchy + excluded items
└── parsing_audit
```

Unavailable fields remain `null`. Excluded Patient Payable items never enter primary `items` or `aggregates`, but remain traceable under `excluded_sections` and audit records.

## Compound-code behavior

- Preserves `raw_code_expression`.
- Produces a whitespace-normalized expression and slash-separated syntactic components.
- Preserves base token and `+` qualifier tokens separately.
- Labels qualifier semantics such as `+L` as `RULE_UNDEFINED` and interpretation as `NOT_INFERRED`.
- Does not perform CGHS rate-list validation or map `B068+L` to an invented authoritative code.

## Patient Payable behavior

- Detects a `Patient Payable` semantic parent marker and closes it at `Patient Payable Total`.
- Carries `PATIENT_PAYABLE` context across nested headings/pages rather than excluding a page number.
- Keeps primary `IP_PHARMACY` and Patient Payable `IP_PHARMACY` as distinct section objects.
- Excludes Patient Payable items from the flattened primary dataset and aggregation.

## Files modified

- `ARCHITECTURE.md`, `RULES.md`, `PHASES.md`, `MEMORY.md`
- `package.json`, `package-lock.json`
- `src/desktop/main.js`, `src/desktop/preload.js`
- `src/ui/index.html`, `src/ui/renderer.js`, `src/ui/styles.css`

## Legacy files intentionally untouched

- `app (1).py`
- `CGHS_Billing_Suite_Pro.html`
- root `main.js` and root `preload.js`
- all CGHS rates, formulas, parser calculations, Selenium/CDP behavior, locators, retries, and historical reports
- `PRD.md`

No CN002, WC001, ICU, ward, oxygen, rate, enhancement, portal, pharmacy attachment, consumable attachment, final composition, missing-code, or settlement calculation was implemented.

## Settlement/Reconciliation evidence and boundary

Inspected the repository settlement implementation/reference in `CGHS_Billing_Suite_Pro.html` plus `SETTLEMENT_MODULE_REPORT.md`, `MATCHING_ENGINE_REPORT.md`, `ROBUST_SETTLEMENT_REPORT.md`, `ADVANCED_SETTLEMENT_REPORT.md`, `CASE_GROUP_ENGINE_REPORT.md`, `VALIDATION_REPORT.md`, and related analysis reports. No separately named new Claims Reconciliation/Bill-UHID Mapping document file was present in the checkout; the Phase 2 instruction itself supplied Registration-ID, IP-first/OP-fallback, multiple-value/status, traceability, count, audit, and validation requirements.

`src/services/settlement/README.md` preserves a future service boundary. The bill parser does not normalize Registration IDs, query IP/OP data, match claims, enrich Bill No/UHID, set `MULTIPLE`/`UNMATCHED`, or invoke/duplicate the HFOS settlement engine.

## Tests actually run

Command: `npm test`

**Result: 15 passed, 0 failed.** Coverage includes:

- synthetic two-page local PDF creation, extraction, page preservation, parser handoff, and source-page checks;
- normalized model metadata, sections, items, traceability, and Bed Details;
- primary IP Pharmacy included versus Patient Payable IP Pharmacy excluded;
- excluded quantity not merged into primary aggregation;
- exact-expression duplicate occurrence retention and numeric quantity aggregation;
- `B068+L / B075+L / B126` preservation/components/audit with no invented semantics;
- plus-sign expression accepted syntactically rather than rejected solely for `+`;
- PDF line reconstruction and clear missing/non-PDF failures;
- Phase 1 configuration, state, logger, and external Storage regressions.

Additional commands:

- JavaScript syntax checks over all `src/**/*.js`: passed.
- `npm audit --omit=dev`: 0 production dependency vulnerabilities.
- `git diff --check`: passed before implementation commit.

## Real bills tested

**None.** There are no PDF files in the repository/session. `tests/integration/pdf-ingestion.test.js` creates a deterministic synthetic PDF and is explicitly not represented as a real-bill regression. `tests/fixtures/bill-text/semantic-bill.json` is synthetic structured text used for deterministic semantic regressions.

## Known limitations

- Actual hospital PDF layouts, text ordering, wrapped/tabular rows, fonts, scanned PDFs/OCR, and all real section variants remain unvalidated.
- Text extraction does not perform OCR.
- Section and field recognition is conservative and marker/regex based; unfamiliar headings remain undetected.
- Item column extraction cannot reliably reconstruct every visually tabular PDF without real fixtures.
- Compound parsing is syntactic only; `+L` remains undefined.
- Aggregation is intentionally narrow: exact normalized expression + same section + numeric quantities only.
- Date values are preserved as source strings; no date/business-duration calculations occur.
- The Phase 1 Electron runtime smoke-test environment blocker remains unresolved.

## Git state

- Branch: `arena/01a0de46-billing-suit`
- Phase 2 implementation commit: `dc9af61`
- Phase 1 foundation commit: `a5915fd`
- Phase 0 PRD commit: `ffb485b`
- Pull request remains open and must not be merged automatically.

## Next phase

**Phase 3 — authoritative CGHS rate list + deterministic rule engine**, only after human review and separate instructions. Phase 3 has not started. Real sanitized bill PDFs should be supplied before treating Phase 2 parsing behavior as a validated baseline.
