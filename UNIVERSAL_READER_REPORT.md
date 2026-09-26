# Universal Healthcare Data Reader — Implementation Report

**Artifact:** `/home/user/CGHS_Billing_Suite_Pro.html` — 2.89 MB, single file, fully offline
**Result:** **1,326 checks passing, 0 failures**

---

## 1. What changed conceptually

The engine no longer asks *"is this the CGHS claim column?"*. It asks **"what does this column mean?"** and answers from three kinds of evidence:

| Evidence | Source | Weight |
|---|---|---|
| **Header** | label matches a semantic vocabulary | dominant when strong |
| **Content** | the *values* behave like that field | confirms, rescues, or vetoes |
| **Side + role** | tracker vs portal context | tie-break only, never a decision |

Results are stored under **canonical field names** that are independent of the source file. `Registration ID`, `Claim Ref`, `RELS ID` and an unlabelled column all become the same internal concept.

New modules, each replaceable on its own:

```
12-ingest.js   (600)  file type · encoding · delimiter · diagnostics
13-schema.js   (718)  canonical registry · adapters · inference · profiles
14-preview.js  (351)  import preview · manual mapping · profile manager
```

---

## 2. Requirements → where they live

| # | Requirement | Implementation |
|---|---|---|
| 1 | No dependence on extension / delimiter / headers / sheet names / positions | magic-byte sniffing, evidence-scored delimiter detection, semantic inference, global column competition |
| 2 | Schema inference layer, canonical names | `CANON_FIELDS` (25 fields), `inferSchema()` |
| 3 | Field mapping when confidence is low | `SCHEMA_ACCEPT=55` / `SCHEMA_REVIEW=75`, mapping dropdowns per column |
| 4 | Source profiles | `schemaFingerprint()` (FNV-1a over normalised headers + order + delimiter), persisted mappings |
| 5 | Import preview | full dialog: type, delimiter, encoding, diagnostics, mapping, sample rows, all editable |
| 6 | Encoding detection | UTF-8 / UTF-16 LE+BE / Windows-1252 / ISO-8859-1 / ASCII |
| 7 | Import diagnostics | `diagnoseRows()` — rows, columns, empty, duplicate, malformed |
| 8 | Plugin architecture | `registerSchemeAdapter()` — CGHS, Ayushman, ECHS, ESIC, PSU, TPA |
| 9 | Adapt to layout changes | re-inferred per file; asks only when confidence is low |

---

## 3. Canonical fields (25)

Identity: `claimNumber` `caseNumber` `registrationId` `uhid` `billNumber` `utr` `hospitalAcc`
Names: `patientName` `beneficiaryName`
Dates: `admissionDate` `dischargeDate` `billDate` `paymentDate`
Money: `billAmount` `claimedAmount` `approvedAmount` `paidAmount` `preauthAmount`
Context: `payer` `hospitalName` `status` `billType` `operator` `remarks` `reason`

`claimNumber`/`caseNumber`/`registrationId` share `family: 'claimRef'` — one identifier concept, several labels. Each field also declares `side` (`tracker` / `portal` / `any`), which enforces provenance: UTR, approved amount and payment date can only come from the portal side.

---

## 4. Scheme adapters

```js
registerSchemeAdapter({
  id: 'railways', label: 'Indian Railways Health',
  extraAliases: { claimNumber: ['rels id'], payer: ['rels'] },
  detect: h => /rels|railway/i.test(h.join(' ')) ? 90 : 0
});
```

Tested live: a brand-new scheme registered at runtime resolved its custom claim alias *and* inherited the shared UTR/amount vocabulary — with no change to the core engine. Auto-detection verified for all six built-in schemes.

---

## 5. Import preview

Opens for any **new** format, and always when confidence is low. Shows file type, delimiter + confidence, encoding + confidence, row/column/empty/duplicate/malformed counts, detected scheme, per-column mapping (with `header` vs `content`, score, sample values, and a dropdown to change it), sample rows as parsed, and the fingerprint.

Round trip verified end to end: unrecognised caret file → preview opens → user maps 4 columns → import applies that mapping → format remembered → **next month's file with the same shape imports silently** via the saved profile.

`PREVIEW.interactive = false` disables all dialogs for automation. In that mode a low-confidence file is still never guessed — weak fields stay unmapped (blank, not wrong) and a warning is recorded.

---

## 6. Three bugs found during this work

