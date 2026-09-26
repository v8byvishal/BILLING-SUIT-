# CGHS Billing Suite Pro — Phase 2 Report: ZERO AMOUNT MISMATCH

**Artifact:** `CGHS_Billing_Suite_Pro.html` — single file, fully offline
**Version:** 3.2 → **3.3** · Size 3,066,675 → 3,080,759 bytes (+14 KB)
**Test result: 56 / 56 Phase-2 checks + 7 / 7 regression checks — 0 failures**
**Restore point:** `restore/CGHS_Billing_Suite_Pro.v3.2.RESTORE_POINT.html` (added before any edit; v3.1 point also retained)
**Test suite (repeatable):** `tests/phase2_amountguard.test.js` — run with `node tests/phase2_amountguard.test.js`

No UI redesign. No workflow change. Every existing feature verified intact.

---

## 1. AmountGuard — ACTIVATED

```
AmountGuard.policy = {
  amountLock:   true,     // displayed amount must equal rate × qty — always
  calcLock:     true,     // calc violations hard-block saving
  rateLock:    'admin',   // unchanged: approved master rates editable only in Admin Mode
  revisionLock: true      // every save = new revision + append-only audit
}
```

## 2. Protected row shape — every billing row now carries

| Field | Source |
|---|---|
| CGHS Code, Description, Rate, Quantity | existing engine (unchanged) |
| **Calculated Amount** | always rate × qty, recomputed on every render — never typed, never stored as input |
| **Displayed Amount** | asserted equal to Calculated Amount (CORE-CALC critical if not) |
| **Source** | `manual` / `hospital-bill` (portal paste) / `excel` / `settlement` / `rate-master` / `sync` — AI reserved |
| **Revision** | current editing revision |
| **Validation Status** | OK / CODE NOT FOUND / INVALID QTY / AMOUNT MISMATCH / CALC ERROR / OCR CORRECTED |
| **uid** | immutable internal identifier, assigned once, survives re-render/edit/save/reload |

## 3. Never allow wrong amount — enforcement chain (3 layers)

1. **Structural:** the Amount cell has no input — the app cannot even express a typed amount (existing design, verified).
2. **Engine:** `computeRow` recomputes rate × qty every render; a corrupted in-memory amount self-heals (test: "engine self-heals").
3. **AmountGuard:** if state is tampered anyway, `CORE-CALC` / `CORE-NEGATIVE` / `CORE-MISSING-AMOUNT` criticals fire → **row highlighted (existing red/amber flags), difference shown, save buttons disabled, saveCurrentBill returns null with a blocking dialog.**

## 4. Triple amount verification (never silently replaced)

| Cross-check | Rule | Behaviour |
|---|---|---|
| **Hospital Bill** (portal amount captured at paste) | `XVER-HOSPITAL-BILL` | Info note per row: *Hospital ₹X → CGHS ₹Y (difference ±₹Z). Reason: approved CGHS rate × qty applied.* Hospital figure preserved in the record, never overwritten. |
| **Imported Excel** | `XVER-EXCEL-IMPORT` | Warning when an imported bill's current total differs from the Excel total, with original / current / difference / reason. |
| **Settlement Data** | `XVER-SETTLEMENT` | Warning when the bill total differs from the claim amount in the Settlement Master DB (matched by Bill No / BPLIP / Claim No), with original / current / difference / reason. |
| **Current Bill** | `CORE-*` rules | Internal consistency: every amount = rate × qty; total = Σ rows. |

Cross-source differences **inform** (that's the app's purpose — producing the corrected CGHS amount); internal calculation violations **block**.

## 5. Code protection

- Every row's `uid` is immutable and unique — verified that editing one row's code to a code that exists in another row (**CC001 overwrite test**) leaves the other row byte-identical (same uid, same amount) and raises the duplicate flag + existing merge dialog.
- **CNSU100 test:** local-rate consumable code resolves at its Local Rates amount; a replaced amount triggers `CORE-CALC` critical; in-app the amount cannot be replaced at all (recomputed every render).

