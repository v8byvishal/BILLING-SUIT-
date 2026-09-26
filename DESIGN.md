# Product Design System

CGHS Billing & Enhancement Suite V2 should feel like a professional hospital billing workstation: clear, calm, evidence-oriented, and safe under time pressure. It is not an AI-chat interface, decorative consumer application, or unverified automation console.

For detailed Phase 5 UI behavior, see `docs/DESIGN.md`.

## Current shell behavior

The desktop shell is implemented with vanilla HTML/CSS/JavaScript in:

- `src/ui/index.html`
- `src/ui/renderer.js`
- `src/ui/styles.css`

Phase 5 keeps the existing navigation and adds deterministic `EnhancementPlan` visibility.

Primary sections:

1. **Dashboard** — application state, Storage root, active bill, registry status, plan summary, portal and final-bill status.
2. **Source Bills** — source PDF selection, persisted source records, parser status, candidates, evidence, resolution summary, and plan summary.
3. **Enhancement** — Phase 5 `EnhancementPlan` header/version/hash/readiness plus Actions, Review Required, Excluded, and Diagnostics tables.
4. **Final Bill** — workspace structure; no final PDF generation in Phase 5.
5. **Audit / History** — persistent audit records from `Storage/Audit` and safe links to Audit/Failures folders.
6. **Settings** — non-secret settings and Registry status/version/source/hash/rule counts.
7. **Diagnostics** — safe technical status including Storage, parser, registry, resolution, and plan information.

## Plan display states

- No source: “Upload a source bill to begin.”
- No plan: “No EnhancementPlan has been generated for the current bill.”
- Validated: show action count and `READY_FOR_PORTAL_VALIDATION`, with a clear note that portal execution is not implemented in Phase 5.
- Validated with review: show actions and review queue side by side; unresolved rows remain visible.
- Blocked/invalid/stale: show diagnostics and validation issues without offering portal execution.

## Candidate evidence display

Source Bills continues to show parser candidate evidence. Enhancement shows plan action/review/exclusion evidence and reason codes. Exact source text snippets may appear for selected rows, but the UI must not dump full PDF text into generic diagnostics or audit panels.

## Visual personality

- Professional and operational.
- Evidence-first rather than promotional.
- Explicit about uncertainty, missing data, blocked work, and review-required results.
- Conservative: unresolved status is a valid, safe outcome.

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
| Success/ready | `#23785a` | Ready, active, validated status |
| Warning/review | `#8a6218` | Partial, review-required, no-match, not-verified status |
| Error/conflict | `#a13d3d` | Failed, invalid, rejected, conflict, access-failure status |

Status meaning must always include text and must not rely on color alone.

## Interaction rules

- Renderer actions call `window.cghsSuite`; no direct Node, shell, Python, Selenium, registry-file, plan-file, or arbitrary filesystem access is permitted.
- Folder opening is limited to allowlisted Storage folder keys.
- Selecting a source bill persists the file first, parses from the stored immutable copy, resolves parser candidates through active registry/rule set, and builds a deterministic plan.
- Build/validate/rebuild plan operations use controlled IPC only.
- Resetting the current bill clears active UI/workflow state only; it never deletes persisted files, parse results, resolution results, plans, audit, failure, registry, or session records.
- Portal readiness remains `NOT VERIFIED` in Phase 5.
- Unsupported capabilities are shown as not started, blocked, or not verified; the UI must not fake parser output, registry authority, portal readiness, final PDFs, metrics, or dashboards.
