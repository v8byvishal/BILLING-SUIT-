# Delivery Roadmap

This file summarizes delivery order and status. Product scope is in `PRD.md`; current implementation and blockers are in `MEMORY.md`.

| Phase | Objective | Status | Key outcome / limitation |
|---:|---|---|---|
| 0 | Audit the inherited repository and freeze product intent | Complete | Established controlled evolution, safety boundaries, and documentation baseline. |
| 1 | Create the Electron foundation, external Storage, configuration, logging, and test structure | Complete | Local desktop shell and external writable data boundary established. |
| 2 | Implement text-based bill ingestion and normalized Bill Model | Complete | Deterministic page/section/row parsing implemented; OCR and real-PDF acceptance remain outside this result. |
| 3 | Implement rate repository abstraction, deterministic CGHS rules, and `EnhancementPlan` | Complete with limitation | Planning and provenance implemented; bundled reference source remains `RATE_SOURCE_UNDEFINED`. |
| 4 | Integrate the existing portal executor through a narrow adapter | Complete with limitation | Node-to-Python contract and Legacy Python Executor preserved; authenticated live acceptance remains pending. |
| 5 | Harden parser behavior and synthetic PDF regression coverage | Complete with limitation | Deterministic parser regression expanded; privacy-approved real PDFs were unavailable. |
| 6 | Add Review Queue and persistent Custom Code Registry | Complete | Explicit local records, audit, activation, collision handling, revision/hash, and `PLAN_STALE` checks implemented. |
| 7 | Add final-bill association, extraction, `CompletedBill`, and storage | Complete with limitation | Deterministic synthetic coverage implemented; final bill remains manually obtained and real-PDF acceptance is pending. |
| 8 | Add persistent one-bill Case workflow, locking, inbox scanning, and recovery | Complete | SHA-256 identity, state machine, active-case lock, archive behavior, and `RECOVERY_REQUIRED` implemented. |
| 9 | Add evidence-first expected-versus-actual validation and real-PDF harness | Complete with limitation | Discrepancy reports and privacy-gated harness implemented; source production PDFs unavailable. |
| 10 | Harden the existing Selenium/CDP executor | Complete with limitation | Exact matching, row/quantity reconciliation, bounded recovery, metrics, checkpoints, and offline executor tests implemented; live portal acceptance pending. |
| 11 | Add optional automatic periodic inbox intake | Complete | Disabled-by-default `InboxWatcher`, bounded queue, audit, Initial/Final separation, and minimal controls implemented. |
| 12 | Add controlled Production Validation Runs and local acceptance evidence | Complete with limitation | Source/plan/portal/final/storage traceability and handoff procedure implemented; real and live acceptance pending. |
| 13 | Harden Windows packaging, external configuration, and release integrity | Complete at source level | PyInstaller/Electron pipeline, runtime paths, manifests, checksums, and data-preservation tests implemented; no Windows artifact built in Arena. |
| 14 | Build and validate the actual Windows artifact | **Blocked / not run** | Arena was Linux. No EXE, Windows runtime, or clean-machine result was claimed. |
| 15 | Provide one-command Windows release orchestration and acceptance handoff | Complete at source level | Fail-closed PowerShell builder, CI handoff, executor hash, release verification, report generation, and runtime/clean-machine instructions implemented. |

## Current roadmap position

Development through the Phase 15 source handoff is complete. The next action is operational acceptance, not a new feature phase:

1. Run `scripts/build-windows-release.ps1` on a clean Windows x64 checkout.
2. Verify the actual artifact, manifest, and hashes.
3. Perform Windows developer-machine and clean-machine acceptance from `PHASE15_WINDOWS_HANDOFF.md`.
4. Separately perform privacy-approved real-PDF and authenticated live-portal validation when those environments are available.

## Not started / not committed as phases

The following are not implemented and have no approved detailed phase plan:

- OCR or image-only PDF processing
- Automated discharge
- Automatic portal final-bill download/upload
- Settlement or claims reconciliation
- Autonomous code decisions or AI guessing
- Cloud processing
- Multi-user distributed locking

No new phase should begin without explicit product scope and acceptance criteria.