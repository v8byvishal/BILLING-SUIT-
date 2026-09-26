# End-to-End Validation Report
### CGHS Billing Suite Pro — Settlement Module

**Date:** 28 July 2026
**Artifact:** `/home/user/CGHS_Billing_Suite_Pro.html` — 2.80 MB, single file, offline
**Verdict:** All checklist items executed. **3 real bugs found and fixed**, then every stage re-run clean.

---

## 0. How this was validated

Internal tests only prove the app agrees with itself. Three independent layers were used instead:

| Layer | Tool | What it proves |
|---|---|---|
| **Ground truth** | `ground_truth.json` — 16 hand-specified records, each declaring which side every field must come from | Field values are right, not just self-consistent |
| **Independent parser** | **openpyxl** re-reads the exported `.xlsx` files | What's on disk matches what was claimed; the app's own XLSX writer isn't grading itself |
| **Source trace-back** | Every UTR / Bill No / UHID in the output is checked to exist verbatim in a source file | Nothing was fabricated |

Fixtures were generated from the ground truth, never from app output.

**Totals: 138 browser assertions + 100 export-audit assertions + 24 edge probes + 869 internal tests = 1,131 checks, 0 failures.**

---

## 1. Bugs found and fixed

### 1.1 Fabricated UHID — *critical*
`MR. NO UHID` has no UHID in either file, yet the report showed **`EMP-778`**.

The General CSV carries an *Empanelment Code* column holding the constant `EMP-778` on every row. My content classifier matched it on shape (letters + digits) and filled UHID from it. A constant value was being written into a patient-identifying field — the exact fabrication the brief forbids.

**Cause:** `looksLikeUhidColumn()` checked shape but not uniqueness. The `id` classifier already required `uniq >= 0.7`; the UHID path had no equivalent.

**Fix:** added `hasPerRowVariety()` and applied it to every identity-bearing kind (`uhid`, `utr`, `id`, `name`). A column that doesn't vary per row can no longer become patient data. Money / date / status are exempt — a file where every row says "Settled" is normal.

### 1.2 Internal key leaked into the Duplicate Report
The report showed `CGHS2026IP0001` — the engine's normalised matching key — instead of `CGHS/2026/IP/0001` as written in the source. Not wrong data, but unusable: an operator can't look that up. All three duplicate types now emit `claimRaw`.

Caught only by the openpyxl audit; the browser assertions compared normalised values and were happy.

### 1.3 `TOTAL` row ingested as a claim
A trailing `TOTAL` summary line — which most real portal exports have — was parsed as a record, producing a phantom claim called "TOTAL" that inflated row counts and appeared as an unmatched row. Added `looksLikeTotalRow()`, requiring **both** a total keyword and no claim reference on the row. Total rows are also excluded from column profiling so they can't skew classification.

---

## 2. Upload scenarios — all 7 combinations

Each verified for ward set, exact merged row count, and per-file identity.

| Combination | Wards | Rows | Files kept separate |
|---|---|---|---|
| Only General | general | 5 | ✓ |
| Only Semi Private | semi | 4 | ✓ |
| Only Private | private | 7 | ✓ |
| General + Semi Private | general, semi | 9 | ✓ |
| General + Private | general, private | 12 | ✓ |
| Semi Private + Private | semi, private | 11 | ✓ |
| All three | general, semi, private | 16 | ✓ |
| All three via one multi-select | general, semi, private | 16 | ✓ |

**No file replaced another in any combination.** Row counts were derived from the fixtures independently, so a silent replacement would change the total and fail.

---

## 3. Tracker scenarios

| Scenario | Result |
|---|---|
| CGHS IP tracker (`Claim No.`) | ✓ 11 rows |
| CGHS OP tracker (`Case ID`, `Bill Number`, `UH ID`, `Beneficiary Name`) | ✓ 3 rows, all fields resolved |
| Multi-sheet workbook (3 sheets) | ✓ 2 usable, `Instructions` skipped without error |
| Blank rows mid-data | ✓ skipped, no phantom rows |
| Missing optional columns (no Operator/Remarks on OP sheet) | ✓ blank, not broken |
| Different header names per sheet | ✓ both vocabularies resolved |
| Genuinely blank claim number | ✓ **stays blank**, status `Not Found` |

