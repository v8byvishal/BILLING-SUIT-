# Project Memory

Read this file first for current implementation state. Source audit evidence is in `docs/SOURCE_AUDIT.md`; Phase implementation notes are in `docs/PHASE_01_IMPLEMENTATION.md`, `docs/PHASE_02_IMPLEMENTATION.md`, and `docs/PHASE_03_IMPLEMENTATION.md`.

## Current Project Status

- **Current branch:** `arena/01a0dfad-billing-suit`
- **Phase 2 baseline:** `849c01e58a54108dfbc3e60d62f62ad5af43cb85` / `phase-02-external-storage`
- **Phase 3 commit target:** `phase-03: implement source PDF ingestion and parser regression coverage`
- **Product version:** `5.0.0-rc.2`
- **Current milestone:** Phase 3 Source Bill PDF Ingestion, Evidence Extraction & Historical Parser Regression implemented in the working tree.
- **Overall status:** Source PDF import through external Storage, immutable artifact parsing, page extraction, conservative normalization, section detection, evidence candidate extraction, parse-result persistence, audit/failure records, and Source Bills UI candidate presentation are implemented. Electron runtime launch remains environment-blocked because install scripts were skipped and the Electron binary is unavailable.

## Phase 3 implementation summary

Phase 3 adds parser evidence extraction without changing CGHS business logic or portal behavior.

Implemented:

- `src/services/bill-ingestion/source-parser.js` with parser version `3.0.0`.
- PDF parse flow from stored `Storage/Source_Bills/<billSessionId>/source.pdf`.
- Structured page model with raw and normalized text.
- Conservative normalization that preserves parentheses and code characters.
- Source section detection with `UNKNOWN_SECTION` fallback.
- Evidence candidates for parenthesized `Description (CODE)` layouts.
- Source-derived quantity extraction only; no CGHS-derived formula logic.
- Candidate provenance with page, section, source text, and line numbers.
- Persistent `parse-result.json` under each source bill directory.
- Parser audit events and sanitized failure artifacts.
- UI parser status, candidate count, warnings, candidate table, and evidence display.
- Synthetic golden regression fixtures in `tests/fixtures/parser/`.
- Phase 3 tests in `tests/unit/phase3-source-parser.test.js`.

## Historical parser regression status

Phase 0 found that `Description (CODE)` was not proven fixed. Phase 3 now covers:

- same-line `Blood Transfusion Charge (C008)`;
- wrapped `Blood Transfusion Charge` newline `(C008)`;
- `Qty` on same or following line;
- multiple candidates on a page;
- negative parenthesized values.

The parser preserves `C008` as `C008`; it does not map to `CC008` or perform alias/business-rule normalization.

`REAL_PDF_REGRESSION`: `NOT AVAILABLE — synthetic fixture used`. No approved real hospital-bill PDF fixture exists in this checkout.

## Safety constraints to preserve

- Parser output is evidence only, not executable actions.
- Do not map `C008 -> CC008` or apply any CGHS alias/rule semantics in the parser.
- Do not calculate C002 oxygen, CN002, ICU, ward, or other domain-derived quantities in the parser.
- Do not invoke Selenium, CDP, portal automation, final PDF generation, automatic discharge, external APIs, or credential entry/storage from source parsing.
- Do not log full PDF text, patient-sensitive content, credentials, cookies, tokens, or browser session payloads.
- Renderer still must not receive arbitrary filesystem, shell, Python, Node, JavaScript eval, or process execution capability.

## Current architecture snapshot

```text
Renderer UI
  -> window.cghsSuite controlled API
Electron main process
  -> StorageService source import
  -> parseStoredSourceBill / source-parser
  -> Storage/Source_Bills/<billSessionId>/parse-result.json
  -> audit/failure records
Existing business/portal/final services remain separate
```

## Validation log

Validation commands run during Phase 3 implementation:

- `node --check src/services/bill-ingestion/source-parser.js src/core/storage.js src/desktop/main.js src/desktop/ipc-contract.js src/desktop/preload.js src/ui/renderer.js tests/unit/phase3-source-parser.test.js` — PASS.
- `node --test tests/unit/phase3-source-parser.test.js` — PASS, 31/31 tests.
- `npm test` — PASS, 344/344 tests.
- `python3 -m unittest discover -s tests/python -p 'test_*.py'` — PASS, 32/32 tests.
- `npm run test:desktop` — FAIL/BLOCKED before Electron launch: `Electron failed to install correctly` after dependency install with scripts skipped.

Known environment notes:

- Electron runtime smoke is not a product PASS in this environment.
- Live CGHS portal validation is not verified.
- Real PDF regression is not available; only synthetic non-PHI fixtures were used.
- Windows EXE, clean-machine, and packaged artifact validation are not Phase 3 claims.

## Important paths

- `src/services/bill-ingestion/source-parser.js` — Phase 3 parser pipeline.
- `src/core/storage.js` — parse-result persistence helpers.
- `src/desktop/main.js` — Source Bills import/parse integration.
- `src/desktop/ipc-contract.js`, `src/desktop/preload.js` — controlled parse-result access.
- `src/ui/index.html`, `src/ui/renderer.js` — Source Bills candidate/evidence UI.
- `tests/unit/phase3-source-parser.test.js` — Phase 3 parser regression coverage.
- `tests/fixtures/parser/*.expected.json` — synthetic golden parser expectations.
- `docs/PARSER_PIPELINE.md` and `docs/PARSER_REGRESSION.md` — parser architecture and regression documentation.
