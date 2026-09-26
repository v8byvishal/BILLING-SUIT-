# Report Mapping Fix — Semantic Amounts + Clean Settlement Output

**Artifact:** `/home/user/CGHS_Billing_Suite_Pro.html` — 2.94 MB, single file, fully offline
**Result:** **1,473 checks passing, 0 failures**

---

## 1. Why Claim Amount read 1, 2, 3, 4…

Reproduced before changing anything, using a tracker shaped like yours
(`S.No | Bill No | Date | UHID | Patient Name | Bill Type | Bill Amount | PAYER | Auth Amt 1 | OPERATOR | CASE ID`):

```
claimAmount@A "S.No" (100, content)     ← the row counter won the money slot
approved@I    "Auth Amt 1"              ← the real amount went to the wrong field
profile: 0:money  6:money  8:money      ← three "money" columns, counter included
```

**Three separate faults, not one:**

| # | Fault | Fix |
|---|---|---|
| 1 | `S.No` is numeric, so it passed every money test and won column A | new `serial` column kind |
| 2 | `Auth Amt 1` was registered under **approvedAmount** (portal side) | moved to `claimedAmount` (tracker side) |
| 3 | Nothing preferred a *populated* amount column over an empty one | value-based disambiguation |

---

## 2. Fault 1 — row counters are not money

`looksLikeSerialColumn()` detects a counter structurally: small integers, no decimals, no repeats, either ascending by one or the set 1..n. Such a column becomes kind `serial`, and `contentEvidence()` refuses it for **every** field except the new canonical `serialNo`. A serial column also actively contradicts any money/identity heading.

**A bug my own fix introduced, caught by regression:** Excel date serials `46185, 46186, 46187` are consecutive integers too, so the detector swallowed the tracker's Date column. Values inside the Excel epoch window (20000–80000) are now excluded — a real S.No starts near 1 and never reaches 20000.

---

## 3. Fault 2 — "Authorised" belongs to the tracker

The authorised amount on a hospital tracker is what the **hospital claimed**, not what the **portal approved**. The wording overlaps, but the side does not. Moved to `claimedAmount`:

`Auth Amt` · `Auth Amt 1` · `Auth Amount` · `Auth Amount 1` · `Authorised Amount` · `Authorized Amount` · `Authorised Amt` · `Authorisation Amount` · `Entitled Amount` · `Claim Amount` · `Bill Amount`

`approvedAmount` now holds only genuine portal wording: `Claim Approved Amount` · `Approved Amount` · `Approved Amt` · `Sanctioned Amount` · `Claim Paid Amount` · `Settled Amount` · `Preauth Approved Amount`. All 16 verified individually.

---

## 4. Fault 3 — choosing between several amount columns

When more than one money column exists, the header choice is re-checked against the values: a column that is **entirely zero** loses to a populated one, and the reason is recorded (`the column headed "Approved" is entirely zero, so the populated amount column D was used instead`). With two populated columns, the claim-amount wording still wins.

---

## 5. Verified end to end

| Bill | Claim Amount (tracker) | Approved Amount (portal) | Short | Status |
|---|---|---|---|---|
| OP-3001 | ₹1,450 | ₹1,450 | — | Settled |
| OP-3002 | ₹2,100 | ₹1,900 | ₹200 | Partially Approved |
| OP-3006 | ₹3,400 | — | — | Not Found |

Totals: claim **₹18,200** (sum of `Auth Amt 1`), settled **₹11,850** (sum of portal approvals). No row equals its own row number.

---

## 6. Clean report

**Before:** Bill No · UHID · Patient Name · Claim Number · Claim Amount · UTR · Settlement Date · Settlement Amt · Short Pay · Status · **Confidence · Age · Operator** · Remarks (14)

**After:** Claim / Case No · Patient Name · UHID · Bill No · **Claim Amount · Approved Amount** · Short Pay · UTR · Payment Date · Status · Remarks (11 max)

- Claim Amount and Approved Amount are **separate, adjacent, never merged**.
- Missing values show an em-dash, not `₹0` — a blank and a genuine zero are different facts.
- Columns empty for *every* row (UHID, Bill No, Short Pay, Remarks) are **dropped entirely**.
- Confidence / Ageing / Operator moved out of the sheet; confidence remains as a filter and in the case-group and debug views. Their now-orphaned filter controls were hidden so the filter bar matches the report.
- The `.xlsx` register, filtered export and CSV all follow the same layout, with totals under the correct columns.

---

## 7. Test results

| Suite | Checks | Result |
|---|---|---|
| test2 / test2b / test3 | 259 | ✓ |
| test4 / test5 | 253 | ✓ |
| test6 / test7 / test8 | 359 | ✓ |
| test9 / test10 / test11 | 273 | ✓ |
| **test12 (new)** | **67** | ✓ |
| Browser E2E validation | 138 | ✓ |
| Export audit (openpyxl) | 100 | ✓ |
| Edge probes | 24 | ✓ |
| **Total** | **1,473** | **0 failures** |

The openpyxl audit caught the renamed export columns that the browser tests missed — it reads the workbook by column name, independently of the app.

Four stale assertions updated (test4, test5, test7, audit_exports) — all were asserting the old column names, and each was checked against live output before changing.

---

## 8. Limitations

1. **Serial detection needs ≥3 rows.** A 2-row tracker cannot be judged; a counter there could still be read as money.
2. **A counter numbered 20000–80000 will be treated as a date column** — the Excel-epoch exclusion trades that unlikely case for the common one.
3. **Zero-vs-populated is the only value-based amount tie-break.** Two populated columns are still decided by header wording; if a tracker's "Bill Amount" and "Auth Amt 1" differ, the authorised figure wins by design.
4. **Column visibility is per-view** — filtering to rows that all lack a UHID hides the column for that view.
5. **"Shared" appears in the Approved column** for bills covered by a case-level payment; the amount is booked once on the owning bill.
6. **Operator and Ageing filters are hidden, not removed** — they still function if re-enabled, and existing tests reference them.

---

## 9. Files

| File | Change |
|---|---|
| `work/src/js/11-match-engine.js` | `looksLikeSerialColumn()`, `serial` column kind, Excel-epoch guard |
| `work/src/js/13-schema.js` | `Auth Amt` family → `claimedAmount`; `serialNo` canonical field; serial contradiction; money disambiguation; tracker role priority |
| `work/src/js/09-settlement.js` | clean report table with empty-column suppression; register/CSV/filtered exports realigned |
| `work/src/body.html` | orphaned filter controls hidden |
| `work/src/app.css` | `.stl-blank` em-dash styling |
| `work/test12.js` | **new** — 67 tests |
| `work/rep/` | fixtures with `S.No` + `Auth Amt 1` |
| `test4.js`, `test5.js`, `test7.js`, `val/audit_exports.py` | stale column assertions updated |