---

## 4. CSV scenarios

| Scenario | File | Result |
|---|---|---|
| Proper headers | General.csv | ✓ `header` mode, 5 rows |
| Extra unused columns (Empanelment Code, Remarks, Hospital Account) | General.csv | ✓ ignored — and **fix 1.1** stops them contaminating fields |
| Different column order (date first, claim 4th) | SemiPrivate.csv | ✓ 4 rows |
| Partial headers (blank header cells) | SemiPrivate.csv | ✓ resolved by content |
| **No header row at all** | Private.csv | ✓ `raw` mode, 7 rows, **no row lost to a phantom header** |
| Blank cells | Private.csv | ✓ stay blank, row still parsed |
| Duplicate rows | SemiPrivate.csv | ✓ flagged, 1 duplicate detected |

---

## 5. Field-level verification (against ground truth)

All 8 fully-matched records verified across all 7 fields — **56 field assertions**, then re-verified on disk via openpyxl.

| Field | Required source | Verified |
|---|---|---|
| Claim/Case Number | Tracker | ✓ original format preserved |
| UTR | **CSV only** | ✓ + every UTR traced to a source CSV |
| Approved Amount | **CSV only** | ✓ + source column named (`Claim Approved Amount`) |
| Payment Date | **CSV only** | ✓ |
| UHID | Tracker → CSV → blank | ✓ all three paths |
| Bill Number | **Tracker only** | ✓ + traced to tracker |
| Patient Name | Tracker → CSV | ✓ |

Specific provenance cases:
- **UHID present only in CSV** (`MR. UHID FROM CSV`) → correctly filled `UH500109`
- **UHID absent on both sides** (`MS. OP BLANK UHID`, `MR. NO UHID`) → **blank** ← this is where bug 1.1 was caught
- **Separator variance** (`CGHS-2026-IP-0002` vs `CGHS 2026 IP 0002`) → matched, High confidence
- **Short payment** 98000 − 71500 = **26500** ✓; 64000 − 60000 = **4000** ✓
- Cell types on disk: amounts are **numbers**, dates are **datetimes** — not text

---

## 6. Error / report validation

| Report | Expected | Got |
|---|---|---|
| Unmatched tracker | `MS. NOT ON PORTAL`, `MR. NO CLAIM YET` | ✓ exact set |
| Unmatched CSV | `MR. CSV ONLY`, `MRS. CSV ONLY TWO` | ✓ both, UTR + amount preserved |
| Ambiguous | `MR. AMBIGUOUS`, 2 candidates, **not auto-filled** | ✓ UTR blank, amount blank, reason recorded |
| Duplicate claim | `CGHS/2026/IP/0001` × 2 | ✓ — original format after **fix 1.2** |
| Duplicate CSV record | 1 in SemiPrivate.csv | ✓ |
| Rejected | `MR. REJECTED`, no UTR | ✓ |
| Query Raised | `MRS. QUERY` | ✓ |

### Reconciliation arithmetic
Recomputed three ways — in-app, from the exported file, and from ground truth:

| Metric | Value | Cross-checks |
|---|---|---|
| Total claim amount | ₹667,400 | in-app = on-disk = ground truth ✓ |
| Settled amount | ₹508,700 | in-app = on-disk = ground truth ✓ |
| Short payment | ₹30,500 | = sum of per-row short payments ✓ |
| Total claims | 14 | = tracker row count ✓ |
| Bucket sum | matched + unmatched + ambiguous ≤ 14 | ✓ no double counting |

---

## 7. Performance

Fresh browser page per measurement; `--enable-precise-memory-info`; JIT-warmed run reported; match time is best-of-3.

