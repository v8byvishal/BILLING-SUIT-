# Project Memory

Read this file first for current state. Product intent is in `PRD.md`, component boundaries in `ARCHITECTURE.md`, binding constraints in `RULES.md`, delivery history in `PHASES.md`, and UI guidance in `DESIGN.md`.

## Current Project Status

- **Current milestone:** Phase 15 source-level Windows release handoff completed; final documentation reconciled.
- **Current branch:** `arena/01a0de46-billing-suit`
- **Implementation baseline HEAD before this documentation reconciliation:** `a64e602fcd02ec7986b12ddd61acaf3d3c1ee506`
- **Pull request:** PR #1, open and unmerged — <https://github.com/v8byvishal/BILLING-SUIT-/pull/1>
- **Product version:** `5.0.0-rc.1`
- **Overall status:** core workflow and release tooling are implemented and offline-tested. The product is **not yet an accepted Windows release candidate** because an actual Windows artifact, Windows runtime, clean-machine, privacy-approved real-PDF, and authenticated live-portal acceptance have not been completed.

Do not start a new feature phase until the pending acceptance work is addressed or separately reprioritized.

## Completed System Capabilities

### Bill ingestion

- Local text-based PDF loading, page extraction, section detection, logical rows, fields, code normalization, compound syntax handling, bed details, aggregation, provenance, and normalized Bill Model.
- Deterministic synthetic regression coverage.
- No OCR or image-only PDF processing.

### Deterministic CGHS planning

- Bundled 1,998-record HFOS-derived reference snapshot behind a rate repository.
- Snapshot remains explicitly `RATE_SOURCE_UNDEFINED`; protected SHA-256 is `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`.
- Deterministic rule modules and versioned `EnhancementPlan` with source/rule evidence and executable, blocked, and review statuses.
- Patient Payable exclusion and explicit unknown/compound/rule-undefined handling.

### Review and custom codes

- Persistent audited Custom Code Registry with create/edit/activate/deactivate, exact search, collision/override handling, optional local rate, revision/hash, and plan-usage tracking.
- Review Queue for unknown, unresolved, malformed, advisory, and validation findings.
- Relevant registry changes enforce `PLAN_STALE`.

### Portal execution

- Phase 4 Portal Adapter and structured Node/Python request contract.
- `app (1).py` remains the sole Selenium/CDP browser executor.
- Exact code-token selection, pre/post duplicate checks, actual row and quantity reconciliation, speciality synchronization, locked-quantity handling, bounded retry, diagnostics, per-action isolation, checkpoints, and timing metrics.
- Packaged runner has explicit helper availability/error handling, timeout, structured stdout/stderr, safe arguments, and no shell.
- Offline portal decision tests pass; authenticated live CGHS acceptance is pending.

### Final bill

- Manual final-PDF selection/intake, SHA-256 identity, deterministic identifier matching, `MATCH_REQUIRED`, final section extraction, Patient Payable exclusion, `CompletedBill`, explicit review resolution, and completed-package storage.
- Discharge remains manual and the application records acknowledgement only.

### Case workflow

- Persistent Case manifests/index, SHA-256 duplicate identity, allowlisted state machine, source archives, artifacts, audit, active-case lock, completed-case immutability, explicit reprocessing, and restart recovery.
- Interrupted portal execution becomes `RECOVERY_REQUIRED`; no automatic resume.
- Initial and Final inboxes retain separate semantics.

### Inbox watcher

- Manual scans and disabled-by-default optional automatic periodic scanning reuse the same `InboxScanner` and Case workflow.
- Explicit watcher lifecycle, deterministic ordering, bounded queue/concurrency, stability checks, duplicate protection, local audit, minimal controls, and clean shutdown.
- Watcher cannot acquire the portal lock, execute Selenium/CDP, change the active Case, or discharge.

### Validation

- Phase 9 reviewed expected-versus-actual validation with discrepancy evidence and human classifications; expected baselines are never auto-generated or auto-fixed.
- Privacy-gated real-PDF harness exists.
- Persistent Phase 12 Production Validation Runs link source hash, parser/plan/registry identity, plan confirmation, portal outcomes, failure categories, timing, notes, final bill, discharge acknowledgement, and completed storage.

### Windows packaging and release

- External versioned user configuration and external Storage boundaries.
- PyInstaller spec for the preserved Python executor and electron-builder Windows x64 portable target.
- Build identity, release manifest, application and Python helper hashes, checksum verification, and resource/version validation.
- One-command Windows handoff: `scripts/build-windows-release.ps1`.
- GitHub Windows workflow uses the same script when the workflow is available from the default branch.
- Detailed developer-machine, protected-directory, update, and clean-machine procedure in `PHASE15_WINDOWS_HANDOFF.md`.
- No real Windows EXE has been built or run in Arena.

## Current Technology Stack

