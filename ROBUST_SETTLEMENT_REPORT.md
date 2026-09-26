# Robust Settlement Ingestion & Matching — Implementation Report

**Deliverable:** `/home/user/CGHS_Billing_Suite_Pro.html` — 2.80 MB, single file, fully offline
**Test result:** **869 / 869 passing, 0 failures** across 8 suites

---

## 1. Files Modified

| File | Lines | What changed |
|---|---|---|
| `work/src/js/11-match-engine.js` | 766 → 1278 | Content classifiers, `resolveLayout()`, header sanity-check, batch ingestion |
| `work/src/js/09-settlement.js` | 2010 → 2291 | Multi-file portal slots, upload queue, filename routing, unmatched-tracker report |
| `work/src/body.html` | 1296 → 1320 | `multiple` inputs, combined drop zone, "Other" slot, Unmatched Tracker pane |
| `work/src/app.css` | 905 → 910 | Per-file chip styling |
| `work/test8.js` | **new**, 581 | 122 tests for the new behaviour + full regression |
| `work/test4.js` | — | 1 stale assertion updated (rejected file no longer unloads good files) |

New fixtures: `NoHeader.csv`, `PartialHeader.csv`, `WeirdHeader.csv`, `TinyNoId.csv`.

---

## 2. Problem 1 — Multiple portal upload was not stable

**Three separate bugs, all fixed.**

1. **Only `files[0]` was read.** `wireDrop()` did `const f = e.target.files[0]`. Selecting or dropping three files loaded one and silently discarded the rest. Handlers now receive the whole `FileList`.

2. **Async interleaving.** Two uploads started close together interleaved their `await`s; the second render overwrote the first's result. All loads now pass through one promise chain (`stlQueue`), so they serialise. A test fires three uploads *without awaiting* and asserts none are lost.

3. **A failed file wiped the good ones.** The old code called `delete STL.portal[wardKey]` in its `catch`. Uploading a bad file after a good one unloaded both. Failures are now per-file and additive — the batch reports what succeeded and what didn't.

**Structural change:** each ward slot holds a **list** of files (`STL.portal[ward].files[]`) instead of one file, with an aggregate view rebuilt by `stlRebuildWard()`.

Also added:
- **One combined drop zone** — drop General + Semi Private + Private together; `stlGuessWard()` routes each by filename and tells you where each went.
- **An "Other" slot** so a file with an unrecognisable name is never discarded.
- **Several files per ward** (e.g. two General exports for different months).
- **Per-file remove buttons**, plus a running total across all wards.
- Re-uploading the same filename **refreshes in place** rather than duplicating.

---

## 3. Problem 2 — CSV parsing was too strict

The old path called `findHeaderRow()`, which *required* a recognised claim/case header and returned `null` otherwise → hard rejection.

New entry point **`resolveLayout()`** handles four real shapes:

| Mode | Situation | Strategy |
|---|---|---|
| `header` | Proper header, reference column named | Headers, then content fills gaps |
| `partial` | Header present, reference column not recognised | Content finds the reference |
| `unknown-header` | Header row present but nothing understood (`Col1..Col6`) | Full content scan |
| `raw` | No header at all | Full content scan, **row 0 is data** |

### Content classifiers
Each column is profiled from the values it actually holds: `looksLikeIdValue`, `looksLikeUtrValue`, `looksLikeDateValue`, `looksLikeMoneyValue`, `looksLikeStatusValue`, `looksLikeNameValue`, `looksLikeUhidColumn`. A column is typed by the shape ≥70 % of its values share.

Two deliberate refusals to guess:
- **Bare Excel serials are not treated as dates.** In a header-less file a column of 5-digit numbers is just as likely to be money; getting it wrong would put a rupee figure in Payment Date.
- **UHID is told apart from a claim reference** by shape (short, single alphabetic prefix, numeric tail, ≤12 chars). Without this a UHID column got indexed as a reference, and because a UHID repeats across admissions two unrelated claims could match each other. *(Caught by testing, not by inspection.)*

### `looksLikeHeaderRow()` guard
A row whose filled cells are >30 % dates / money / references / bank refs is **data, not a header**. Without this a header-less file loses its first record to a phantom header — the exact silent data-loss the acceptance criteria call out.

### Header sanity-check
A heading can be wrong. When a column's values flatly contradict the field its header bound it to, the binding is dropped and content detection redoes it — and the user is told.

This is **deliberately narrow**: only unmistakable *text* shapes (status words, person names) override a heading. Numeric shapes never do, because an Excel date serial, a long numeric claim id and a rupee figure are all "just numbers". My first attempt was broader and broke 10 previously-passing tests on correctly-labelled files; the narrow version is what shipped.

### Field competition
`mapHeaderRow()` previously assigned fields in object-key order, so the first field to claim a column won. A header of `Reference` — a perfect claim label (score 100) — was also a weak substring hit for "payment reference" (score 60) and **silently became the UTR column, swapping two fields at once**. Fields now compete and the highest score wins.