| Rows | Parse | Match | Full pipeline | Export | Heap Δ | Matched |
|---|---|---|---|---|---|---|
| 500 | 137 ms | 4 ms | 218 ms | 73 ms | +3.7 MB | 400/400 ✓ |
| 1,000 | 236 ms | 12 ms | 338 ms | 99 ms | +6.0 MB | 800/800 ✓ |
| 5,000 | 593 ms | 63 ms | 874 ms | 258 ms | +19.8 MB | 4,000/4,000 ✓ |
| **20,000** (beyond spec) | 1,021 ms | 266 ms | 3,696 ms | 895 ms | +82.3 MB | 16,000/16,000 ✓ |

Each run used **three portal files simultaneously**, with 1-in-3 claims using different separators — all still matched at High confidence.

Scaling is linear with no cliff. Matching is the cheap part; parsing and XLSX export dominate.

> **Note on an earlier figure:** my first harness reported a flat "10.7 MB" at every size. That was `performance.memory` returning bucketed values without the precise-memory flag, on a reused page. The table above uses a fresh page per size and real measurement. The flat number was a measurement artifact, not a result.

---

## 8. Edge cases (beyond the checklist)

24 additional probes, all passing:

- **Fabrication guard:** constant EMP code and constant branch text refused for UHID/name/id
- **Numeric hazards:** Indian digit grouping (`1,20,000.50`), scientific notation, trailing `.0`, `₹` symbol, Excel text-marker apostrophe, bracketed negatives
- **Unicode:** NBSP, zero-width, non-breaking hyphen
- **Structural:** ragged rows, duplicate header labels, `TOTAL` row (bug 1.3), single header-less data row
- **Safety:** near-miss ids (`…0001` vs `…00011`) and prefixes are **not** force-matched
- **Idempotence:** running the match 3× gives identical output and doesn't accumulate duplicates

---

## 9. Final counts

| Suite | Checks | Result |
|---|---|---|
| Browser E2E validation | 138 | ✓ 0 fail |
| Export audit (openpyxl) | 100 | ✓ 0 fail |
| Edge-case probes | 24 | ✓ 0 fail |
| Internal suites (test2 → test8) | 869 | ✓ 0 fail |
| **Total** | **1,131** | **0 failures** |

Main validation run: **14 tracker rows, 16 portal rows, 7 matched, 2 unmatched tracker, 4 unmatched CSV, 1 ambiguous, 6 duplicate entries, 11 High confidence, 0 Medium, 0 Low.** No runtime errors, zero network requests throughout.

---

## 10. Known limitations

1. **Header-less amount columns are a genuine guess.** With several numeric columns and no headings, the one with the most non-zero values is used and a warning names every candidate.
2. **Bare Excel serials are not treated as dates** in header-less files — a 5-digit number could be a date or money. Headed files parse dates normally.
3. **No fuzzy/typo matching.** `CLM001` vs `CLM0O1` won't match — unsafe on financial identifiers.
4. **Digit cores under 6 digits are never used** for partial matching.
5. **Row-level rescue only fires on irregular layouts** — protects deliberately-blank claim cells in properly-headed files.
6. **Variety guard needs ≥2 rows.** A single-row CSV can't be judged for variety, so a constant column can't be ruled out. Low risk; single-row payment files are rare.
7. **`TOTAL` detection is English-only** (`total`, `subtotal`, `grand total`, `sum`, `net total`). A Hindi/regional total label would still be ingested.
8. **20,000 rows uses ~82 MB heap.** Fine on desktop; a low-memory tablet may struggle beyond this.
9. **Manual ambiguity confirmations are session-scoped** — not persisted across reloads.
10. **Ayushman / ECHS / PSU vocabularies are registered but untested** against real files. CGHS is the only active scheme.

---

## 11. Artifacts

- `work/val/make_fixtures.py` — fixture + ground-truth generator
- `work/val/fixtures/ground_truth.json` — source of record
- `work/validate_e2e.js` — 138 browser assertions
- `work/val/audit_exports.py` — 100 openpyxl assertions
- `work/edge_probe.js` — 24 edge probes
- `work/perf_probe.js` — performance harness
- `work/val/results.json`, `perf.json`, `perf_big.json`, `audit_results.json` — raw data
