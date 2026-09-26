# CGHS Billing Suite Pro — Settlement Report Manager

**Deliverable:** `CGHS_Billing_Suite_Pro.html` (2.56 MB, single file, 100% offline)
**Version:** 3.1 · **Date:** 27 Jul 2026

**Test result: 357 / 357 automated checks passed, 0 failures**

| Suite | Scope | Result |
|---|---|---|
| `test4.js` | Settlement Report Manager (this module) | **98 / 98** |
| `test3.js` | UI & workflow phase | **86 / 86** |
| `test2.js` | Phase 2A — letterhead, PDF, tools | **99 / 99** |
| `test2b.js` | Phase 2B — billing logic, validation | **74 / 74** |

Tested against **real .xlsx fixtures** built with `openpyxl` (title rows above the
header, varied header spellings, blank UTR, duplicate claim, duplicate UTR,
missing claim number), and every exported workbook was re-opened and verified
with an external Excel parser.

---

## What was built

A new **Settlement** tab with four sub-panes: *Upload & Process*,
*Settlement Report*, *Pending & Duplicates*, and *Audit Log*.
The entire manual download-merge-VLOOKUP routine is now one button.

### Steps 1–3 — Upload & auto-merge
- **Upload Tracker** accepts `.xlsx` or `.csv` (e.g. `CGHS IP.xlsx`).
- **Auto column detection** with no manual mapping. Each logical field carries an
  alias list; matching runs exact-alias first, then a contains-fallback. Verified
  against `Bill No.`, `Patient  Name` (double space), `Claim_Number`, `Claim No.`,
  `UTR No` — all resolved automatically. Title/blank rows above the header are
  skipped (header row is located by scanning the first 25 rows).
- Portal files upload independently: **General only**, **General + Semi Private**,
  or **all three** — every combination works. Files auto-merge into one dataset
  with the ward recorded per row.

### Steps 4–6 — Matching & UTR extraction
- **EXACT match only** on a normalised key (trimmed, uppercased). No fuzzy or
  partial matching — a near-miss claim number returns nothing (asserted in tests).
- Long claim numbers that Excel mangles into scientific notation (`2.02606E+15`)
  are reconstructed to their full 16-digit form.
- Matched claims pull the **UTR Number** from whichever portal file supplied it.

### Steps 7–8 — Status & duplicates
Five statuses, assigned in priority order:

| Status | Meaning |
|---|---|
| `Matched` | Claim found on portal **and** a UTR is present |
| `Pending` | Claim found on portal but the UTR is still blank |
| `Not Found` | Claim absent from portal, or blank in the tracker |
| `Duplicate Claim` | Same claim number appears more than once in the tracker |
| `Duplicate UTR` | Same UTR maps to more than one claim |

Duplicates are flagged visually (red row + pill) and collected into a separate
report listing type, duplicated value, occurrence count and source sheet row.

### Steps 9–13 — Report, dashboard, filters, search
- Settlement report with the exact 9 requested columns.
- Summary dashboard: Total Claims, Matched, Pending, Duplicate Claims,
  Duplicate UTRs, Settlement Amount, Pending Amount, Match Percentage — plus a
  status donut and a settled-vs-pending bar chart.
- Filters: Date range, Operator, Bill No, UHID, Claim/UTR, Status, Amount range,
  and 7 sort orders. Instant (90 ms debounced) search across Claim Number, UTR,
  Patient Name, Bill No and UHID.

### Steps 14–16 — Audit, errors, updated tracker
- **Audit log** records File Upload, Settlement Generation, Export Generation and
  Duplicate Detection, each with date + time; persisted across reloads and
  exportable as CSV.
- **Error handling** with plain-language messages for missing columns, wrong
  format (legacy `.xls` is named explicitly), corrupt/non-zip files, empty files,
  and blank claim numbers. A portal file containing claims but no UTR column gets
  its own specific message.
- **Updated Tracker** keeps every original column and row untouched and appends
  only `UTR Number` and `Status` (skipped if the tracker already has them).

### Step 17 — One-click processing
Upload → click **Generate Settlement Report** → merge, match, extract, status,
duplicates, all four reports and the summary. Measured at ~1.6 s for the test set.

### Final outputs
1. Updated Tracker `.xlsx` 2. Settlement Report `.xlsx` (+ Summary sheet)
3. Pending Claims `.xlsx` 4. Duplicate Report `.xlsx` 5. Live summary dashboard
CSV variants available for each, plus "Export Filtered".

---

## Worked example (test fixture)

11 tracker rows against 8 portal rows across three files:

| Claim | Patient | UTR | Status |
|---|---|---|---|
| …3194 | MR. KAMAL SINGH | HDFC000123456789 | Duplicate Claim |
| …3195 | MRS. SUNITA DEVI | HDFC000123456790 | Matched |
| …3196 | MR. RAMESH GUPTA | HDFC000123456791 | Matched |
| …3197 | MS. PRIYA SHARMA | HDFC000123456792 | Matched |
| …3198 | MR. ARJUN MEHTA | HDFC000123456794 | Duplicate UTR |
| …3199 | MRS. LATA RAO | — | Pending |
| …3200 | MR. SURESH PATEL | HDFC000123456793 | Matched |
| …3194 | MRS. KIRAN BALA | HDFC000123456789 | Duplicate Claim |
| …3201 | MR. DEEPAK JAIN | HDFC000123456794 | Duplicate UTR |
| (blank) | MR. NO CLAIM YET | — | Not Found |
| …3202 | MRS. ANJALI VERMA | — | Not Found |

Settlement ₹2,32,750 · Pending ₹1,39,400 · Match 36.36%

---

## Bug found and fixed during testing

The Updated Tracker initially exported the Date column as the **raw Excel serial
(`46185`)** because original cells were copied verbatim. Dates are now written
back as real date-typed cells (`2026-06-12`), confirmed by re-opening the file.

## Modified files

| File | Change |
|---|---|
| `src/js/09-settlement.js` | **New** — the entire module (~1,050 lines) |
| `src/body.html` | Settlement tab + 4-pane view |
| `src/app.css` | Upload slots, status pills, report table styling |
| `src/js/08-app.js` | View routing, `Alt+5` shortcut, init wiring |
| `assemble.py` | Registers the new module |
| `test4.js`, `fixtures/*.xlsx` | **New** — 98-check suite + real Excel fixtures |

**Untouched and regression-tested:** billing generation, PDF generation with the
60/20/12/12 mm letterhead, CGHS code mapping (1,998 codes byte-identical to the
original file), search dashboard, Excel report export/import, backup & restore,
PDF tools, priority ordering, rate lock, duplicate detection, edit/audit
workflow, keyboard flow, auto-save and footer branding.

## Known limitations

1. **Claim number is the only join key.** If the portal exports a claim under a
   different number than the tracker records, it reports as *Not Found* — this is
   deliberate, since fuzzy matching on financial identifiers is unsafe.
2. **First match wins** when a claim legitimately appears in more than one portal
   file; the count is retained internally but only one UTR is written.
3. **Legacy `.xls` is not supported** (the format is a different binary container).
   The error message tells the user to re-save as `.xlsx`.
4. **Password-protected / encrypted workbooks** cannot be read and surface as
   "corrupt file".
5. **Merged cells** in the header band may shift auto-detection; plain header rows
   are recommended.
6. **Settlement results are not persisted** across reloads — only the audit log is.
   Re-upload and re-run takes about two seconds.
7. Very large trackers (>50k rows) will work but render the full table in one
   pass; pagination would be needed beyond that scale.