**6.1 `Bill Amount` silently read as zero.** The canonical model splits money into `billAmount`/`claimedAmount`, but the legacy matcher slot is `claimAmount`. A tracker column literally called "Bill Amount" mapped correctly, found no legacy home, and the row read 0. Fixed with an ordered fallback in `schemaToLayout()`.

**6.2 Header-less files lost their payment date and approved amount.** With no headers every date column scores identically and every money column scores identically — the winner was decided by JavaScript object key order, which is not a decision. `admissionDate` beat `paymentDate`; `billAmount` beat `approvedAmount`. Fixed by adding **side context** as an explicit tie-break: a date on a portal file is a payment date, on a tracker it is a bill date.

Then that fix over-corrected — a content-only guess (score 84) outranked a column the file had actually labelled `Approved` (score 76) and stole it. Fixed properly in the assignment pass: **header-backed candidates always sort ahead of content-only ones.**

**6.3 Modal DOM leak.** `showModal` is a shared singleton whose `#modalBody` kept its last HTML after closing — 4 orphaned `<select>` elements and 6 modal nodes persisted. Pre-existing, but newly dangerous: later code querying `select.pv-map` would read values from a dismissed dialog. The body is now cleared on close, and the preview harvests its fields *while the dialog is still open*.

---

## 7. Test results

| Suite | Checks | Result |
|---|---|---|
| test2 / test2b / test3 | 259 | ✓ |
| test4 / test5 | 252 | ✓ |
| test6 / test7 | 236 | ✓ |
| test8 / test9 | 198 | ✓ |
| **test10 (new)** | **112** | ✓ |
| Browser E2E validation | 138 | ✓ |
| Export audit (openpyxl) | 100 | ✓ |
| Edge probes | 24 | ✓ |
| **Total** | **1,326** | **0 failures** |

test10 covers canonical fields (18), inference (8), position/name independence (5), side-aware header-less inference (4), adapters (11), encoding (13), diagnostics (5), low-confidence handling (6), fingerprints + profiles (10), manual mapping (3), layout drift (5), non-interactive safety (1), interactive round trip (7), UI (3), regression (8).

Performance unchanged: 5,000 rows = 736 ms parse / 60 ms match / 993 ms pipeline / +20 MB heap.

---

## 8. Limitations

1. **Column-order changes within a saved profile** produce a different fingerprint, so the profile won't match and the preview reopens. Safe (never mis-maps) but means re-confirming. Deliberate: reusing a mapping across reordered columns would put data in the wrong field.
2. **Multi-sheet workbooks are gated on the first usable sheet.** A workbook whose sheets have genuinely different layouts gets one preview, and the remaining sheets are inferred independently.
3. **Encoding detection is heuristic below the BOM level.** A short file with one high byte may pick CP1252 over Latin-1; they differ only in `0x80–0x9F`.
4. **Shift-JIS / Big5 / ISCII are not supported.**
5. **XML exports still rejected** — no schema to work from.
6. **Fixed-width text unsupported** (detected as single-column).
7. **Multi-character delimiters** (`||`, `::`) unsupported.
8. **Adapter `detect()` runs on headers only**, so a header-less file falls back to the active scheme.
9. **`TOTAL`-row detection is English-only.**
10. **Ayushman / ECHS / ESIC / PSU / TPA vocabularies are untested against real files** — built from public documentation. CGHS remains the only one validated on genuine exports.

---

## 9. Adding a new scheme later

```js
registerSchemeAdapter({
  id: 'myscheme', label: 'My Scheme',
  extraAliases: { claimNumber: ['their claim label'] },
  detect: headers => /signature/i.test(headers.join(' ')) ? 80 : 0
});
```

No change to inference, matching, settlement, reports or UI.

---

## 10. Files

| File | Change |
|---|---|
| `work/src/js/13-schema.js` | **new** (718) — canonical registry, adapters, inference, fingerprints, profiles |
| `work/src/js/14-preview.js` | **new** (351) — import preview, mapping editor, profile manager |
| `work/src/js/12-ingest.js` | encoding detection + diagnostics (461 → 600) |
| `work/src/js/11-match-engine.js` | `resolveLayout` split into physical + schema passes; import gates |
| `work/src/js/09-settlement.js` | preview wiring, profile loading, mapping pass-through |
| `work/src/js/01-core.js` | modal body cleanup (bug 6.3) |
| `work/src/body.html`, `app.css` | preview toggle, profiles button, preview styling |
| `work/test10.js` | **new** — 112 tests |
