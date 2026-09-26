# Product Requirements Document

## Product name

**CGHS Billing Suite VNEXT**

## Product purpose

CGHS Billing Suite VNEXT is a local Windows desktop application for hospital billing and TPA operators who process CGHS-related bills. It converts a text-based hospital bill PDF into a normalized bill model and deterministic `EnhancementPlan`, supports explicit review, executes only approved actions through the existing CGHS portal automation boundary, verifies actual portal rows and quantities, and preserves the case audit through final-bill extraction and completed storage.

It is a focused billing operations tool, not a general hospital ERP and not an autonomous decision-maker.

## Target users

- **Primary:** hospital billing, TPA, or administrative operators responsible for CGHS bill enhancement and final-bill handling.
- **Secondary:** supervisors and support staff who review discrepancies, custom-code decisions, audit records, and execution failures.

## Problem

The operational workflow requires staff to:

- interpret variable, multi-page hospital bill PDFs;
- identify relevant codes and quantities without adding unsupported codes;
- distinguish primary bill sections from excluded contexts such as Patient Payable;
- enter approved enhancements into a fragile external portal;
- confirm that a click produced the intended portal row and quantity;
- retain evidence when parsing, planning, selection, or verification fails;
- associate a manually obtained final bill with the correct case; and
- keep cases, custom codes, reports, and audit history durable across restarts and application replacement.

The product reduces repetitive work while preserving human control at ambiguous and irreversible boundaries.

## Core product workflow

```text
Initial PDF
  → local text extraction and normalized Bill Model
  → deterministic EnhancementPlan
  → Review Queue / Custom Code Registry checks
  → operator review and explicit confirmation
  → Portal Adapter
  → Legacy Python Executor using Selenium + Chrome CDP
  → actual portal row and quantity verification
  → operator verification
  → manual discharge
  → locally supplied Final PDF
  → deterministic case matching and final-section extraction
  → CompletedBill
  → external Storage and audit
```

### Automated or assisted steps

- Local PDF text extraction and normalized modeling
- Deterministic rule evaluation and `EnhancementPlan` creation
- Review-item and custom-code validation
- Explicitly initiated portal enhancement execution
- Exact portal-option, row, quantity, duplicate, retry, and timing checks
- Initial/final inbox scanning and optional periodic intake
- Final-bill extraction and deterministic association
- Validation reports, diagnostics, and local persistence

### Manual steps

- Starting Chrome with debugging enabled
- CGHS authentication and navigation to the correct case
- Resolving review-required or uncertain records
- Confirming the exact plan before live execution
- Verifying the live portal result
- Performing discharge
- Obtaining and supplying the final bill
- Resolving uncertain final-bill matches
- Running Windows runtime and clean-machine release acceptance

## Core features and current status

| Capability | Current status |
|---|---|
| Text-based PDF ingestion and normalized bill model | Implemented and offline-tested |
| Deterministic CGHS planning and `EnhancementPlan` | Implemented and offline-tested |
| Review Queue and persistent Custom Code Registry | Implemented and offline-tested |
| Phase 4 Portal Adapter and Legacy Python Executor | Implemented and offline-tested; authenticated live acceptance pending |
| Exact portal-state and quantity verification | Implemented in the executor; live acceptance pending |
| Persistent Case workflow, lock, audit, and recovery | Implemented and offline-tested |
| Final-bill association, extraction, and `CompletedBill` storage | Implemented and offline-tested with synthetic fixtures |
| Manual and optional periodic inbox intake | Implemented and offline-tested; automatic mode is off by default |
| Evidence-first and Production Validation Runs | Implemented and offline-tested |
| External Storage and external versioned user configuration | Implemented and offline-tested |
| Windows packaging and one-command release handoff | Source tooling implemented; actual Windows artifact/runtime acceptance not run |

## Product requirements

1. Rules, code quantities, and plan decisions must be deterministic and auditable.
2. Unknown, ambiguous, malformed, or unresolved records must remain blocked or reviewable; they must not be guessed into executable actions.
3. Patient Payable records must remain excluded from enhancement and eligible final supporting extraction.
4. Only exact approved executable actions may reach the Legacy Python Executor.
5. Portal search or click alone is not success. Actual code and quantity evidence is required.
6. Portal retries must be bounded, recorded, and idempotent.
7. The operator must explicitly control plan approval, portal execution, verification, and discharge.
8. Initial and final sources must be attached using hashes and deterministic case evidence, not filename, arrival order, or recency.
9. Runtime data and user configuration must live outside packaged program files.
10. Credentials, patient documents, and session tokens must not be uploaded or stored by release tooling.
11. Application replacement must preserve cases, custom codes, audits, bills, watcher settings, and validation records.
12. Validation findings are evidence only; they must not auto-fix parser output, rules, plans, registries, fixtures, or portal actions.

## Product-level acceptance outcomes

The product meets its intended operational outcome when a privacy-approved real case can demonstrate:

- the exact source hash and parsed content are traceable;
- the reviewed `EnhancementPlan` contains only intended actions;
- blocked and review-required records do not reach Selenium;
- live execution selects only the exact intended portal option;
- actual portal rows and quantities are verified;
- failures are classified at the parser, plan, portal, final-bill, or storage layer;
- manual verification and discharge remain explicit;
- the final bill and `CompletedBill` remain linked to the same Case; and
- external data survives restart and application replacement.

These outcomes are not yet fully proven in production: real-PDF, authenticated live-portal, Windows runtime, and clean-machine acceptance remain pending.

## MVP

The true MVP is:

```text
Real initial bill
  → parse
  → deterministic plan
  → human review
  → explicitly initiated portal execution
  → actual portal verification
  → local audit
```

The current repository extends beyond this MVP with persistent Cases, final-bill processing, optional inbox intake, production validation, and Windows release tooling.

## Out of scope

- General HMS/ERP replacement
- Automatic CGHS login or credential/session-token storage
- Automatic discharge
- Automatic final-bill portal download or upload
- OCR or image-only PDF interpretation
- Autonomous, fuzzy, description-based, or AI code guessing
- Fabricated or inferred CGHS rates
- Settlement, bank matching, or claims reconciliation
- Cloud bill processing, external document upload, or telemetry
- Multi-user distributed locking
- Unattended portal execution

## Future direction

Potential future work is **not implemented** and requires separate approval. It may include OCR for image-only PDFs, authoritative rate-source replacement, or broader operational deployment. Automated discharge, autonomous portal decisions, settlement/reconciliation, and cloud processing are not implied by the current product direction.