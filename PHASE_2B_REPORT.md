# CGHS Billing Suite Pro — Phase 2B Completion Report

**Deliverable:** `CGHS_Billing_Suite_Pro.html` (2.48 MB, single file, 100% offline)
**Version:** 3.1 · **Date:** 27 Jul 2026
**Test result:** **173 / 173 automated checks passed, 0 failures**
(99 Phase-2A checks + 74 Phase-2B checks, run in headless Chrome)

---

## 1. CGHS Code Priority Order ✅

`CC001 → WC001 → CN002` are forced to the top, in that fixed order; every other
code keeps its original relative sequence below them.

| Surface | Status | How it is enforced |
|---|---|---|
| Bill Preview (on-screen grid) | ✅ | `getComputedRows()` runs `applyPriorityOrder()` |
| PDF Output | ✅ | `orderedRowsOf(rec)` re-sorts before drawing |
| Print Output | ✅ | `renderPrintableBill()` uses `orderedRowsOf()` |
| Saved Bills | ✅ | `buildRecord()` stores `rawRows` already ordered |
| Bill Details modal | ✅ | `showBillPreview()` uses `orderedRowsOf()` |
| **Legacy bills** (saved before the rule) | ✅ | Re-ordered on open *and* on every output |

- Editing the row order in the grid maps back to the correct source row
  (`data-src` index), so ordering never corrupts edits.
- Rule can be switched off in **Settings → General** (`enforcePriority`).

## 2. Amount Validation Engine ✅

**`Total Amount = Rate × Quantity`** — always derived, never typed.

- `calcAmount(rate, qty)` is the single source of truth.
- The Total column renders as **plain text, no input element** → direct editing
  is physically impossible (verified: 0 inputs in the amount cell).
- Changing rate *or* quantity re-renders and recalculates instantly.
- The portal's own "Total Amount" is used **only as a cross-check**; a
  disagreement raises `AMOUNT MISMATCH` but never overrides the computed figure.
- A new `CALC ERROR` status catches any internal drift (self-check to 0.009).
- **Live validation panel** above the bill turns green when clean, amber/red
  with a bullet list the moment something is wrong.
- Saving an incorrect bill is blocked by a modal listing every problem.

## 3. Master Rate System ✅

- Rates auto-fill from the embedded **1,998-code CGHS master database**.
- **Rate Lock** (default ON): master-code rates render as `₹350 🔒` — a padlock,
  not an input. There is no UI path to change them.
- Master rate always wins over any local-rate entry (back-door tampering proven
  ineffective in tests).
- **Admin Mode** (Settings → Admin & Rates, default PIN `2580`, changeable):
  unlocks editing, adds an *Approved Master Rate Overrides* table showing
  original vs approved rate. Overrides persist in `rate-overrides` storage.
- Admin Mode **always resets to OFF on reload** (safe default).
- New bills automatically pick up approved rates — consistency across all bills.

## 4. Duplicate Entry Detection ✅

Triggered when the same CGHS code is entered twice (typed, pasted, or on save):

> **"Duplicate CGHS Code Detected"**
> 1. Merge Quantities  2. Keep Separate Entries  3. Edit Existing Entry

- The dialog shows a side-by-side table: existing qty, new qty, and the merged
  result with its recalculated amount.
- **Merge** sums quantities and recomputes the total (2 + 3 = 5 → ₹1,350 ✓).
- **Keep Separate** leaves both lines untouched.
- **Edit Existing** removes the new line and focuses the original's qty box.
- `reviewDuplicateCodes()` also sweeps the whole grid before every save.

## 5. Edit Bill System ✅

1. **Search** — Saved Bills tab (name / BPLIP / bill no / code / amount / date)
   plus a Quick Search panel on the Dashboard.
2. **Open** — `Edit` button loads the bill back into the billing form.
3. **Modify** — quantity, date, time, patient details and CGHS entries all editable.
4. **Save** — updates the same record; **never** creates a duplicate.
5. **History** — `originalRef` (permanent bill reference), `revision` counter,
   and an `auditLog` with a human-readable diff, e.g.
   `Qty CN002: 2 → 6; D.O.D: "06/07/2026 04:00 PM" → "09/07/2026 06:30 PM"; Patient: ... | Total 970.00 → 2460.00`
   Audit history is viewable in the Bill Details modal.
6. **Data-loss protection** — a *Stay Here / Save First / Discard Changes*
   prompt guards tab switches and edits; `beforeunload` guards tab close.

## 6. Data Integrity Rules ✅

`checkDataIntegrity()` runs on every render and every save:

