# Design — Phase 1 Application Shell

## Design goal

The Phase 1 desktop shell should feel like a safe hospital billing workstation: calm, structured, readable, and explicit about what is ready, blocked, or not verified. It is not an analytics dashboard, AI chat interface, or portal redesign.

## Shell structure

The Phase 1 UI uses a left navigation rail and a status-first work area.

Primary sections:

1. **Dashboard** — operational state, Storage root, active `billSessionId`, current bill, enhancement, portal, and final-bill summary.
2. **Source Bills** — source PDF selection, current source metadata, active session identity, and Source_Bills access.
3. **Enhancement** — current plan visibility when produced by existing services, review summary, and plan diagnostics.
4. **Final Bill** — structured placeholders for source, extracted sections, editable metadata, preview, validation, and output status.
5. **Audit / History** — recent in-memory Phase 1 history records separate from stored artifacts.
6. **Settings** — non-secret settings persistence, Storage path display/input, logging level, diagnostics flag, and Config folder access.
7. **Diagnostics** — safe runtime report collection and diagnostics folder access.

## Visual system

The current shell is implemented in `src/ui/styles.css` with native Windows-friendly typography and a light professional palette:

| Role | Token |
|---|---|
| Background | `#eef2f5` |
| Sidebar | `#17324a` |
| Active sidebar / hover | `#22465f` |
| Surface | `#ffffff` |
| Soft surface | `#f7f9fb` |
| Primary text | `#17212b` |
| Muted text | `#65717d` |
| Border | `#d9e1e8` |
| Primary action | `#215a86` |
| Success | `#23785a` |
| Warning / review | `#8a6218` |
| Error | `#a13d3d` |

Status meaning must always be conveyed with text, not color alone.

## Interaction rules

- Renderer actions call `window.cghsSuite`; the UI does not access Node, Python, shell, or unrestricted filesystem APIs.
- Selecting a new source bill intentionally clears active transient workspace state and starts a new `billSessionId`.
- Portal readiness remains `NOT VERIFIED` unless a later authenticated preflight validates it.
- Unsupported Phase 2/3 capabilities are displayed as not started or not enabled; the UI must not fake output.
- Settings changes are persisted, but the active runtime Storage location is not silently swapped mid-session.

## Copy principles

- Prefer operational language: “No source bill loaded”, “Portal readiness has not been verified”, “No final PDF has been generated”.
- Do not present guessed parser output, invented CGHS code decisions, or unverified portal readiness.
- Make safe next actions obvious, especially source PDF selection, diagnostics, and Storage inspection.

## Accessibility and desktop behavior

- Native font stack: `Segoe UI`, Arial, sans-serif.
- Keyboard focus styles are visible on buttons and form controls.
- The layout collapses to single-column sections on narrower windows.
- Tables retain horizontal scrolling rather than hiding evidence fields.
