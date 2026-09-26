# CGHS Billing Suite Pro — Advanced Settlement, UTR Automation & Claim Management

**Deliverable:** `CGHS_Billing_Suite_Pro.html` (2.62 MB, single file, 100% offline)
**Version:** 3.1 · **Date:** 27 Jul 2026

## Test Results — 510 / 510 passed, 0 failures

| Suite | Scope | Result |
|---|---|---|
| `test5.js` | Advanced settlement (this phase) | **153 / 153** |
| `test4.js` | Settlement module baseline | **98 / 98** |
| `test3.js` | UI & workflow phase | **86 / 86** |
| `test2.js` | Phase 2A — letterhead, PDF, tools | **99 / 99** |
| `test2b.js` | Phase 2B — billing logic, validation | **74 / 74** |

Run in headless Chrome against **real multi-sheet `.xlsx` fixtures** built with
`openpyxl`. Every exported workbook was re-opened with an external parser and its
**cell fill colours inspected** to confirm the colour-coding survives into Excel.

---

## Features Added

### Multi-sheet support
`parseXlsxWorkbook()` — a new reader that walks `workbook.xml` + rels to recover
**every sheet in workbook order** (the previous reader only ever read `sheet1`).
Three modes, exactly as specified:

| Mode | Behaviour (verified) |
|---|---|
| Process Current Sheet | Dropdown picks one sheet → 2 rows |
| Process Selected Sheets | Checkboxes, April+May → 4 rows |
| Process Entire Workbook | All 4 usable sheets → 8 rows |

A `Notes` sheet with no claim column is skipped gracefully with a warning, not an
error. Every row is tagged with its source sheet, which flows into the filters and
the Updated Tracker export.

### Claim number normalization
A documented pipeline applied identically to tracker and portal values before an
**exact** comparison. All 13 cases pass:

text · numeric cell · leading spaces · trailing spaces · both sides ·
NBSP + zero-width · scientific notation (`2.026e+15`) · trailing `.0` ·
thousands separators · Excel text-marker quote · internal hyphens ·
UTR case-folding · blank/null safety

### Auto extraction & smart columns
Matched claims now pull **UTR Number, Settlement Date and Settlement Amount**.
Missing columns are created automatically: UTR Number, Settlement Date,
Settlement Amount, Claim Status, Short Payment, Auto Remarks.

### Claim status management
All 10 statuses supported (`Pending, Uploaded, Submitted, Under Process, Query
Raised, Resubmitted, Approved, Partially Approved, Rejected, Settled`) plus
`Not Found`, `Duplicate Claim`, `Duplicate UTR`. Free-text portal wording is
mapped onto the vocabulary by `stlCanonStatus()`. Auto-detection: UTR found →
Settled · claim found without UTR → Pending/portal status · claim missing →
Not Found. Portal `Rejected` / `Query Raised` always win.

### Short & partial payment
`Short Payment = Claim Amount − Settlement Amount`, verified against the spec
example (25000 − 22000 = 3000) and end-to-end (60000 − 52000 = **8000**, status
auto-set to *Partially Approved*). Over-payments never produce a negative.

### Claim ageing
Days-since-submission with buckets 0-30 / 31-60 / 61-90 / 90+ (boundaries
asserted individually), an ageing bar chart, and a `90+ days` auto-remark.

### Reports (all 7 + master)
Updated Tracker · Settlement Register (3 sheets: register, summary, reconciliation)
· Pending UTR · Outstanding Claims · Duplicate · Short Payment · Rejection ·
Master Claim Database. Each with CSV twin, plus **Download All 7** and
**Export Filtered**.

### Colour coding — verified inside the .xlsx
| Status | Screen | Excel fill |
|---|---|---|
| Settled / Approved | green | `FFD6F0DC` |
| Pending / Submitted / Under Process | yellow | `FFFFF3C4` |
| Rejected | red | `FFFAD4D0` |
| Duplicate | orange | `FFFFE0BF` |
| Query Raised / Partially Approved | blue | `FFD6E4FA` |

### Master claim database
Persistent historical archive (upserted on every run, capped at 20 000, survives
reload). Searchable by patient name, claim number, UTR, bill number, UHID and
operator without reopening any Excel file.