---

## 4. Problem 3 — Intelligent row-level matching

Unchanged and still enforced: exact → normalised → cautious unique partial; Low confidence is withheld, never auto-applied.

Extended with:
- **Multi-column indexing** — up to 3 reference-looking columns per sheet are indexed, so `Claim No.` and `Case ID` on the same sheet both work.
- **Row-level rescue** — if the mapped column is blank but another cell clearly holds a reference, it's used. **Gated to irregular layouts only** (`mode !== 'header'`): when a sheet has a properly named claim column, a blank cell means "no claim number yet" and must stay blank. Hunting for a substitute would invent a match. *(This gate was added after the broad version broke the "blank claim number counted" test.)*

Identifier family recognised (all tested): `Claim No.`, `Claim Number`, `Case No.`, `Case Number`, `Case ID`, `Case Id`, `Claim Id`, `CLAIM_NO`, `claim/case no`, `Claim Ref`, `Reference`, `Registration ID`.

Blocked from ever being a reference (all tested): `UTR`, `UHID`, `Bill No.`, `Claim Amount`, `Claim Approved Amount`, `Hospital Account Number`, `Payment Date`, `Case Status`, `Beneficiary Name`.

---

## 5. Field Provenance — verified by test

| Field | Source | Verified |
|---|---|---|
| UTR | **CSV/portal only** | ✓ |
| Approved Amount | **CSV only**, Claim Approved → Paid → Preauth | ✓ + source column named |
| Payment Date | **CSV only** | ✓ |
| Bill No. | **Tracker** | ✓ |
| UHID | Tracker first, CSV fallback, else **blank** | ✓ both paths |
| Patient Name | Tracker first, CSV fallback | ✓ |
| Status | CSV wording wins for terminal states | ✓ |

No field is ever fabricated — missing stays blank.

---

## 6. Outputs

Eleven reports (was 7). New: **Unmatched Tracker Rows** — claims in the tracker with no payment anywhere, the list an accounts team actually chases. Ambiguous rows are deliberately excluded from it (they're pending review, not unpaid). Plus the existing Unmatched CSV Rows, Ambiguous Review List, Reconciliation Summary, Duplicate Report, Settlement Register, Updated Tracker, Pending UTR, Outstanding, Short Payment, Rejection.

Search works across Claim/Case No., UTR, UHID, Patient Name and Bill No., separator-insensitively (`CGHS/2026/IP/0001` finds `CGHS-2026-IP-0001`).

---

## 7. Test Results

| Suite | Tests | Result |
|---|---|---|
| test2 | 99 | ✓ |
| test2b | 74 | ✓ |
| test3 | 86 | ✓ |
| test4 | 99 | ✓ |
| test5 | 153 | ✓ |
| test6 | 125 | ✓ |
| test7 | 111 | ✓ |
| **test8 (new)** | **122** | ✓ |
| **Total** | **869** | **0 failures** |

test8 covers: multi-file upload (7), upload combinations (4), header-less CSV (14), partial/unrecognised headers (6), identifier family (25), match safety (6), field provenance (8), graceful errors (7), outputs (14), search (7), future schemes (3), regression (13).

Regression confirmed intact: billing generation, CGHS priority ordering + rate lock, **1998 master codes**, PDF generation, **60/20/12/12 letterhead margins**, Excel writer, all view routing, cloud sync, security, zero mobile overflow, zero runtime errors, **zero network requests**.

---

## 8. Limitations

1. **Header-less amount columns are a genuine guess.** With several numeric columns and no headings, the one with the most non-zero values is used and a warning is shown naming every candidate. Add a heading if it matters.
2. **Bare Excel serials aren't dates** in header-less files (see §3). A dated column with a heading works normally.
3. **No fuzzy/typo matching** — `CLM001` vs `CLM0O1` won't match. Unsafe on financial identifiers.
4. **Partial matching stays conservative** — digit cores under 6 digits are never used.
5. **Row rescue only fires on irregular layouts** (§4) — intentional, to protect deliberately-blank claim cells.
6. **Filename routing is best-effort** — anything unrecognised goes to "Other" and still merges; you can also drop into a specific slot.
7. **Manual ambiguity confirmations are session-scoped.**
8. **Ayushman / ECHS / PSU vocabularies are registered but untested** against real files — CGHS remains the only active scheme.

---

## 9. Implementation Summary

Refactor, not rebuild — the matching engine's tiering and provenance rules are unchanged. The work sits in two places: a content-classification layer under the header mapper, and a list-based file model in the settlement module.

Three bugs were found by testing rather than inspection, and each was a silent-wrong-data bug rather than a crash:
- `Reference` header swapping the claim and UTR columns,
- UHID columns being indexed as claim references,
- a released column being re-taken while another field still owned it.

Two of my own fixes were initially too aggressive and broke existing tests (broad header-contradiction, ungated row rescue). Both were narrowed until the full 869-test suite passed — the conservative versions are what shipped.
