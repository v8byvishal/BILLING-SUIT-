# Case-Group Settlement Engine — Implementation Report

**Artifact:** `/home/user/CGHS_Billing_Suite_Pro.html` — 2.94 MB, single file, fully offline
**Result:** **1,405 checks passing, 0 failures**

---

## 1. The assumption that was removed

The old engine matched **one tracker row → one portal row** by claim reference. That silently assumed *1 case ID = 1 patient = 1 bill*, which is wrong for OPD.

New module `15-casegroup.js` (625 lines) treats the case reference as a **grouping key**:

```
groupByCaseRef()        bills + payments bucketed by normalised case ref
splitPatientSubgroups() identity clusters inside each bucket (UHID → name)
allocatePortalRows()    global assignment of payments to bills
classifyGroup()         single/multi bill · single/multi patient
buildCaseSettlement()   the pass, with a per-case decision trace
```

Identity priority inside a group, as specified: exact UHID (60) → exact name (45) → reordered name (32) → bill number (40) → amount (18). Contradictions score negative and block.

---

## 2. The money bug this design creates — and how it's contained

If one payment covers three bills, copying its amount onto each bill **triples the settled total**. That is the central hazard of grouping, so it is handled explicitly:

- **UTR and payment date go on every bill** — they are shared facts.
- **The amount is booked once**, on the first bill of the case (deterministic ordering).
- Covered bills are marked `sharedPayment`, status `Settled`, and are **excluded from short-payment maths** — otherwise each would show a 100% shortfall against zero.

Verified against ground truth: settled total = **₹14,300**, exactly the sum of the 7 distinct payments applied, with no multiplication.

---

## 3. Duplicate vs grouped — the distinction that had to change

A repeated case ID used to mean "Duplicate Claim". It no longer does:

| Situation | Old | New |
|---|---|---|
| One case ID, 3 bills, same patient | Duplicate Claim ✗ | **Settled**, grouped ✓ |
| Same bill number twice | Duplicate Claim | **Duplicate Bill Number** |
| One case ID, different patients | Duplicate Claim | **Case ID Shared By Different Patients** |
| One UTR across bills of one case | Duplicate UTR ✗ | normal case-level payment ✓ |
| One UTR across *different* cases | Duplicate UTR | **Duplicate UTR** ✓ |

---

## 4. Allocation: three failed attempts before the right one

Deciding pair-by-pair kept failing in one of two opposite directions, and I patched it twice before recognising the shape of the problem:

1. **Greedy by score** — silently picked between two rival payments for one bill.
2. **Pairwise "is a rival close?"** — then flagged two bills / two payments of the *same patient* as ambiguous, when the amounts made the pairing obvious.
3. **Excluding amount from the tiebreak** — fixed (2), broke (1) again.

The mistake was treating ambiguity as a property of a *pair*. It is a property of the *solution*. The engine now scores the full matrix, takes the best complete assignment, and asks whether an **equally good alternative assignment** exists.

The two cases are then separated by cardinality, not by score:

- **Same set of payments used, different permutation** → amount may decide (two bills, two payments — obvious).
- **A different payment would be dropped** → undecidable, held for review (one bill, two rival payments — the engine must not choose which payment is "the" settlement).

Guarded with a brute-force cap (`nT × nP > 400` falls back to greedy).

---

## 5. Two threshold judgements worth stating

**`AGREE_STRONG` lowered to 44.** Inside a case group the reference has already narrowed the field, so one decisive signal — an exact UHID *or* an exact name — is enough. Requiring two stranded ordinary rows where the portal publishes no UHID.

**A contradicting UHID no longer always blocks.** In your fixtures `UH500104` vs `UH500102` appears with the same case ID, same patient name and same amount — a two-digit transposition. Two patients coincidentally sharing all of that is far less likely than one typo. The pairing is now accepted at **Medium** confidence with the discrepancy stated, rather than dropped. A UHID mismatch *without* corroboration still blocks hard.

