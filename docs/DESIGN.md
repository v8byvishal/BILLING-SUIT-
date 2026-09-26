# Design — Phase 3 Source Parser Workspace

## Design goal

The Phase 3 UI must show real source PDF ingestion and parser evidence without implying downstream CGHS business validation or executable portal actions. Operators should understand where a candidate came from and whether parsing succeeded, produced warnings, produced no candidates, or failed safely.

## Source Bills workspace

The Source Bills section now presents:

- selected source file metadata;
- stored source record list;
- parser status;
- page count;
- candidate count;
- warnings;
- candidate table;
- candidate evidence viewer.

Candidate table columns:

- Page
- Section
- Description
- Code
- Quantity
- Status

The table intentionally does not include “Executable” because Phase 3 candidates are parser evidence only.

## Honest states

Use these meanings consistently:

| State | UI meaning |
|---|---|
| No source | Upload a source bill to begin. |
| Imported / reading | Source bill stored; parser is reading/extracting. |
| Completed | Source PDF parsed and candidates were detected. |
| Completed with warnings | Source PDF parsed; one or more candidates/lines need attention. |
| Parser completed no candidates | PDF parsed successfully, but no candidate enhancement entries were detected. |
| Failed | Source PDF could not be parsed. |

Do not show fake success or portal readiness.

## Candidate evidence

When a candidate is selected, show the raw evidence object. It must include page number, source section, source text, and line numbers when available. `textRange` remains `null` unless real offsets are produced.

## Privacy

Source PDFs may contain patient-sensitive information. The UI should show only necessary parser evidence for the selected candidate and should not dump complete PDF text into generic diagnostics or audit views.

## Navigation sections

The shell keeps:

1. Dashboard
2. Source Bills
3. Enhancement
4. Final Bill
5. Audit / History
6. Settings
7. Diagnostics

Phase 3 changes are concentrated in Source Bills. Enhancement, portal, and final-bill areas must not imply new business-rule or portal capabilities.

## Visual status language

- `READY`, `COMPLETED`, and successful checks use success styling.
- `PARSER_COMPLETED_NO_CANDIDATES`, `AMBIGUOUS`, `NOT VERIFIED`, and review states use warning styling.
- `FAILED`, `READ_ONLY`, `ACCESS_ERROR`, `CORRUPT`, and parser failures use error styling.

Every status is written as text; color is secondary.

## Interaction boundaries

- All privileged actions go through `window.cghsSuite`.
- Parse-result access is controlled through `sourceBill.getParseResult`.
- There is no generic command execution, shell execution, Python execution, JavaScript eval, arbitrary filesystem browsing, unrestricted PDF access, or credential handling.
