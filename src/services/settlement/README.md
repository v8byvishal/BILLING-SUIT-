# Future Settlement / Reconciliation Boundary

Phase 2 does **not** implement reconciliation.

The bill-ingestion service returns a traceable `BillDocument`; it does not normalize Registration IDs, query IP/OP sources, match claims, enrich Bill No/UHID, or assign settlement status. A later separately approved service owns that workflow and may consume an explicit, minimal projection from persisted bill records.

Future source-documented concerns remain isolated here:

- Registration ID normalization and primary matching
- CGHS IP lookup first, CGHS OP fallback
- preservation of all distinct Bill No/UHID matches
- explicit `MULTIPLE` and `UNMATCHED` states
- input/output row counts, source traceability, audit notes, and release validation
- no silent overwrite

Existing HFOS settlement code in `CGHS_Billing_Suite_Pro.html` and settlement reports is reference evidence only. It is not imported, duplicated, or invoked by the Phase 2 parser.
