# Phase 03 Implementation — Source Bill PDF Ingestion, Evidence Extraction & Historical Parser Regression

Date: 2026-09-27
Branch: `arena/01a0dfad-billing-suit`
Baseline: `849c01e58a54108dfbc3e60d62f62ad5af43cb85`
Commit target: `phase-03: implement source PDF ingestion and parser regression coverage`

## Scope delivered

Phase 3 adds a source-bill PDF evidence extraction pipeline on top of the Phase 2 `StorageService`. It does not change CGHS mappings, CGHS business rules, EnhancementPlan semantics, portal automation, Selenium/CDP behavior, final PDF composition, automatic discharge, or credential handling.

Pipeline implemented:

```text
PDF selection
  -> StorageService source import
  -> immutable stored Source_Bills/<billSessionId>/source.pdf
  -> PDF validation/open using pdfjs-dist
  -> page extraction
  -> conservative text normalization
  -> section detection
  -> evidence candidate extraction
  -> parse-result.json persistence
  -> audit/failure records
  -> Source Bills UI presentation
```

## Parser version

`PARSER_VERSION`: `3.0.0`

The parser version is stored in each parse result to make historical output attributable to parser behavior.

## New source modules

- `src/services/bill-ingestion/source-parser.js`
  - safe parser status model;
  - structured page model;
  - conservative text normalization;
  - section detection;
  - Description `(CODE)` candidate extraction;
  - source-derived quantity extraction;
  - evidence/provenance model;
  - parser result persistence helper for stored source artifacts.

- `src/core/storage.js`
  - added `writeParseResult()` and `readParseResult()`;
  - `listSourceBills()` now includes lightweight parse summaries when available.

- `src/desktop/main.js`
  - Source PDF import now stores via `StorageService`, parses from the stored immutable copy, persists `parse-result.json`, updates bill-session status, and records audit/failure artifacts.

- `src/ui/index.html`, `src/ui/renderer.js`
  - Source Bills view displays parser status, page count, candidate count, warnings, candidate table, and candidate evidence.

## Parser result schema

`Storage/Source_Bills/<billSessionId>/parse-result.json` stores:

```json
{
  "schemaVersion": 1,
  "billSessionId": "...",
  "runId": "...",
  "parserVersion": "3.0.0",
  "status": "COMPLETED",
  "pageCount": 1,
  "candidateCount": 1,
  "warnings": [],
  "source": {
    "fileName": "source.pdf",
    "sha256": "...",
    "byteSize": 0
  },
  "pages": [],
  "sections": [],
  "candidates": [],
  "metrics": {},
  "statusTimeline": []
}
```

The parse result does not embed duplicate PDF bytes and does not contain executable portal actions.

## Page model

Every successful page extraction returns:

```json
{
  "pageNumber": 1,
  "rawText": "...",
  "normalizedText": "...",
  "extractionStatus": "OK"
}
```

Malformed PDFs fail closed with structured parser failure output instead of crashing Electron.

## Candidate model

Candidate extraction produces evidence records, not business-rule decisions:

```json
{
  "candidateId": "candidate-0001",
  "billSessionId": "...",
  "runId": "...",
  "pageNumber": 1,
  "section": "PROCEDURES",
  "description": "Blood Transfusion Charge",
  "rawText": "Blood Transfusion Charge (C008)",
  "codeRaw": "C008",
  "codeNormalizedCandidate": "C008",
  "quantityRaw": null,
  "quantityNormalized": null,
  "unit": null,
  "evidence": {
    "pageNumber": 1,
    "sourceSection": "PROCEDURES",
    "sourceText": "Blood Transfusion Charge (C008)",
    "textRange": null,
    "lineNumbers": [2]
  },
  "confidence": 0.9,
  "status": "VALID_EVIDENCE"
}
```

`codeNormalizedCandidate` only applies whitespace/case cleanup. It does not map `C008` to `CC008`.

## Description (CODE) regression

The historical parser gap documented in Phase 0 was that parenthesized code evidence such as `Description (C008)` could produce zero actionable parser output unless the source had a `Code:` label.

Phase 3 supports:

- `Procedure Description (C008)`
- `Procedure Description (C008) Qty 2`
- `Procedure Description` followed by `(C008)`
- `Procedure Description` followed by `(C008)` and then `Qty 2`
- multiple parenthesized candidates on one page
- PDF line wrapping where the code lands on the next extracted line

Regression proof is synthetic because no approved real historical PDF was present in the repository.

## Fixture strategy

Repository search found no real source PDFs. The existing `tests/fixtures/bills/real/README.md` states real production PDFs were unavailable and should not be committed without privacy/legal approval.

Phase 3 therefore uses deterministic synthetic PDF generation in tests and compact golden expected JSON under:

```text
tests/fixtures/parser/description-code-basic.expected.json
tests/fixtures/parser/description-code-wrapped.expected.json
```

Synthetic fixture filenames used by the test harness are explicitly prefixed with `synthetic_`, including:

- `synthetic_description_code_regression.pdf`
- `synthetic_description_code_wrapped_regression.pdf`
- `synthetic_description_code_quantity.pdf`
- `synthetic_multiple_candidates.pdf`
- `synthetic_negative_parentheses.pdf`
- `synthetic_multi_page.pdf`

No real patient PDF was added.

## Audit and failure records

Storage audit events include:

- `SOURCE_BILL_IMPORT` from `StorageService.importSourceBill()`
- `PDF_PARSE_STARTED`
- `PDF_PARSE_COMPLETED`
- `PDF_PARSE_WARNING`
- `PDF_PARSE_FAILED`
- `PARSER_ZERO_CANDIDATES`

Failures are stored under `Storage/Failures/` with sanitized details and without duplicating the original PDF.

## Validation performed

Commands executed:

```bash
node --check src/services/bill-ingestion/source-parser.js src/core/storage.js src/desktop/main.js src/desktop/ipc-contract.js src/desktop/preload.js src/ui/renderer.js tests/unit/phase3-source-parser.test.js
node --test tests/unit/phase3-source-parser.test.js
npm test
python3 -m unittest discover -s tests/python -p 'test_*.py'
npm run test:desktop
```

Results:

| Check | Result |
|---|---|
| Syntax checks | PASS |
| Phase 3 tests | PASS — 31/31 |
| Full Node suite | PASS — 344/344 |
| Python unittest suite | PASS — 32/32 |
| Desktop smoke | BLOCKED before launch — Electron binary unavailable because install scripts were skipped; error: `Electron failed to install correctly`. |

## Real PDF regression status

`REAL_PDF_REGRESSION`: `NOT AVAILABLE — synthetic fixture used`

No approved non-sensitive real hospital-bill PDF fixture exists in this checkout.

## Explicit non-goals preserved

- No `C008 -> CC008` mapping.
- No alias mapping.
- No invented master codes.
- No CGHS-C rule application.
- No C002/CN002/oxygen/ICU/ward quantity derivation.
- No executable/non-executable business-rule classification.
- No Selenium/CDP/portal invocation.
- No final PDF generation.
- No automatic discharge.
- No external API calls or uploads.
