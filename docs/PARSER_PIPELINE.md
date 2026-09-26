# Parser Pipeline

## Purpose

The Phase 3 parser reads source PDFs, preserves evidence, extracts candidate records, and persists parser output. It does not decide CGHS business validity and does not create executable portal actions.

## Pipeline

```text
Operator selects PDF
  -> StorageService.importSourceBill()
  -> Storage/Source_Bills/<billSessionId>/source.pdf
  -> parseStoredSourceBill()
  -> pdfjs-dist page extraction
  -> page model
  -> conservative normalization
  -> section detection
  -> evidence candidate extraction
  -> Storage/Source_Bills/<billSessionId>/parse-result.json
  -> Source Bills UI
```

The stored source artifact is the canonical parser input for the session.

## Input validation

The parser accepts PDF files only. Validation includes:

- path is absolute;
- `.pdf` extension;
- file exists;
- file is readable;
- non-zero size;
- PDF signature check where practical;
- pdfjs-dist can open the document.

Structured failure codes include:

- `INVALID_SOURCE_PDF`
- `PDF_UNREADABLE`
- `PDF_PARSE_FAILED`
- `PDF_EMPTY`
- `PDF_CORRUPT`

Malformed PDFs return a failed parser result and failure artifact rather than crashing the application.

## Page model

Each extracted page contains:

```json
{
  "pageNumber": 1,
  "rawText": "...",
  "normalizedText": "...",
  "extractionStatus": "OK"
}
```

Raw text is retained for traceability. Normalized text is used for conservative parser matching.

## Normalization

Normalization is intentionally conservative:

- Unicode NFKC normalization;
- line-ending normalization;
- tab/form whitespace normalization;
- repeated-space normalization inside each line;
- trimming.

Normalization does not remove parentheses, code characters, or line-item structure and does not infer missing descriptions.

## Section detection

Section detection uses headings such as:

- `MAIN_BILL`
- `ENHANCEMENT`
- `PROCEDURES`
- `MEDICINES`
- `PHARMACY`
- `CONSUMABLES`
- `WARD`
- `OT`
- `CATHLAB`
- `PATIENT_PAYABLE`
- `UNKNOWN_SECTION`

Unknown text is left as `UNKNOWN_SECTION` instead of being force-fit.

## Candidate extraction

Candidate extraction recognizes documented parenthesized code evidence with context:

```text
Description (C008)
Description (C008) Qty 2
Description
(C008)
Description
(C008)
Qty 2
```

For Phase 3 the documented code pattern is letters followed by exactly three digits, such as `C008` or `LB126`. This intentionally rejects broad false-positive forms such as `(1234)`, `(ABCD)`, and `(C123456)`.

## Candidate schema

Each candidate includes:

- `candidateId`
- `billSessionId`
- `runId`
- page number;
- source section;
- description;
- raw text;
- `codeRaw`;
- `codeNormalizedCandidate`;
- source-derived quantity fields;
- evidence block;
- confidence;
- candidate status.

Candidate status can be:

- `CANDIDATE`
- `VALID_EVIDENCE`
- `AMBIGUOUS`
- `INCOMPLETE`
- `IGNORED`

An ambiguous source line is not treated as parser failure.

## Persistence

Parser output is stored at:

```text
Storage/Source_Bills/<billSessionId>/parse-result.json
```

The parser result stores `parserVersion: "3.0.0"`, `runId`, page count, candidate count, warnings, pages, sections, candidates, metrics, and status timeline.

## Security and privacy

The parser does not:

- send PDF content to external services;
- log full PDF text by default;
- dump credentials or environment variables;
- expose source PDFs through unrestricted IPC;
- create executable portal actions.

Failure artifacts contain sanitized diagnostic information only.
