# CGHS Billing Suite VNEXT — Design Foundation

## Principles

- Professional, calm, readable hospital-workstation presentation
- No neon, gaming, cyber, marketing, analytics, or AI-chat treatment
- Clear distinction between available, blocked, review-required, and planned functionality
- Dense operational interfaces only where their workflow phase is approved
- Accessibility through semantic HTML, visible status text, sufficient contrast, and keyboard-safe native controls

## Current shell

The shell displays product identity, application/Storage/environment readiness, version, resolved Storage path, PDF selection/status, and a compact read-only EnhancementPlan table. The table shows code, quantity, reference/authoritative rate evidence, amount when permitted, derivation source/rule, and categorical status. It visibly labels the bundled rate snapshot `RATE_SOURCE_UNDEFINED`.

The Phase 4 controls provide only portal-action preview, explicit confirmation, execution status, verification counts, and structured audit output. They do not handle credentials or login.

Phase 5 parser hardening appears through the existing plan/audit contract: executable, blocked, review-required, source evidence, and reasons remain inspectable.

Phase 6 adds two compact work areas: an Enhancement Review evidence table with Review/Add Custom/Dismiss actions, and a Custom Code Registry with exact-text search, edit, deactivate/reactivate, and audit controls. Custom overrides are visibly labeled and there is no bulk/automatic approval. Phase 7 adds one compact Final Bill area: manual-discharge confirmation, local PDF selection, exact match status, section/item evidence, explicit match resolution, and completed-package save. It does not control the portal, perform discharge, or upload a bill. Settlement, final composition/printing, and automatic folder processing remain absent.
