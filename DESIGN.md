# Product Design System

CGHS Billing & Enhancement Suite V2 should feel like a professional hospital billing workstation: clear, calm, evidence-oriented, and safe under time pressure. It is not an AI-chat interface, decorative consumer application, or unverified automation console.

For detailed Phase 4 UI behavior, see `docs/DESIGN.md`.

## Current shell behavior

The desktop shell is implemented with vanilla HTML/CSS/JavaScript in:

- `src/ui/index.html`
- `src/ui/renderer.js`
- `src/ui/styles.css`

Phase 4 keeps the existing navigation and adds registry status plus deterministic resolution preview.

Primary sections:

1. **Dashboard** — application state, Storage root, active bill, registry status, resolution summary, portal and final-bill status.
2. **Source Bills** — source PDF selection, persisted source records, parser status, candidates, evidence, and resolution summary.
3. **Enhancement** — Phase 4 resolution preview only; not an executable portal action table.
4. **Final Bill** — workspace structure; no final PDF generation in Phase 4.
5. **Audit / History** — persistent audit records from `Storage/Audit` and safe links to Audit/Failures folders.
6. **Settings** — non-secret settings and Registry status/version/source/hash/rule counts.
7. **Diagnostics** — safe technical status including Storage, parser, registry, and resolution information.

## Resolution preview states

- No source: “Upload a source bill to begin.”
- Parsed without resolution: “No resolution preview available.”
- Validated mapping: `VALIDATED_MAPPING`, with rule id and evidence.
- Direct registry match: `DIRECT_REGISTRY_MATCH`, with registry entry id and authority.
- Review required: `REVIEW_REQUIRED`, with reason and missing/conflicting evidence.
- Conflict: `RULE_CONFLICT`, with conflicts listed in diagnostics/evidence.
- Rejected/no match: `REJECTED` or `NO_MATCH`, never converted to a portal action.

## Candidate evidence display

Source Bills continues to show parser candidate evidence. Enhancement shows resolver evidence and reason. Exact source text snippets may appear for selected candidates, but the UI must not dump full PDF text into diagnostics or audit panels.

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

- Renderer actions call `window.cghsSuite`; no direct Node, shell, Python, Selenium, registry-file, or arbitrary filesystem access is permitted.
- Folder opening is limited to allowlisted Storage folder keys.
- Selecting a source bill persists the file first, parses from the stored immutable copy, and resolves parser candidates through the active registry/rule set.
- Resetting the current bill clears active UI/workflow state only; it never deletes persisted files, parse results, resolution results, audit, failure, registry, or session records.
- Portal readiness remains `NOT VERIFIED` in Phase 4.
- Unsupported capabilities are shown as not started, blocked, or not verified; the UI must not fake parser output, registry authority, portal readiness, final PDFs, metrics, or dashboards.
