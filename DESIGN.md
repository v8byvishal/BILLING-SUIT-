# Product Design System

CGHS Billing & Enhancement Suite V2 should feel like a professional hospital billing workstation: clear, calm, evidence-oriented, and safe under time pressure. It is not an AI-chat interface, decorative consumer application, or unverified automation console.

For Phase 3 parser UI specifics, see `docs/DESIGN.md`.

## Current shell behavior

The desktop shell is implemented with vanilla HTML/CSS/JavaScript in:

- `src/ui/index.html`
- `src/ui/renderer.js`
- `src/ui/styles.css`

Phase 3 keeps the existing navigation and adds real parser evidence presentation in the Source Bills workspace.

Primary sections:

1. **Dashboard** — application state, Storage root, Storage health/manifest/write-probe state, active bill, parser summary, enhancement, portal, and final-bill state.
2. **Source Bills** — source PDF selection, persisted source records, parser status, candidate count, warnings, candidate table, and candidate evidence.
3. **Enhancement** — existing plan visibility only when later services create a plan; parser candidates are not executable actions.
4. **Final Bill** — workspace structure and access to `Storage/Final_Bills`; no fake final PDF generation.
5. **Audit / History** — persistent audit records from `Storage/Audit` and safe links to Audit/Failures folders.
6. **Settings** — non-secret settings under `Storage/Config` and actual Storage root display.
7. **Diagnostics** — safe technical status including manifest, recovery, health, and parser/storage information.

## Source Bills UI states

- No PDF: “Upload a source bill to begin.”
- PDF imported/parsing: parser status shows `READING` or current stored status.
- Parsed with candidates: candidate table displays page, section, description, code, quantity, and candidate status.
- Parsed without candidates: “PDF parsed successfully, but no candidate enhancement entries were detected.”
- Failed: “Source PDF could not be parsed.”

The UI must never show parser candidates as executable portal actions.

## Candidate evidence display

Selecting a candidate shows its evidence block, including page number, source section, source text, and line numbers where available. Exact character offsets are shown only if actually produced; Phase 3 does not invent offsets.

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
| Warning/review | `#8a6218` | Review, ambiguous, and not-verified status |
| Error/corrupt/access failure | `#a13d3d` | Error, corrupt, read-only, access-failure, and parse-failure status |

Status meaning must always include text and must not rely on color alone.

## Interaction rules

- Renderer actions call `window.cghsSuite`; no direct Node, shell, Python, Selenium, or arbitrary filesystem access is permitted.
- Folder opening is limited to allowlisted Storage folder keys.
- Selecting a source bill persists the file first, parses from the stored immutable copy, and associates results with one `billSessionId` and `runId`.
- Resetting the current bill clears active UI/workflow state only; it never deletes persisted files, parse results, audit, failure, or session records.
- Portal readiness remains `NOT VERIFIED` in Phase 3.
- Unsupported capabilities are shown as not started or not enabled; the UI must not fake parser output, portal readiness, final PDFs, metrics, or dashboards.
