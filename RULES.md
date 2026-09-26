# CGHS Billing Suite VNEXT — Rule Preservation Register

Phase 1 implements no CGHS business rules.

- `app (1).py` remains the legacy parser/enhancement baseline and is intentionally untouched.
- `CGHS_Billing_Suite_Pro.html`, root `main.js`, and root `preload.js` remain untouched references.
- No compound-code, Patient Payable, CN002, WC001, ICU, ward, oxygen, rate, pharmacy, consumable, calculation, Selenium, locator, retry, or CDP behavior is copied or changed.
- The authoritative requirement classifications and undefined rules remain in `PRD.md`.
- Any future migration requires fixtures and regression tests before legacy behavior is moved or replaced.