---

## 6. Reports and debug

**Case Group View** (Reports tab): one row per case — bills, payments, patients, names, UHIDs, approved total, decision — colour-coded, filterable by type, with a per-case detail modal showing every bill, every unmatched payment, and the full trace.

**Case Group Report** export: 3 sheets — case summary, every bill inside every case (with `Amount Booked Here`), and shared case IDs. "Download All" is now 12 reports.

**Debug trace** per case, copy-to-clipboard:
```
=== CASE/2026/OP/0002
  classification : Single patient, multiple bills
  tracker bills  : 3   portal rows: 1
  patients       : MRS. MULTI BILL
  UHIDs          : UH700102
  NOTE: one payment covers several bills (amount booked once)
  | bill OP-1003 -> shared payment : Covered by the single case-level payment...
```

---

## 7. Test results

| Suite | Checks | Result |
|---|---|---|
| test2 / test2b / test3 | 259 | ✓ |
| test4 | 100 | ✓ |
| test5 / test6 | 278 | ✓ |
| test7 / test8 | 233 | ✓ |
| test9 / test10 | 188 | ✓ |
| **test11 (new)** | **85** | ✓ |
| Browser E2E validation | 138 | ✓ |
| Export audit (openpyxl) | 100 | ✓ |
| Edge probes | 24 | ✓ |
| **Total** | **1,405** | **0 failures** |

Performance: 5,000 rows = 808 ms parse / 214 ms match / 1,536 ms pipeline. Match time rose from 60 ms (grouping + assignment search); still well inside budget.

---

## 8. Existing assertions that were WRONG and had to be corrected

Three old tests encoded the one-row-one-case assumption. I verified each against the fixture data before changing it:

**test4** — claim `…3194` sits on two different patients (KAMAL SINGH, KIRAN BALA). The old engine gave the portal's UTR to **both** and its `expSettled` counted ₹153,390 **twice**. Now only KAMAL SINGH — whom the portal names — is paid; KIRAN BALA is correctly unpaid. Settled total drops by a full payment, pending rises by ₹51,200.

**test8** — expected High confidence on a row whose UHIDs disagree. Now Medium, which is honest.

**validate_e2e / audit_exports** — expected the label "Duplicate Claim Number"; the export now says "Case ID Shared By Different Patients".

---

## 9. Limitations

1. **Which bill owns a case-level amount is a convention** (first bill in tracker order), not a derived fact. Per-bill apportionment is not attempted — the portal does not say how the lump sum splits.
2. **Assignment search is capped** at `nT × nP > 400`; beyond that a greedy fallback runs and may miss an ambiguity.
3. **`IDENTITY_MARGIN = 10` is a tuned constant**, validated against these fixtures only.
4. **The UHID-typo softening could mask a genuine mix-up** if two different patients truly share a case ID, a name and an amount. Confidence is Medium and the discrepancy is printed, but it is not withheld.
5. **Patient clustering is transitive** — A~B and B~C puts all three together even if A and C never matched directly.
6. **Date is collected but not used as a tie-break**; UHID/name/bill/amount decide first.
7. **Manual confirmation of a contested case is not yet wired** into the Ambiguous Matches screen — contested bills appear there, but resolving one does not re-run the group.
8. **Tested against synthetic OPD fixtures**, not a real CGHS OPD export.

---

## 10. Files

| File | Change |
|---|---|
| `work/src/js/15-casegroup.js` | **new** (625) — grouping, identity, allocation, classification |
| `work/src/js/09-settlement.js` | `stlProcess` rewired to case groups; duplicate semantics; Case Group View + export |
| `work/src/body.html` | Case Group View card, filter, buttons |
| `work/assemble.py` | module order |
| `work/test11.js` | **new** — 85 tests |
| `work/opd/` | OPD fixtures covering all seven case shapes |
| `work/test4.js`, `test8.js`, `validate_e2e.js`, `val/audit_exports.py` | stale assertions corrected (§8) |
