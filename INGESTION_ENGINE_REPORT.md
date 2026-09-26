# Universal Ingestion & Matching Engine — Redesign Report

**Artifact:** `/home/user/CGHS_Billing_Suite_Pro.html` — 2.83 MB, single file, fully offline
**Result:** **1,214 checks passing, 0 failures**

---

## 1. The bug that forced the redesign

Your caret (`^`) portal file didn't just fail — it failed **silently and wrongly**.

I reproduced it before changing anything:

```
Portal_General.caret.csv  ->  4 rows x 1 column
row[0] = ["Registration ID^Beneficiary Name^Claim Approved Amount^UTR^Payment Date^..."]
layout  = { mode: "raw", claim: col 0 }
```

The old reader picked its parser from the **file extension** (`.csv` → comma-only splitter), got one giant column back, and the content scanner then decided that entire concatenated line *was* a claim reference. Not an error message — wrong data presented confidently.

That's an architecture problem, not a bug to patch. So the ingestion layer was rebuilt.

---

## 2. New architecture

Ingestion is now a separate module (`12-ingest.js`, 470 lines) that the matcher knows nothing about. **No module decides both "what shape is this file" and "what do these columns mean."**

```
File
 └─ sniffFileKind()      magic bytes → xlsx | text | json | html | pdf | xls-legacy | binary
 └─ decodeBytes()        UTF-8 / UTF-16 LE / BE / BOM
 └─ detectDelimiter()    ^ , TAB | ; ~ 0x1F 0x01 — scored on evidence
 └─ parseDelimitedText() RFC4180 quoting, any delimiter
 └─ parseJsonRows()      future portal exports
 └─ parseHtmlTableRows() "portal .xls" that is really HTML
 └─ readTabularFile()    single entry point  ─────────────┐
                                                          │
Layout (11-match-engine.js)                               │
 └─ resolveLayout()      header | partial | unknown | raw ◄┘
 └─ profileColumns()     content classification
 └─ mapHeaderRow()       vocabulary scoring
Matching
 └─ buildMatchIndex() → resolveMatch() → buildSettlementRow()
Reporting / debug
 └─ INGEST log → stlRenderDebug() / stlDebugText()
```

| Your requested module | Where it lives |
|---|---|
| file type detector | `sniffFileKind()` |
| delimiter detector | `detectDelimiter()` |
| header detector | `findHeaderRow()` / `mapHeaderRow()` |
| content-based field detector | `profileColumns()` / `classifyColumn()` |
| tracker parser | `ingestTracker()` / `stlParseSheet()` |
| portal parser | `ingestCsv()` / `stlAddPortalFiles()` |
| normalization helper | `idKeyStrict/Normalized/Digits()` |
| confidence scorer | `scoreHeader()` / `resolveMatch()` tiers |
| matcher | `buildMatchIndex()` / `resolveMatch()` |
| report builder | `stlProcess()` / `stlExportXlsx()` |
| debug logger | `INGEST` + `ingestLog/Explain/RunSummary` |

---

## 3. Delimiter detection — by evidence, not preference

Candidates are scored on **consistency**: split every sampled line, and a real delimiter yields the *same field count* on nearly every line. Field count is only a tie-break. Quoted segments are blanked before scoring.

This is why the hard cases work:

| Case | Result |
|---|---|
| Caret file where names contain commas (`SMITH, JOHN`) | **`^` wins** — commas are inconsistent |
| Normal CSV with a stray `^` in one remark | **`,` wins** |
| `"SMITH, JOHN"` quoted commas | **`,` wins**, quoted content ignored |
| Single-column text | reports "no delimiter" rather than crashing |

Supported: `^` `,` TAB `|` `;` `~` `0x1F` `0x01`.

---

## 4. File type by magic bytes, never extension

Extensions lie. All verified:

| Real content | Named | Detected |
|---|---|---|
| ZIP/OOXML | `weird.txt` | `xlsx` ✓ |
| OLE2 | `old.xls` | `xls-legacy` → "Save As .xlsx" ✓ |
| `%PDF` | `claim.csv` | `pdf` → "use PDF Tools" ✓ |
| `[{...}]` | `data.txt` | `json` ✓ |
| `<table>` | `export.xls` | `html` ✓ |
| `A^B^C` | `portal.csv` | `text` → caret ✓ |

**Extension/content mismatch is itself diagnostic:** a `.xlsx` whose bytes are plain text with no table structure now reports *"named .xlsx but the content isn't Excel — may be corrupt or mis-saved"* instead of the misleading "no claim column found."

---

## 5. Second bug found during the rebuild

The **tracker loader had its own separate reader** with a hard extension gate:

```js
if (!/\.(xlsx|csv)$/.test(name)) throw new Error('Sirf .xlsx ya .csv file chalegi');
```

