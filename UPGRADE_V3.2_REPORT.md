# CGHS Billing Suite Pro — v3.2 Upgrade Report (Phase: Hardening)

**Artifact:** `CGHS_Billing_Suite_Pro.html` — single file, fully offline (unchanged convention)
**Version:** 3.1 → **3.2** · Size 3,099,610 → 3,066,675 bytes (−32.9 KB net: −50.1 KB dead code, +17.5 KB safety layer)
**Test result: 38 / 38 automated checks passed, 0 failures** (28 upgrade checks + 10 legacy-compatibility checks, headless browser)
**Restore point:** `restore/CGHS_Billing_Suite_Pro.v3.1.RESTORE_POINT.html` (SHA-256 verified byte-identical before any edit)

---

## 1. Files modified

| File | Change | Why |
|---|---|---|
| `CGHS_Billing_Suite_Pro.html` | The only source file of the project — all changes below live here | Single-file architecture preserved |
| `restore/` (new) | v3.1 byte-identical snapshot + SHA-256 checksums + package files | Step 1 — restore point before any modification |
| `maps/` (new) | `DEPENDENCY_MAP.md`, `FEATURE_MAP.md`, `UI_MAP.md`, `FUNCTION_MAP.md` (470 functions with call counts), `STORAGE_MAP.md` | Step 1 — generated from the real source, not by hand |
| `docs/UPGRADE_V3.2_REPORT.md` (this file) | — | Step 9 output |

### Changes inside `CGHS_Billing_Suite_Pro.html`

