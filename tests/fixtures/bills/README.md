# Phase 5 bill regression fixtures

These fixtures are synthetic, deterministic, and contain no real patient information.

- `production-structure.json` models repeated/multi-page sections, primary and Patient Payable IP Pharmacy, structured Bed Details, raw special-code rejection, wrapped and numeric compound expressions, OCR spacing, malformed code evidence, and a missing-code advisory.
- `oxygen-cases.json` records expected HALF DAY, FULL DAY, and ambiguous oxygen outcomes.
- `stale-bill-b.json` is a second independent bill used to prove state does not leak between parsing runs.

Each fixture keeps expected outcomes human-readable. Real PDF files must not be committed here without privacy/legal approval. The named production PDFs `38222.pdf`, `40343.pdf`, `39951.pdf`, and `40332.pdf` were not accessible in the agent workspace during Phase 5, so no real-PDF result is claimed. When approved files are available locally, pass each through `loadPdf` then `parseBillDocument` and compare a reviewed, de-identified expected manifest before promoting it to automated regression coverage.