- Electron 31 desktop runtime
- Vanilla HTML, CSS, and JavaScript renderer
- Node.js CommonJS services and `node:test`
- `pdfjs-dist` for Node PDF text ingestion
- Local JSON/JSONL artifacts and case indexes
- Python 3 executor code
- Selenium with Chrome CDP at `127.0.0.1:9222`
- PyMuPDF and PyQt5 retained by the Legacy Python Executor
- PyInstaller one-file helper packaging
- electron-builder Windows portable packaging
- PowerShell release orchestration
- External Windows Documents/AppData persistence

## Critical Architecture Decisions

- The repository evolves in place; no competing application architecture.
- Node owns normalized bills, rules, plans, Cases, validation, final bills, and persistence.
- The existing Python executor is the sole Selenium/CDP owner.
- The Portal Adapter is the boundary between immutable approved plans and browser execution.
- CGHS rules do not live in Selenium.
- Custom codes remain separate from bundled reference data.
- Runtime data and user config live outside the EXE/program directory.
- Initial and final bill histories remain separate and Case-linked.
- Authentication, portal verification, and discharge remain human-controlled.
- Validation reports evidence; it does not auto-fix.
- Settlement remains isolated and unimplemented.

## Current Safety Boundaries / Do-Not-Break Items

- Never guess, fuzzily substitute, or silently add a code/quantity/rate.
- Never treat search or click as portal success; require actual row and quantity evidence.
- Never send blocked, review-required, unresolved, stale, or inactive custom records to Selenium.
- Never allow Patient Payable to enter enhancement or eligible supporting extraction.
- Never auto-resume uncertain portal work.
- Never let the watcher acquire the portal lock or execute portal work.
- Never attach a final bill by filename, recency, arrival order, or patient-name similarity.
- Never automate login or discharge or store credentials/session tokens.
- Never place Cases, bills, custom codes, audit, validation, or config inside packaged program files.
- Never describe source tests as Windows runtime, real-PDF, or live-portal validation.
- Do not modify the protected rate snapshot without explicit source-governance work.

## Current Validation Status

- **Current source baseline:** 303 automated tests passed — 271 JavaScript and 32 Python; 0 failed and 0 skipped at Phase 15 completion.
- JavaScript syntax, Python compilation, `git diff --check`, and `npm audit --omit=dev` passed at that milestone; audit reported 0 vulnerabilities.
- **Real PDF regression:** `NOT RUN — SOURCE PDFs NOT AVAILABLE`.
- **Live portal validation:** `NOT RUN — AUTHENTICATED PORTAL/CDP SESSION REQUIRED`.
- **Windows artifact build:** `NOT RUN — WINDOWS BUILD ENVIRONMENT REQUIRED`.
- **Windows runtime validation:** `NOT RUN`.
- **Clean-machine validation:** `NOT RUN`.
- **Windows release candidate:** `NOT ESTABLISHED`.

## Current Known Limitations

- Text-based PDFs only; OCR/image-only sources are unsupported.
- Bundled rate provenance remains `RATE_SOURCE_UNDEFINED`.
- Parsing/planning have not been accepted against the user's privacy-approved production PDFs in this workspace.
- Portal behavior has not been accepted against an authenticated live CGHS session.
- The Windows portable EXE, embedded helper, external Storage/config behavior, process cleanup, protected-directory operation, and replacement behavior have not been run on Windows.
- Clean-machine independence from Node/Python/source has not been demonstrated.
- GitHub `workflow_dispatch` availability depends on the workflow being present on the default branch.
- No code signing or installer is configured; the intended artifact is portable.

## Current Open Blockers

1. Access to a real Windows x64 build/runtime environment.
2. A clean Windows x64 environment for no-toolchain acceptance.
3. Privacy-approved production PDFs plus reviewed expected fixtures.
4. An authenticated CGHS portal/CDP session and approved test Case.
5. Authoritative CGHS rate-source provenance if the bundled snapshot is to become more than reference-only.

## Recently Completed Work

- **Phase 13:** external config/runtime-path and Windows packaging source hardening.
- **Phase 14:** actual Windows artifact acceptance attempted but correctly stopped because Arena was Linux; no artifact or hash was fabricated.
- **Phase 15:** one-command fail-closed Windows builder, stronger manifest/verifier, CI handoff, acceptance report, and runtime/clean-machine instructions.
- **Documentation reconciliation:** canonical responsibilities restored across PRD, Architecture, Rules, Phases, Design, and Memory.

## Current Next Action

On an actual Windows x64 machine, check out the current branch and run:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows-release.ps1
```

Then follow `PHASE15_WINDOWS_HANDOFF.md`, return the real `WINDOWS_RELEASE_ACCEPTANCE.txt`, artifact and helper SHA-256 values, and Windows/clean-machine observations. Real-PDF and live-portal acceptance remain separate follow-up activities.