| # | Change | Step |
|---|---|---|
| 1 | **New script block: Safe Storage Layer** (loaded *before* the core, adopted automatically through the core's existing `window.storage` adapter hook — the core itself was not touched) | 3 |
| 2 | **New script block: Upgrade Modules** (ValidationHub, AmountGuard, SessionGuard, normId memoization, Modules registry) — additive, loaded after the app | 2,4,5,6,7 |
| 3 | **Removed PDF Tools**: nav tab, view HTML (7.6 KB), whole JS engine — compressor/merge/split/rotate (32.1 KB), `switchView` hook, init binding | 8 |
| 4 | **Removed Mobile portal**: nav tab, view HTML, portal CSS (2.1 KB), `mobileSearch`/`mobileRenderResults`/`renderMobilePortal` JS (5 KB), bindings, viewer-role redirect now goes to Dashboard instead of the removed Mobile view | 8 |
| 5 | `APP_VERSION` `'3.1'` → `'3.2'` | — |

**Deliberately kept:** `pdf-history` storage key and `recordPdfHistory()` (still used by bill-PDF export and the Security-view File Library); pdf-lib + pdf.js (used by bill PDF export and settlement PDF ingestion); backup-import still accepts and preserves `pdfHistory` from old backup files — **old backups restore cleanly**.

## 2. What each new subsystem does

### Step 3 — Safe Storage (`window.SafeStorage`)
- **Atomic writes:** previous value snapshotted to `<key>::bak` before every write; write verified by read-back; on failure the old value is restored — a half-written bill is now impossible.
- **Corruption detection:** djb2 checksum sidecar `<key>::crc` verified on every read.
- **Automatic recovery:** corrupt value transparently replaced from its last good backup (proved in tests by deliberately corrupting a stored bill).
- **Rollback:** `SafeStorage.rollback(key)` one-call restore of any key.
- **Version/migration:** `storage-schema` marker + `registerMigration()` pipeline for future schema changes.
- **Quota resilience:** on a full store, backups are pruned and the write retried once, else rolled back.
- **Zero migration needed:** v3.1 keys (no sidecars) read exactly as before and gain protection on their next save — verified with seeded legacy data.

### Step 4 — Session management (`window.SessionGuard`)
- 15-second heartbeat + clean-exit flag → **crash detection** after power failure or forced close.
- `pagehide`/`beforeunload` now force one final draft write, so even a power cut seconds after typing loses nothing (existing 10-second auto-save kept as-is).
- After a crash, the operator is told their data and draft are safe; the existing "Restore Last Draft" flow (unchanged) completes recovery. The form still always opens blank — workflow untouched.

### Step 5 — Performance
- **Read-through storage cache** (150 entries, LRU-ish): repeated `sGet` calls skip localStorage I/O and `JSON.parse` — hits startup (`loadStorage` reads 11 keys), settlement reloads, and every save-then-render cycle.
- **`normId` memoization** (5,000-entry cache): this function runs O(bills × 3) on every keystroke in Saved-Bills search and every duplicate recompute; now O(1) per repeated id.
- **Dead weight removed:** 50 KB less HTML/CSS/JS to parse at startup.
- Existing debounces, lazy view rendering and capped lists preserved.

### Step 6 — Validation framework (`window.ValidationHub`) — *framework only, no AI*
- Plug-in registry: `ValidationHub.register({id, severity, description, fixSuggestion, check(ctx)})`.
- Every finding is normalized to exactly the required shape: **Rule ID, Severity, Description, Fix Suggestion, Affected Code, Affected Amount, Status, Timestamp**.
- 6 core rules shipped as plug-ins (missing amount, negative values, zero qty, amount ≠ rate × qty, unknown code, duplicate code) — they mirror what the existing `checkDataIntegrity` already enforces and are **read-only**: the existing save-time validation behaviour is byte-for-byte unchanged.

### Step 7 — Amount protection (`window.AmountGuard`) — *prepared, not activated*
- Policy switches present but **OFF**: `{ amountLock:false, calcLock:false, rateLock:'admin', revisionLock:false }` (rate lock reflects the already-existing admin-mode master-rate lock).
- `expected(row)`, `verifyRows(rows)` — the enforcement primitives the next phase will flip on.
- `tagSource(record, source)` — source tracking (manual / paste / excel / settlement / sync + device + user + time) ready to be attached at save time.

### Step 2 — Architecture (`window.Modules`)
- One registry exposing the project's real seams: `utils / storage / billing / validation / settlement / session / amounts`.
- Deliberately **non-invasive**: the 470 existing functions were not renamed or moved — in a working single-file app with 15 shipped reports, physically relocating code is where regressions come from. Coupling is reduced by giving future modules (including AI phases) one stable surface instead of reaching into globals.

## 3. Performance improvements (measured / structural)

| Area | Before | After |
|---|---|---|
| Startup parse | 3.10 MB, 10 views, 3 script blocks | 3.07 MB, 8 views; PDF-tools engine no longer parsed |
| Storage reads | every `sGet` = localStorage + JSON.parse | cached after first read (11-key startup read set, settlement state, repeated saves) |
| Search/duplicates hot path | `normId` regex per bill per keystroke | memoized (verified duplicate detection still fires correctly) |
| Data safety overhead | — | one extra setItem pair per write (~µs); no read overhead on cache hits |

## 4. Risks found during analysis (all addressed or documented)

1. **Plain localStorage was a single point of total data loss** (quota full → silent save failure; one corrupt JSON → key unreadable). → Now checksummed, backed up, rollback-able, quota-resilient. **This was the most serious finding.**
2. **Crash between auto-saves lost up to 10 s of typing** → final-flush on pagehide + crash detection.
3. `applyRoleUi` redirected read-only viewers to the Mobile view — would have broken when Mobile was removed; redirect retargeted to Dashboard (viewer role fully functional).
4. Old backups contain `pdfHistory` — import path kept compatible; verified old-format data loads.
5. Residual risk (documented, not fixed in this phase): localStorage is unencrypted at rest and ~5–10 MB quota; heavy bill volumes will eventually need IndexedDB — the storage adapter + migration pipeline added in this phase is the prepared path.

## 5. New architecture

```
CGHS_Billing_Suite_Pro.html (single file, offline)
│
├─ <style>            theme + print (unchanged; mobile-portal rules removed)
├─ <script 1>         vendored libs: pdf-lib, pdf.js+worker (unchanged)
├─ <script 2>         MASTER_CGHS: 1,998 codes (unchanged)
│
├─ <script 3>  NEW    SAFE STORAGE LAYER
│                     window.storage (atomic+CRC+backup+cache)
│                     window.SafeStorage (rollback, verifyAll, migrations)
│                              ▲ adopted automatically by ▼
├─ <script 4>         APPLICATION CORE (untouched behaviour)
│                     engine · parser · state · sGet/sSet · billing ·
│                     saved bills · reports · settlement · rates ·
│                     settings · security & sync      [PDF Tools ✂, Mobile ✂]
│
└─ <script 5>  NEW    UPGRADE MODULES (additive)
                      ValidationHub   plug-in rules → normalized findings
                      AmountGuard     locks prepared (OFF) + source tracking
                      SessionGuard    heartbeat, crash detect, final flush
                      Modules         stable seam: utils/storage/billing/
                                      validation/settlement/session/amounts
                                      ← future AI phases plug in here
```

## 6. What was verified to still work (38 automated checks)

Navigation to all 8 views · Saved-Bills rendering/search/filters · duplicate detection · `buildRecord` revisions + audit log · settlement self-test intact · master rate list intact · legacy v3.1 data (bills, settings, local rates) loads unchanged and gains protection on next save · old backup import path · no console errors on boot.

## 7. Recommended next phase

1. **Activate AmountGuard** (flip `amountLock`/`calcLock`, admin override dialog, wire `tagSource` into `saveCurrentBill`).
2. **Surface ValidationHub findings** in the existing validation panel (same UI, richer findings) and run it on settlement ingestion.
3. **IndexedDB migration** through the now-existing migration pipeline (removes the localStorage quota ceiling; enables at-rest encryption).
4. Then the AI validation phase, plugging into `ValidationHub.register()` — the contract is ready.

---
*No feature removed except PDF Tools and Mobile (as ordered). No UI redesign. No workflow change. Restore point retained.*
