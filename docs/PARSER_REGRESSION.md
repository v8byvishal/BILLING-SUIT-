# Parser Regression — Description (CODE)

## Historical finding

Phase 0 found that the active parser did not prove support for parenthesized `Description (CODE)` source layouts. A row such as:

```text
Some Procedure (LB126) Qty: 1
```

could produce zero parser items unless a labeled `Code:` field was present.

## Phase 3 requirement

The parser must preserve evidence and emit at least one candidate when valid source evidence contains a description followed by a parenthesized code.

Supported synthetic regression patterns:

```text
Blood Transfusion Charge (C008)
Blood Transfusion Charge (C008) Qty 2
Blood Transfusion Charge
(C008)
Blood Transfusion Charge
(C008)
Qty 2
```

Expected candidate properties:

- `candidateCount >= 1`
- description contains the source description;
- `codeRaw == "C008"`;
- `codeNormalizedCandidate == "C008"`;
- no `CC008` transformation;
- evidence includes page and source text.

## Real vs synthetic status

No approved real hospital-bill PDF fixture exists in this checkout. The real fixture directory documents that production PDFs were unavailable and must not be committed without privacy/legal approval.

Therefore:

```text
REAL_PDF_REGRESSION: NOT AVAILABLE — synthetic fixture used
```

## Synthetic fixtures

Phase 3 tests generate deterministic synthetic PDFs with names such as:

- `synthetic_description_code_regression.pdf`
- `synthetic_description_code_wrapped_regression.pdf`
- `synthetic_description_code_quantity.pdf`

Golden expected JSON files are stored under:

```text
tests/fixtures/parser/description-code-basic.expected.json
tests/fixtures/parser/description-code-wrapped.expected.json
```

These fixtures are synthetic and contain no patient data.

## Negative coverage

The parser intentionally does not treat these as valid code candidates:

```text
(1234)
(ABCD)
(C123456)
random text
Invoice Reference (C008)
```

The regex is deliberately constrained to documented code evidence with context rather than broad parenthesis matching.

## Test proof

The Phase 3 suite contains direct tests for:

- same-line `Description (C008)`;
- wrapped `Description` newline `(C008)`;
- code + quantity;
- multiple candidates;
- C008 preservation;
- no C-to-CC transformation;
- false-positive parenthesized values;
- persistence of parser output.

Current result: Phase 3 parser tests PASS — 31/31.
