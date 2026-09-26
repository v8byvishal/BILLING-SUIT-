# CGHS Billing Suite VNEXT — Rule Preservation Register

Phase 2 implements syntactic bill parsing only and no CGHS business rules.

- `app (1).py` remains the legacy parser/enhancement baseline and is intentionally untouched.
- `CGHS_Billing_Suite_Pro.html`, root `main.js`, and root `preload.js` remain untouched references.
- Phase 2 may identify compound syntax, Patient Payable context, pharmacy/consumable section labels, and Bed Details as source data; it does not assign compound semantics or perform CN002, WC001, ICU, ward, oxygen, rate, pharmacy, consumable, or enhancement calculations.
- No Selenium, locator, retry, CDP, or portal behavior is copied or changed.
- The authoritative requirement classifications and undefined rules remain in `PRD.md`.
- Any future migration requires fixtures and regression tests before legacy behavior is moved or replaced.
