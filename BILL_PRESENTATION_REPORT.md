# New Bill — Formal Print Presentation

**Artifact:** `/home/user/CGHS_Billing_Suite_Pro.html` — 2.95 MB, single file, fully offline
**Result:** **1,512 checks passing, 0 failures**
**Scope:** presentation only — no data, label, field or logic change anywhere.

---

## 1. How "no data changed" was proved, not asserted

Before touching anything I captured the current PDF as a baseline, then compared the text layer of the old and new documents token by token:

```
before tokens: 156    after tokens: 156
tokens only in BEFORE: []
tokens only in AFTER : []
IDENTICAL CONTENT
```

Same 156 tokens, same order. Only geometry moved.

A permanent verifier (`work/billshot/verify_pdf.py`, using **pypdfium2** — independent of the app's own PDF code) now checks on the *rendered* page that:

- the 60 mm top / 20 mm bottom / 12 mm side letterhead reserves contain **zero ink on every page**
- the document emits **no colour operators** (strict monochrome)
- all 39 required labels and values are present in the text layer

This runs inside the new test suite, so a future change cannot quietly break it.

---

## 2. What changed — PDF (`03-pdf-print.js`)

| Area | Before | After |
|---|---|---|
| **Title** | 12.5 pt, bare line | 13.5 pt with a short centred rule beneath it |
| **Patient block** | value printed immediately after each label, so the right column started at a different x on every line | labels measured first; values aligned on a **shared tab stop** per column |
| Detail line spacing | 13.5 pt | 14.5 pt, +7 pt before the separator rule |
| **Table head** | 15 pt band, hairline above | 18 pt band, **heavier rule** above to separate head from data |
| **Rows** | 15 pt min, text near the lower rule | 17.5 pt min, roomier leading; single-line rows **optically centred** |
| **Total** | label + figure on a loose line | **boxed band** with a classic **double underline** |
| **Signature** | rule 18 pt under the credit line | rule 30 pt down with real signing clearance |
| QR | floating | aligned to the signature baseline |

Page-break reserve raised from 96 → 118 pt in step with the taller footer, so the block can never spill into the bottom margin.

---

## 3. What changed — screen and browser print (`app.css`)

**On screen:** title 17 px, uppercase, letter-spaced, underscored. The details block became a 4-column `auto / 1fr / auto / 1fr` grid, so labels occupy a fixed column and **values line up** instead of starting wherever the label ends. Labels set in small-caps grey; values in medium weight.

One pre-existing flaw fixed while aligning: a global `table.items input { text-align:right }` was right-aligning the **CGHS code** inputs, so codes sat under the wrong edge of their heading. Codes are a label, not a figure — now left-aligned, matching the printed bill.

**Browser print** (`@media print`, scoped entirely to `#printRoot`): card chrome and shadows removed, pt-based type, heavier rules above the table head and totals, `double 3pt` border under the total, and a signature rule with 20 mm of signing space above the caption. The fallback now reads like the PDF instead of like a screenshot of the app.

---

## 4. Explicitly unchanged

- Every label verbatim: `BILL NO-`, `DATE:-`, `Patient Name:-`, `AGE/SEX :-`, `D.O.A -`, `D.O.D -`, `Length of Stay -`, `Admission Days -`, `CGHS Code`, `Particular`, `Rate`, `Qty`, `Total Amt`, `TOTAL`, `In Words-`, `Authorised Signatory`
- Every value, and the field order
- No field added or removed (asserted: exactly 7 meta labels)
- Billing maths: 8 rows, total ₹4,21,250, CGHS priority ordering (`WC001` first), 1998 master codes
- Letterhead margins 60/20/12/12; monochrome output
- **No other module touched** — settlement, saved bills, reports, dashboard, PDF tools all verified intact

---

## 5. Test results

| Suite | Checks | Result |
|---|---|---|
| test2 / test2b / test3 | 259 | ✓ |
| test4 / test5 / test6 | 378 | ✓ |
| test7 / test8 / test9 / test10 | 422 | ✓ |
| test11 / test12 | 152 | ✓ |
| **test13 (new)** | **39** | ✓ |
| Browser E2E validation | 138 | ✓ |
| Export audit (openpyxl) | 100 | ✓ |
| Edge probes | 24 | ✓ |
| **Total** | **1,512** | **0 failures** |

test13 covers billing logic unchanged (4), on-screen fields (9), typography applied (5), PDF content (3), multi-page (1), browser print (7), scope containment (3), health (3), plus two independent pypdfium2 verifications — 44 sub-checks on the single-page PDF and 17 on a 4-page bill.

---

## 6. Limitations

1. **Print CSS is tuned for A4.** Letter paper will reflow slightly; the PDF path is unaffected.
2. **The double underline under the total uses `border-bottom: double`** in the browser path and two hairlines in the PDF — visually equivalent, not pixel-identical.
3. **Very long particulars still wrap** rather than shrink; row height grows, which is the existing behaviour.
4. **QR alignment assumes the default footer.** Enabling "hospital name in signature" adds a line and shifts the block down slightly.
5. **Screen and print differ by design** — the screen keeps editable inputs, priority chips and status tints; those are working affordances, not part of the printed document.
6. Tested at 8-row and 60-row extremes; not against a real printer.

---

## 7. Files

| File | Change |
|---|---|
| `work/src/js/03-pdf-print.js` | title rule, tab-stop patient block, taller head/rows, boxed total, footer clearance, reserve raised |
| `work/src/app.css` | bill-head/meta grid, code alignment, full `@media print` restyle |
| `work/test13.js` | **new** — 39 tests |
| `work/billshot/verify_pdf.py` | **new** — independent reserve / monochrome / content verifier |
