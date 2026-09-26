# CGHS Billing Suite VNEXT — Design Foundation

Phase 3 provides a minimal local bill-selection, parse-status, and deterministic plan-inspection screen.

## Principles

- Professional, calm, readable hospital-workstation presentation
- No neon, gaming, cyber, marketing, analytics, or AI-chat treatment
- Clear distinction between available and planned functionality
- Dense operational interfaces may be introduced only when their workflow phase is approved
- Accessibility through semantic HTML, visible status text, sufficient contrast, and keyboard-safe native controls

## Current shell

The shell displays product identity, application/Storage/environment readiness, version, resolved Storage path, PDF selection/status, and a compact read-only EnhancementPlan table. The table shows code, quantity, reference/authoritative rate evidence, amount when permitted, derivation source/rule, and categorical status. It visibly labels the bundled rate snapshot `RATE_SOURCE_UNDEFINED`.

It contains no portal controls, custom-rate administration, settlement workflow, or fake completed enhancement. Detailed workflow screens, typography, and final bill presentation remain later design work governed by `PRD.md`.
