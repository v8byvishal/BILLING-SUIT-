# Smart Claim / Case Matching Engine — Implementation Report

**Deliverable:** `CGHS_Billing_Suite_Pro.html` (2.76 MB, single file, fully offline)
**Scope:** Settlement matching only. No other module was rebuilt.

## Test Results — 746 / 746 passed, 0 failures

| Suite | Scope | Result |
|---|---|---|
| `test7.js` | Smart matching engine (this work) | **111 / 111** |
| `test6.js` | Security, sync, roles, mobile, backup | **125 / 125** |
| `test5.js` | Advanced settlement / UTR automation | **153 / 153** |
| `test4.js` | Settlement module baseline | **98 / 98** |
| `test3.js` | UI & workflow | **86 / 86** |
| `test2.js` | Letterhead, PDF, PDF tools | **99 / 99** |
| `test2b.js` | Billing logic & validation | **74 / 74** |

Verified in headless Chrome against real `.xlsx` + `.csv` fixtures that
deliberately use **different identifier labels on every file**.

---

## What the existing function got wrong

I reproduced the old `stlKey()` before changing anything:

```
"CLAIM/2026/0001"  vs "claim-2026-0001"   -> NO MATCH
"CGHS.2026.0001"   vs "CGHS 2026 0001"    -> NO MATCH
"ABC/123"          vs "abc.123"           -> NO MATCH
```

Three concrete defects:
1. **Slashes and dots were never normalised** — only spaces and hyphens were.
2. **Only one identifier column per sheet** — a `Case ID` sitting beside a
   `Claim No.` was silently discarded.
3. **Binary matching** — no confidence, so an ambiguous match looked identical
   to a certain one.

---

## The new engine (`11-match-engine.js`, 766 lines)

### Layered normalisation
| Level | Purpose | `Claim/2026/0001` becomes |
|---|---|---|
| `idKeyStrict` | separators preserved | `CLAIM/2026/0001` |
| `idKeyNormalized` | **the workhorse** — all punctuation dropped | `CLAIM20260001` |
| `idKeyDigits` | numeric spine, partial matching only | `20260001` |

Also handles: case folding, leading/trailing/repeated spaces, zero-width and
non-breaking characters, Excel scientific notation (`2.026e+15`), trailing `.0`,
thousands separators, and Excel's text-marker apostrophe.

### One identifier concept, many labels
`Claim No.` · `Claim Number` · `Case No.` · `Case ID` · `Case Id` · `CLAIM_NO` ·
`claim/case no` · `Claim Ref` · `Registration ID` — all recognised and treated
as the same thing. **Every** such column on a row is indexed, not just the first.

A blocklist stops look-alike columns being mistaken for identifiers:
`UTR`, `UHID`, `Bill No.`, `Hospital Account Number`, `Mobile`, `IFSC`, and any
header ending in *amount / date / status / name / type*.

### Matching tiers (in your required order)
1. **Exact identifier** → High
2. **Exact normalised** → High
3. **Unique unambiguous partial** (digit core ≥ 6 digits, corroborated by UHID /
   patient / amount) → Medium, or Low without corroboration

Anything contested is returned as **ambiguous** and never auto-applied.
**Low-confidence matches are withheld** — shown for review, status `Needs Review`,
settlement fields left blank until the user confirms a specific candidate.

### Field provenance (strictly enforced)
| Field | Source | If missing |
|---|---|---|
| UTR | **CSV only** | blank |
| Payment Date | **CSV only** | blank |
| Approved Amount | CSV: *Claim Approved* → *Claim Paid* → *Preauth Approved* | blank (`null`, not `0`) |
| UHID | tracker first, CSV fallback | **blank** |
| Bill No. | tracker | blank |
| Patient Name | tracker, CSV fallback | blank |
| Case Status | CSV, tracker fallback | blank |

---

## Acceptance criteria — verified

| Criterion | Evidence |
|---|---|
| `Claim No.` / `Claim Number` / `Case No.` / `Case ID` all match | 11 label variants pass; tracker `Claim No.` matched CSV `Case No.` |
| CSV found even when the label differs | tracker `Case ID` ↔ CSV `Claim Number`; CSV `Case Id` (mixed case) matched |
| UTR, Payment Date, Approved Amount populate from CSV | `HDFC0001112223` / `20/06/2026` / `₹1,20,000` from *Claim Approved Amount* |
| Missing UHID stays blank, does not break | `MR. NO UHID` settled with blank UHID; `MS. OP BLANK UHID` blank in both sources |
| Works with only one CSV | tested with 1, 2 and 3 CSVs — each matches only what it should |
| Safe from wrong auto-matching | `MR. AMBIGUOUS` (2 candidates) withheld, `Needs Review`, no UTR written |
| Unmatched tracker rows kept | `MS. NOT ON PORTAL` retained with blank settlement fields |

