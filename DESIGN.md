# Product Design System

CGHS Billing & Enhancement Suite V2 should feel like a professional hospital billing workstation: clear, calm, evidence-oriented, and safe under time pressure. It is not an AI-chat interface, decorative consumer application, or unverified automation console.

For the Phase 2 shell-specific design record, see `docs/DESIGN.md`.

## Current shell behavior

The desktop shell is implemented with vanilla HTML/CSS/JavaScript in:

- `src/ui/index.html`
- `src/ui/renderer.js`
- `src/ui/styles.css`

Phase 2 keeps the Phase 1 navigation and adds real external Storage visibility.

Primary sections:

1. **Dashboard** — application state, Storage root, Storage health/manifest/write-probe state, active bill, enhancement, portal, and final-bill state.
2. **Source Bills** — local source PDF selection, current source metadata, and persisted source-bill records loaded from `Storage/Source_Bills`.
3. **Enhancement** — existing EnhancementPlan visibility and review summary, without rule changes.
4. **Final Bill** — workspace structure and access to `Storage/Final_Bills`; storage mechanism only, no fake final PDF generation.
5. **Audit / History** — persistent audit records from `Storage/Audit` and safe links to Audit/Failures folders.
6. **Settings** — non-secret settings under `Storage/Config` and actual Storage root display.
7. **Diagnostics** — safe technical status including manifest, recovery, health, and usage information.

## Visual personality

- Professional and operational.
- Low-noise and readable at Windows desktop distances.
- Explicit about uncertainty, missing data, blocked work, and manual responsibility.
- Evidence-first rather than promotional.

## Current theme tokens

| Role | Value | Use |
|---|---|---|
| Application background | `#eef2f5` | Main desktop canvas |
| Sidebar | `#17324a` | Navigation rail |
| Sidebar active/hover | `#22465f` | Active navigation |
| Surface | `#ffffff` | Panels, cards, tables |
| Soft surface | `#f7f9fb` | Nested cards and notices |
| Primary text | `#17212b` | Headings and body |
| Secondary text | `#65717d` | Labels and supporting copy |
| Border/divider | `#d9e1e8` | Panel and table structure |
| Primary action | `#215a86` | Main actions |
| Primary hover | `#174665` | Main-action hover |
| Success/ready | `#23785a` | Ready/success status |
| Warning/review | `#8a6218` | Review and not-verified status |
| Error/corrupt/access failure | `#a13d3d` | Error, corrupt, read-only, and access-failure status |

Status meaning must always include text and must not rely on color alone.

## Interaction rules

- Renderer actions call `window.cghsSuite`; no direct Node, shell, Python, Selenium, or arbitrary filesystem access is permitted.
- Folder opening is limited to allowlisted Storage folder keys.
- Selecting a new source bill persists source metadata/file first, starts a durable `billSessionId`, and clears active transient workspace state.
- Resetting the current bill clears active UI/workflow state only; it never deletes persisted files, audit, failure, or session records.
- Portal readiness remains `NOT VERIFIED` in Phase 2.
- Unsupported capabilities are shown as not started or not enabled; the UI must not fake parser output, portal readiness, final PDFs, metrics, or dashboards.
- Settings changes are persisted as non-secret configuration; runtime Storage is not silently switched mid-session.

## Layout guidance

- Preserve the global status strip so operators can always see application, Storage, bill, enhancement, portal, and final-bill state.
- Keep persisted source and audit tables horizontally scrollable rather than hiding evidence fields.
- Use clear empty states for unsupported or unavailable workflows.
- Keep safe next actions visible, especially source PDF selection, diagnostics, and Storage inspection.
