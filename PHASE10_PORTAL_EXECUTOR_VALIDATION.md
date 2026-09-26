# Phase 10 — Legacy portal executor hardening

## Boundary

`app (1).py` remains the only Selenium/CDP browser executor. The Phase 4 bridge still invokes it. `portal_execution_core.py` is a Selenium-free decision helper for exact matching, reconciliation, bounded retry, checkpoints, and offline testing; it is not another browser engine and contains no EnhancementPlan business rules.

Executable plan statuses are `SOURCE_VERIFIED`, `RULE_VERIFIED`, and `CUSTOM_VALID`. The immutable plan adapter and case workflow continue to exclude blocked/review/invalid/inactive actions and enforce plan freshness, active-case ownership, lock validity, run identity, and recovery-required lifecycle behavior before the bridge starts. A normal legacy batch retains its single CDP attachment. A disconnect is terminal and must not auto-resume.

## Offline validation

Run:

```sh
python -m unittest discover -s tests/python -v
python scripts/portal-executor-benchmark.py
```

The deterministic portal double covers 32 cases including exact/similar/multiple/missing results, stale and timeout recovery, quantity and row evidence, duplicate guards, custom/alias codes, speciality failure, locked-state reconciliation, disconnect/no auto-resume, per-action isolation, checkpoints, metrics, and batch summaries. The logical-time benchmark uses 100 actions, a checked baseline of 1001 ms, and fails above a 10% regression. This benchmark measures orchestration overhead deterministically; correctness assertions always take priority over speed.

## Live operator validation (manual only)

1. Authenticate manually in Chrome; do not provide credentials to the application.
2. Open the intended case and confirm patient/case identity and speciality in the portal.
3. Start Chrome with the approved CDP profile/port, then verify the application reports a safely detected portal context.
4. In Billing Suit, confirm the active case, valid lock owner, approved non-stale plan, run ID, executable-action count, and execution-start checkpoint.
5. Use a small approved batch. For each action compare current code, expected quantity, elapsed time/retries, terminal status, and the actual portal row/quantity.
6. Test one exact pre-existing row and confirm `ALREADY_PRESENT`; do not intentionally create a duplicate in production.
7. If the browser/CDP disconnects, stop. Confirm recovery is required and do not resume automatically. Reconcile portal rows before starting a separately authorized run.
8. Preserve failure diagnostics only where justified; redact patient data before sharing.

Authentication is never automated or stored. Arena has no authenticated portal session, so **LIVE PORTAL VALIDATION = NOT RUN — AUTHENTICATED PORTAL/CDP SESSION REQUIRED**.

## Regression classes

- Offline executor testing: deterministic Python portal double; no Chrome/network.
- Real-PDF regression: uses approved source PDFs only. If absent: `REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE`.
- Live portal validation: manual authenticated operator procedure above; never inferred from offline tests.
