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

Phase 5 adds no UI. Parser hardening appears through the existing plan/audit contract: executable, blocked, review-required, source evidence, and reasons remain inspectable without creating dashboards or unrelated workflow screens. Custom-rate administration, settlement, discharge, final composition, and automatic folder processing remain absent.
