# CGHS Billing Suite VNEXT — Rule Preservation Register

Phase 3 implements deterministic internal planning only. No rule writes to the live portal.

## Source policy

- `app (1).py` remains the untouched legacy parser/enhancement baseline.
- `CGHS_Billing_Suite_Pro.html`, root `main.js`, and root `preload.js` remain untouched references.
- The embedded 1,998-record HFOS `MASTER_CGHS` snapshot has no verified official filename, effective date, or version. It is loaded as `RATE_SOURCE_UNDEFINED`, not labeled official, and cannot generate financial amounts.
- Rate-source duplicate conflicts fail explicitly; no version/rate is silently selected.
- Custom/local entries require code, explicit value, reason, creator, and timestamp. They are `CUSTOM/LOCAL`; source records remain intact, and a colliding code is refused unless audit explicitly sets `override_authoritative: true`.

## Implemented legacy rule ports

| New rule | Legacy source | Deterministic behavior |
|---|---|---|
| `CN002_ROOM_BED` | `app (1).py` room-rent parser and CN002 aggregation | ICU evidence row × 3 plus supported ward evidence row × 2 |
| `CC001_ICU_ROOM_RENT` | `app (1).py` CC001 room-rent derivation | Count applicable ICU evidence rows |
| `WC001_WARD_ROOM_RENT` | `app (1).py` WC001 room-rent derivation | Count supported ward evidence rows |
| `CC002_OXYGEN_ROW` | `app (1).py` oxygen handling | HALF DAY/12 hours = 12; FULL DAY/24 hours = 24; unqualified oxygen = legacy 1 |

Structured Bed Details is preferred over duplicate Room Rent text evidence. Supported ICU terms are ICU/CCU/PICU/MICU. Supported ward evidence is AC Multibeds, Single, General Ward, or explicit Ward. HDU and unknown categories are `REVIEW_REQUIRED` because their exact classification is not established. If ambiguous evidence exists, room-derived quantities are withheld rather than guessed.

CC002 requires both C002/CC002 syntax and oxygen service/context evidence. A row containing both HALF and FULL phrases is `REVIEW_REQUIRED`.

## Rejection and exclusion

- Raw CN002 is `REJECTED_BY_RULE`; final quantity derives from Room Rent/Bed evidence.
- Raw CC001/WC001 is `REJECTED_BY_RULE`; final quantity derives from required context.
- Raw C002/CC002 is not directly counted; qualifying oxygen rows are evaluated by the CC002 rule and non-oxygen rows are rejected.
- Patient Payable sections/items remain `EXCLUDED_BY_SECTION` and never enter direct candidates or special rules.
- Unknown, malformed, unresolved compound, missing-rate, and source-undefined states remain explicit in the plan.

## Compound policy

Phase 3 consumes Phase 2 compound components. It may look up each syntactic base token, but does not assign meaning to `+L`, combine component rates, or turn the expression into an authoritative code. Such expressions remain `UNRESOLVED_COMPOUND` / `RULE_UNDEFINED` with raw text and component results preserved.

## Phase 4 execution policy

Phase 4 does not add business rules. It accepts only the final Phase 3 `EnhancementPlan` and blocks unknown, unresolved, undefined, review-required, malformed, unsupported, and Patient Payable/excluded records. Only `SOURCE_VERIFIED` and `RULE_VERIFIED` actions with positive integer final quantities may cross the adapter. CN002, CC001, WC001, and CC002 remain exclusively Phase 3 decisions.

The existing Python Selenium executor remains authoritative for procedure search, speciality synchronization, quantity/locked-field handling, duplicate guards, recovery, diagnostics, reconciliation, and portal-row verification. Success is only `EXECUTED` after verified portal state or `ALREADY_PRESENT` after reconciliation; clicks and absence of exceptions are insufficient. Failures, unknown outcomes, blocked records, review records, and partial batches remain explicit.

## Phase 5 parsing policy

- Wrapped rows are joined only when an explicit code label ends in an incomplete expression and the immediate next line is syntactically a code continuation.
- OCR spacing is normalized only inside an evidenced code token; raw text and all source lines remain available.
- Repeated `+` components are tokenized but their semantics remain `RULE_UNDEFINED`; no compound expansion is inferred.
- Code-like references embedded in prose are not candidates. No valid-code blacklist and no nearest-rate-code guessing is permitted.
- A structured service row with quantity but no code becomes `REVIEW_REQUIRED` / `POSSIBLY_MISSING_CODE`; the parser never inserts a code.
- Duplicate aggregation remains separated by semantic section and happens only after Patient Payable exclusion.
- CN002, CC001, WC001, and CC002 meanings are unchanged.

## Phase 6 custom/local policy

- Reference lookup wins unless a colliding custom record explicitly records `override_authoritative: true`; reference data is never overwritten.
- Custom resolution is exact-code only. Inactive records resolve as unknown.
- `FIXED` requires a positive integer and may produce `CUSTOM_VALID`; `MANUAL` and `PER_DAY` remain `REVIEW_REQUIRED` because this phase has no arbitrary formulas or inferred duration mapping.
- Missing rates remain undefined. A custom fixed-quantity action may be executable without inventing a financial amount.
- `POSSIBLY_MISSING_CODE` remains an advisory. Reviewing/dismissing it is bill-specific; only explicit Add Custom Code creates a global record.
- Compound expressions remain unresolved and cannot be converted by description similarity or automatic expansion.
- Plans record relevant custom-record fingerprints. A material registry change causes `PLAN_STALE` at the Phase 4 adapter boundary.

## Prohibited scope

No second Selenium engine, selector duplication, credential/login automation, security bypass, final-composition, pharmacy/consumable attachment, AI decision, or Settlement/Reconciliation behavior is implemented. Settlement remains isolated under `src/services/settlement/`.
