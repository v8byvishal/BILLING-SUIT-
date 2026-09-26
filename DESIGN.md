# Product Design System

CGHS Billing & Enhancement Suite V2 should feel like a professional hospital billing workstation: clear, calm, evidence-oriented, and safe under time pressure. It is not an AI-chat interface, decorative consumer application, or unverified automation console.

For the Phase 1 shell-specific design record, see `docs/DESIGN.md`.

## Phase 1 application shell

The current desktop shell is implemented with vanilla HTML/CSS/JavaScript in:

- `src/ui/index.html`
- `src/ui/renderer.js`
- `src/ui/styles.css`

It uses a left navigation rail and a status-first content area.

Primary sections:

1. **Dashboard** — application, Storage, active bill, enhancement, portal, and final-bill state.
2. **Source Bills** — local source PDF selection and current source metadata.
3. **Enhancement** — existing EnhancementPlan visibility and review summary, without rule changes.
4. **Final Bill** — workspace structure for future final-bill composition, marked not started where unsupported.
5. **Audit / History** — recent session history separate from stored artifacts.
6. **Settings** — non-secret desktop settings.
7. **Diagnostics** — safe technical status collection.

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
| Error | `#a13d3d` | Error status |

Status meaning must always include text and must not rely on color alone.

## Typography

The UI uses native system fonts:

```css
"Segoe UI", Arial, sans-serif
```

Body text is approximately 14px with operational tables using denser 12px text. Text below 11px should be limited to secondary labels and remain legible.

## Interaction rules

- Renderer actions call `window.cghsSuite`; no direct Node, shell, Python, Selenium, or arbitrary filesystem access is permitted.
- Selecting a new source bill starts a new `billSessionId` and clears active transient workspace state.
- Portal readiness remains `NOT VERIFIED` in Phase 1.
- Unsupported capabilities are shown as not started or not enabled; the UI must not fake parser output, portal readiness, final PDFs, metrics, or dashboards.
- Settings changes are persisted, but runtime Storage is not silently switched mid-session.

## Layout guidance

- Preserve the global status strip so operators can always see application, Storage, bill, enhancement, portal, and final-bill state.
- Keep wide evidence tables horizontally scrollable rather than hiding fields.
- Use clear empty states for unsupported or unavailable workflows.
- Keep safe next actions visible, especially source PDF selection, diagnostics, and Storage inspection.