## 6. Source tracking

Rows: `source` field (`hospital-bill` auto-tagged on portal paste; `manual` default). Records: `sourceMeta { source, device, user, at }` written on every save via `AmountGuard.tagSource`, plus a `guard` stamp recording the active policy at save time.

## 7. Smart Save

`ValidationHub.run()` executes on **every render** (real-time) and again **inside saveCurrentBill**. Critical amount errors → save buttons disabled with tooltip + modal listing each blocker. Zero criticals → save proceeds through the untouched original engine.

## 8. Validation panel (existing area, not redesigned)

The existing panel now appends, after the original content: **⛔ Critical / ⚠ Warning / ℹ Info** sections, each finding showing **[Rule ID] Description · Code · Amount · Fix suggestion**.

## 9. Audit (append-only, never deleted)

New `amount-audit` store (checksummed + backed up by SafeStorage). Every saved revision that changes any amount records: **Old Amount, New Amount, Difference, Reason, Time, User, Revision** — per row (by uid) and for the bill total. Read API: `AmountGuard.auditTrail(billId)`. Existing per-bill `auditLog` and revision counter unchanged and verified still growing.

## 10. Required tests — all simulated, all passing

| Required scenario | Test(s) | Result |
|---|---|---|
| Wrong Rate | engine rejects 999 vs approved 350 | PASS |
| Wrong Qty | zero qty → INVALID QTY, verifyBill error | PASS |
| Wrong Amount | CORE-CALC critical, difference shown | PASS |
| Duplicate Code | flagged, amounts uncorrupted, distinct uids | PASS (3) |
| Amount Overwrite | tampered display → blocked + self-heal | PASS (2) |
| CNSU100 amount replaced | CORE-CALC critical @2500 vs 900 | PASS (3) |
| CC001 overwrite | other row untouched, dup flagged | PASS (3) |
| Manual tampering | blocked save, buttons disabled, unblocks when fixed | PASS (6) |
| Settlement mismatch | claim 10,000 vs bill 700 reported with reason | PASS (2) |
| Excel mismatch | imported 5,000 vs current 350 reported | PASS (2) |
| Hospital Bill mismatch | 900 vs 700 reported, never blocks, never replaced | PASS (4) |

Plus: protected row shape (5), valid-bill save path (4), audit trail (4), activation flags (4), regression (5 + 7 from Phase 1 suite). **Total 63 checks, 0 failures.**

## 11. Every validation rule executed

| # | Rule ID | Severity | Blocks save? |
|---|---|---|---|
| 1 | CORE-MISSING-AMOUNT | critical | **Yes** |
| 2 | CORE-NEGATIVE | critical | **Yes** |
| 3 | CORE-CALC | critical | **Yes** |
| 4 | CORE-ZERO-QTY | warning | via existing engine (qty 0 already blocks) |
| 5 | CORE-UNKNOWN-CODE | warning | via existing engine (unknown code already blocks) |
| 6 | CORE-DUP-CODE | warning | No — existing merge dialog handles it |
| 7 | XVER-HOSPITAL-BILL | info | No — informational by design |
| 8 | XVER-EXCEL-IMPORT | warning | No |
| 9 | XVER-SETTLEMENT | warning | No |
| — | checkDataIntegrity (existing 6 rules) | error/warning | Yes (unchanged) |
| — | verifyBill / verifyTotals (existing) | error/warning | Yes (unchanged) |

## 12. Bugs found & fixed during this phase (disclosed)

- Four latent `window.state && state.x` guards (from v3.2 modules) always evaluated false because `state` is a top-level `const`, not a window property — silently disabled the Excel cross-check and audit `prev` lookup. Fixed to `typeof state !== 'undefined'`. Caught by the tests.

## 13. Recommended next phase

Surface `AmountGuard.auditTrail` in the Saved Bills view (read-only history dialog), run ValidationHub on settlement ingestion rows, then the AI validation phase via `ValidationHub.register()` — the finding contract is stable and proven.
