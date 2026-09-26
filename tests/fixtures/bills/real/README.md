# Privacy-controlled real bill regression fixtures

Real PDFs are **not committed by default**. A PDF appearing in this directory is not automatically approved.

## Onboarding a reviewed fixture

1. Obtain explicit authorization to use a de-identified/local production bill for regression.
2. Create `real/<fixture-id>/` and place exactly one PDF there locally.
3. Calculate SHA-256 independently (`sha256sum file.pdf`).
4. Copy `expected.template.json` to `<fixture-id>/expected.json`.
5. Record source filename, exact SHA-256, page count, fixture ID, date added, and privacy approval status. Set `privacy_approval_status` to `APPROVED` only when approval is documented outside this repository.
6. Review the existing one-pass parser and EnhancementPlan output. Enter only evidence-backed expectations. `UNKNOWN`, `RULE_UNDEFINED`, and unresolved compound results are valid expectations.
7. Run `npm run test:real-bills`. The harness writes `actual-report.json` beside the local fixture for review.
8. Expected baselines are never generated or updated by the harness. Any expected change is a deliberate developer edit visible in Git diff.

Do not include patient names in fixture IDs, expected files, commit messages, or general logs. Do not add credentials or sensitive external links. Production PDFs require repository-specific privacy approval before commit.

If no eligible local fixtures exist, the harness reports exactly:

`REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE`
