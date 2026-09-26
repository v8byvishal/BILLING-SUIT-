# Phase 12 — Controlled local production acceptance

Production validation runs are case-linked JSON artifacts under `Cases/<case>/validation/production/`. They preserve source SHA-256, parser/plan/registry identity, Phase 9 discrepancies, explicit plan confirmation, portal results, failure categories, timing analysis, notes, final-bill linkage, and CompletedBill storage linkage. Findings and notes never modify parser rules, plans, registries, fixtures, or portal actions.

## Complete operator procedure

1. Start Chrome with the approved debugging configuration.
2. Log into CGHS manually; the application never handles credentials.
3. Open and visually verify the correct patient/case and portal page.
4. Start Billing Suit.
5. Load a privacy-approved initial PDF into its persistent case.
6. Select its reviewed `expected.json` and run PDF validation. Confirm the displayed SHA-256, page count, parser version, and discrepancies.
7. Review the immutable EnhancementPlan by executable, blocked, review-required, and custom status, including source page/section and reason.
8. Explicitly confirm the reviewed plan. Resolve review findings rather than bypassing them.
9. Reconfirm the live pre-flight checklist and explicitly approve execution. The existing Phase 4/10 executor remains the only browser executor.
10. Compare every action's expected/actual quantity, status, verification, retries, and duration with the live portal. Inspect stage-specific diagnostics for failures.
11. Explicitly perform human portal verification. The software does not infer this.
12. Discharge manually and record the existing explicit manual acknowledgement. No discharge action is automated.
13. Obtain the final PDF manually and load it.
14. Run the existing Phase 7 extraction and deterministic case matching.
15. Review pharmacy, consumables, Patient Payable exclusions, and discrepancies.
16. Resolve `MATCH_REQUIRED` or review records explicitly.
17. Save the Completed Bill through the existing storage workflow.
18. Inspect the case audit, production validation JSON, execution audit, and saved package.

## Acceptance record

Record these operator decisions in the run notes/export:

- PDF parsing: PASS / FAIL / REVIEW
- EnhancementPlan: PASS / FAIL / REVIEW
- Portal execution: PASS / FAIL / REVIEW / NOT RUN
- Portal verification: PASS / FAIL / REVIEW / NOT RUN
- Manual discharge: CONFIRMED / NOT CONFIRMED
- Final bill: PASS / FAIL / REVIEW / NOT RUN
- Completed storage: PASS / FAIL / NOT RUN
- Overall: PASS / FAIL / REVIEW

## Boundaries

Selector diagnostics distinguish no result, no exact match, selection failure, missing row, and quantity mismatch. Parser, plan, portal, final-bill, and storage evidence remain separate. Interruption never creates success and requires recovery review. No automatic login, discharge, portal file transfer, OCR, telemetry, cloud upload, settlement, fuzzy match, AI guess, or auto-fix exists.

`REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE`

`LIVE PORTAL VALIDATION = NOT RUN — AUTHENTICATED PORTAL/CDP SESSION REQUIRED`