### Filters, search, reconciliation, audit
10 filters (status, operator, source sheet, ageing bucket, bill date range,
**settlement date range**, amount range, bill no, UHID, claim/UTR) with 10 sort
orders and instant search across 5 key fields. A Payment Reconciliation table
buckets every claim. The audit log records uploads, generation, exports and
duplicate detection with date + time, and persists.

---

## Bugs Found And Fixed During Testing

1. **Hidden characters were never stripped.** The XLSX reader returned NBSP and
   zero-width spaces still HTML-entity-encoded (`&#160;`), so normalisation never
   saw the real character and the claim failed to match. Fixed by decoding numeric
   entities in *both* readers and in the shared-strings path. Caught because a
   fixture deliberately embedded `\u00a0` and `\u200b` in a claim number.

2. **Short payment silently computed as zero.** In portal files carrying both
   `Claim Amount` and `Settled Amount`, the alias list let `amount` bind to
   *Claim Amount* first, so claim and settlement were identical. Fixed by removing
   `claim amount` from the `amount` aliases — settlement figures must bind to the
   settled column. This is the kind of defect that would quietly under-report
   recoverable money in production.

---

## Files Modified

| File | Change |
|---|---|
| `src/js/09-settlement.js` | 1,076 → **1,724 lines**. Normalisation pipeline, multi-sheet import, settlement extraction, status engine, short payment, ageing, auto-remarks, master DB, reconciliation, 8 export types |
| `src/js/07-excel-backup.js` | **New** `parseXlsxWorkbook()` multi-sheet reader; numeric-entity decoding; stylesheet extended to 9 fills / 20 cell formats for colour coding |
| `src/body.html` | Sheet picker, Master Claim DB tab, 5 report panes, ageing + reconciliation boxes, extra filters, 7 export buttons |
| `src/app.css` | 5-colour status scheme (screen), sheet-picker UI, wider register |
| `test5.js`, `fixtures/*.xlsx` | **New** 153-check suite + multi-sheet/messy-format fixtures |
| `test4.js` | 8 assertions updated for intentional spec changes (see below) |

**Untouched and regression-tested:** billing generation, PDF generation with the
60/20/12/12 mm letterhead, print preview, CGHS code mapping (1,998 codes
byte-identical to your original upload), search dashboard, Excel report
export/import, backup & restore, PDF tools, rate lock, duplicate detection,
edit/audit workflow, keyboard flow, auto-save, footer branding.

### Intentional changes to earlier behaviour
Eight `test4` assertions were updated because the spec changed, not because of
regressions — each was verified by hand first:
- Status `Matched` → `Settled` (richer vocabulary).
- Settlement Amount now sums the **actual portal settled value** (₹794,930 on the
  old fixture) instead of the tracker's bill amount for matched rows (₹232,750).
- Duplicate-UTR count now flags **all** affected rows, not only those whose final
  status was `Duplicate UTR`.
- Register gained Settlement Date / Amount / Short Pay / Age columns.
- `Settlement_Report_*.xlsx` → `Settlement_Register_*.xlsx`;
  `Pending_Claims_*.xlsx` → `Pending_UTR_Report_*.xlsx`.

---

## Remaining Limitations

1. **Claim number is the only join key.** A claim recorded under a different
   number on the portal reports as *Not Found* — deliberate, since fuzzy matching
   financial identifiers is unsafe.
2. **First UTR-bearing record wins** when a claim legitimately appears in more
   than one portal file; the match count is retained internally.
3. **Rejection reason depends on the portal file** exposing a reason/remarks
   column; otherwise it shows "Not specified".
4. **Ageing is measured from the tracker's bill/submission date**, not a separate
   portal submission date (portal exports rarely carry one).
5. **Legacy `.xls` and password-protected workbooks** are not readable; both give
   a specific message telling the user to re-save as `.xlsx`.
6. **Merged header cells** may shift auto-detection — plain header rows are
   recommended.
7. **Settlement results are not persisted** across reloads (only the audit log and
   master database are); re-running takes about two seconds.
8. **Very large trackers (>50k rows)** render in a single pass; pagination would
   be needed beyond that scale.
9. **Status vocabulary is portal-driven** — statuses like *Resubmitted* or
   *Uploaded* only appear if the portal file reports them.