So even after fixing portal ingestion, a caret-delimited or `.txt` **tracker** would still be rejected. I only caught this because the debug panel screenshot said *"File Ingestion (3)"* when four files were loaded — the tracker was never reaching the new pipeline.

Both sides now share `readTabularFile()`. A caret-delimited `.txt` tracker is verified working.

---

## 6. Your real file structures — verified

**Portal (caret, proper header):** all 5 fields resolved from `Registration ID` / `Beneficiary Name` / `Claim Approved Amount` / `UTR` / `Payment Date`, at 100% header confidence.

**Tracker (`Bill No`, `Date`, `UHID`, `Patient Name`, `Bill Type`, `Bill Amount`, `PAYER`, `Auth Amt 1`, `OPERATOR`, `CASE ID`):**
- `CASE ID` → claim reference ✓
- `Bill No`, `UHID`, `Patient Name`, `Bill Amount`, `OPERATOR`, `Date` all read ✓
- **`PAYER` is not mistaken for a claim reference** ✓
- **`Auth Amt 1` is not mistaken for a claim reference** ✓

Caret + pipe + tab portal files load **simultaneously**, each with its own detected delimiter, none overwriting another. Claims matched across all three despite separator variance (`CASE.2026.OP.0011` ↔ `CASE-2026-OP-0011`).

---

## 7. Debug mode

Checkbox on the upload screen; **Copy Debug Report** exports plain text (falls back to download if clipboard is blocked). Everything you asked for is shown:

- detected delimiter **+ confidence % + why it beat the runner-up**
- detected file type + the byte evidence
- detected headers
- claim / UTR / approved amount / payment date columns — each with column letter, header text, **`header` vs `content`**, score, and a one-line reason
- run counters: matched / unmatched tracker / unmatched portal / ambiguous / duplicates / confidence H-M-L

Sample output:

```
Delimiter   caret (^)  confidence 100%
            chose caret (^): 7 fields on 100% of 4 sampled lines
Field                  Column                     How     Score
Claim / Case reference A "Registration ID"        header  100
UTR                    D "UTR"                    header  100
Approved Amount        C "Claim Approved Amount"  header  100
```

---

## 8. Test results

| Suite | Checks | Result |
|---|---|---|
| test2 / test2b / test3 | 259 | ✓ |
| test4 | 99 | ✓ |
| test5 | 153 | ✓ |
| test6 | 125 | ✓ |
| test7 | 111 | ✓ |
| test8 | 122 | ✓ |
| **test9 (new)** | **76** | ✓ |
| Browser E2E validation | 138 | ✓ |
| Export audit (openpyxl) | 100 | ✓ |
| Edge probes | 24 | ✓ |
| **Total** | **1,214** | **0 failures** |

Performance unchanged by the redesign: 5,000 rows = 596 ms parse / 59 ms match / 1,014 ms full pipeline. Regression confirmed: 1998 CGHS codes, 60/20/12/12 margins, PDF, Excel, all views, zero mobile overflow, zero network requests.

---

## 9. Limitations

1. **XML portal exports rejected** with a clear message — no schema to work from. Send me a sample and it's a ~30-line addition.
2. **Multi-character delimiters** (`||`, `::`) unsupported — single-char only.
3. **Fixed-width / column-aligned text** unsupported; detected as single-column.
4. **Encrypted `.xlsx`** cannot be opened offline.
5. **Encoding is UTF-8/UTF-16 only.** A legacy Windows-1252 file with `₹` or accented names may show replacement characters — identifiers and amounts are unaffected.
6. **`TOTAL`-row detection is English-only** (`total`, `subtotal`, `grand total`, `sum`).
7. **Header-less amount columns remain a genuine guess** — the column with most non-zero values wins, and debug mode names every candidate.
8. **Ayushman / ECHS / PSU vocabularies registered but untested** against real files.

---

## 10. Adding a future format

The ingestion contract is one function returning `[{name, rows}]`. To add e.g. fixed-width:

1. add a branch in `sniffFileKind()`
2. write `parseFixedWidth(text)` returning row arrays
3. add one `else if` in `readTabularFile()`

No change to the matcher, settlement logic, reports or UI.

---

## 11. Files

| File | Change |
|---|---|
| `work/src/js/12-ingest.js` | **new**, 470 lines — the whole ingestion layer |
| `work/src/js/11-match-engine.js` | old reader removed; debug hooks added |
| `work/src/js/09-settlement.js` | tracker routed through the new pipeline; debug panel renderer |
| `work/src/body.html` | debug toggle, widened `accept` attributes |
| `work/src/app.css` | debug panel styling |
| `work/assemble.py` | module order |
| `work/test9.js` | **new**, 76 tests |
| `work/real/` | fixtures matching your real structures |