| # | Rule | Enforcement |
|---|---|---|
| 1 | Code must never mismatch description | Hard error, names the expected text |
| 2 | Rate must match the selected code | Hard error; master rate 0 also rejected |
| 3 | Quantity cannot be negative | Coerced to 0 + toast; hard error until fixed |
| 4 | Empty entries cannot be saved | Hard error listing the row numbers |
| 5 | Invalid values show validation errors | Live panel + blocking modal |
| 6 | Audit-friendly consistency | Repeated codes warned; unknown codes blocked |

## 7. Phase 2A — preserved and **improved**

Layout was re-verified by **rasterising the PDF at 100 dpi and counting ink
pixels** inside each reserved band:

```
page 1: TOP 60mm=0  BOTTOM 20mm=0  LEFT 12mm=0  RIGHT 12mm=0   CLEAN
page 2: TOP 60mm=0  BOTTOM 20mm=0  LEFT 12mm=0  RIGHT 12mm=0   CLEAN
page 3: TOP 60mm=0  BOTTOM 20mm=0  LEFT 12mm=0  RIGHT 12mm=0   CLEAN
```

> **Bug found and fixed during this phase:** `hline()` drew rules *upward*, so
> the repeated table header's top border overshot the reserve by 0.6 pt on
> continuation pages (733 stray ink pixels on pages 2–3). Rules now draw
> downward and `drawTableHead()` clamps to the boundary. Pages 2–3 are now
> provably clean.

Also confirmed unchanged: A4 595.28 × 841.89 pt, monochrome (only `0 0 0 rg`
colour operators in the whole document), no logos/branding, no cut-off rows.

---

## Modified files

The deliverable is one self-contained HTML file, assembled from these sources
(`/home/user/work/`):

| File | Lines | Phase 2B changes |
|---|---|---|
| `src/js/01-core.js` | 777 | `checkDataIntegrity()`, `calcAmount()`, `applyPriorityOrder()`, `priorityRank()`, `masterRateOf()`, `isRateLocked()`, integrity hook in `verifyBill()` |
| `src/js/03-pdf-print.js` | 713 | `orderedRowsOf()`, **`hline()` direction fix**, `drawTableHead()` clamp |
| `src/js/04-bills.js` | 746 | `handleDuplicateCodeEntry()`, `reviewDuplicateCodes()`, `renderValidationPanel()`, `diffAgainst()`, audit trail in `buildRecord()`, `confirmDiscardChanges()` + fingerprinting, qty guard, priority-aware row mapping |
| `src/js/05-search-dashboard.js` | 455 | Dashboard quick search (bill no / patient / CGHS code / date range) |
| `src/js/06-pdftools.js` | 606 | Rotate PDF tool |
| `src/js/07-excel-backup.js` | 856 | Excel/CSV import (`parseXlsxFile`, `importBillsFromSheet`) |
| `src/js/08-app.js` | 697 | Admin Mode UI, About pane, mm margin controls, `beforeunload` guard, new export buttons |
| `src/body.html` | 717 | Validation panel, Admin & Rates + About tabs, mm margin sliders, Rotate pane, import UI |
| `src/app.css` | 591 | Priority badge, rate padlock, read-only amount cell, `val-ok` banner |
| `assemble.py` | — | Build script → `CGHS_Billing_Suite_Pro.html` |

Test suites: `test2.js` (99 checks), `test2b.js` (74 checks).

---

## Known limitations

1. **Save As dialog** — the true "choose folder" picker needs the File System
   Access API (Chrome/Edge). Firefox/Safari fall back to a normal download.
2. **Admin PIN** is a workflow guard, not cryptographic security; anyone with
   devtools access to the machine can bypass it. It prevents *accidental* edits.
3. **Compression of vector PDFs** — bills already generated by this app are
   near-minimal; large reductions only occur on scanned/image-heavy PDFs.
   Reaching a 1 MB target on a very large scan rasterises pages (text stays
   readable but is no longer selectable).
4. **Excel import** creates summary-level records (patient, bill no, BPLIP,
   amount, date) — line-item detail cannot be reconstructed from a 5-column sheet.
5. **PDF fonts** are the WinAnsi standard set, so Devanagari/regional scripts are
   transliterated or dropped in the PDF (the on-screen UI displays them fine).
6. **Priority rule** covers exactly `CC001`, `WC001`, `CN002` as specified;
   adding more codes currently needs a one-line edit to `PRIORITY_CODES`.
7. **`beforeunload` prompt** wording is fixed by the browser and cannot be
   customised.