---

## Bugs found and fixed while testing

1. **Strict tier hid separator conflicts.** Two CSV rows written
   `CGHS/2026/IP/0005` and `CGHS-2026-IP-0005` are distinct strings but the
   *same* reference. The strict tier matched one and returned **High** before
   the normalised tier could see the conflict — exactly the wrong-match risk you
   asked to prevent. Now the strict tier cross-checks the normalised bucket.
2. **`Claim Amount` was indexed as a claim identifier.** A money column was
   being treated as a case reference. Fixed with the blocklist + a suffix rule.
3. **`approved` bound to `Claim Amount` via a weak substring score**, so approved
   equalled the claim and every short payment silently became ₹0. Money fields
   now demand a near-exact header match. *This one would have under-reported
   recoverable money with no visible error.*
4. **Identical duplicate CSV rows were flagged as ambiguous.** Byte-identical
   repeats (same UTR, date and amount) now collapse to one candidate — there is
   nothing to choose between them.
5. **Search was separator-sensitive.** Typing `CGHS/2026/IP/0001` found nothing
   when the row was stored normalised. Search now compares both forms.

---

## Extras delivered

- **Confidence column** in the register (High / Medium / Low / None) with the
  reason on hover, plus a **Match Confidence** filter including a
  *"review only ambiguous"* view.
- **Ambiguous Matches pane** — side-by-side candidate comparison with radio
  selection; nothing is written until you click *Apply Selected Match*.
- **Unmatched CSV Rows pane** — payments present in a CSV but absent from the tracker.
- **Search** by case number, UTR, UHID, patient name and bill number, all
  separator-insensitive.
- **Duplicate detection** for claim numbers, UTRs and repeated CSV records.
- **Three new exports**: Ambiguous Review List, Unmatched CSV Rows,
  Reconciliation Summary (plus the existing seven; *Download All* now yields 10).
- **`SETTLEMENT_SCHEMES` registry** — Ayushman / ECHS / PSU are pre-declared with
  their own id vocabularies and can be activated later; CGHS stays the default.
- **`matchEngineSelfTest()`** — callable from the browser console for a quick
  health check of normalisation, header recognition and the blocklist.

## Files Modified

| File | Change |
|---|---|
| `src/js/11-match-engine.js` | **New, 766 lines** — normalisation, header mapping, extraction, three-tier matcher, confidence, reconciliation, ingestion |
| `src/js/09-settlement.js` | `stlParseSheet`, `stlLoadPortal` and `stlProcess` now call the engine; confidence UI, review dialog, two new panes, three new exports |
| `src/body.html` | Confidence filter, Ambiguous pane, Unmatched-CSV pane, Reconciliation export button |
| `assemble.py` | Registers the new module |
| `test7.js`, `fixtures/*` | **New** 111-check suite + OP/IP tracker and three varied CSVs |
| `test4.js`, `test5.js` | 7 assertions refreshed for renamed field keys and the new `Needs Review` status |

Untouched: billing, PDF/letterhead, print, dashboard, Excel backup, code mapping
(1,998 codes byte-identical to the original), cloud sync, security, mobile portal.

## Remaining Limitations

1. **Partial matching is deliberately conservative** — digit cores under 6 digits
   are never used, and an uncorroborated partial is Low (withheld). Some genuine
   matches will need one manual confirmation rather than risk a wrong one.
2. **No fuzzy/typo matching.** `CLM001` vs `CLM0O1` (letter O for zero) will not
   match. Edit-distance matching on financial identifiers is unsafe.
3. **Manual confirmations are session-scoped** — re-running the pipeline requires
   re-confirming, since a fresh run rebuilds every row from source.
4. **First-of-equals rule**: when duplicates are truly identical, the first is
   used. Correct here, but it means the duplicate report is the place to notice
   double payments.
5. **Header must be a real row** within the first 30 rows; merged header cells
   can still confuse detection.
6. **Ayushman / ECHS / PSU are declared, not exercised** — the vocabularies exist
   but have not been tested against real files from those schemes.
