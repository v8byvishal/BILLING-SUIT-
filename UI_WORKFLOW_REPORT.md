# CGHS Billing Suite Pro — UI & Workflow Enhancement Report

**Deliverable:** `CGHS_Billing_Suite_Pro.html` (2.50 MB, single file, 100% offline)
**Version:** 3.1 · **Date:** 27 Jul 2026

**Test result: 259 / 259 automated checks passed, 0 failures**

| Suite | Scope | Result |
|---|---|---|
| `test3.js` | UI & workflow (this phase) | **86 / 86** |
| `test2.js` | Phase 2A (letterhead, PDF, tools) | **99 / 99** |
| `test2b.js` | Phase 2B (billing logic, validation) | **74 / 74** |

---

## 1. No pre-filled patient data ✅

All six fields open empty: BPL/IP, Bill Number, Patient Name, Age/Sex, DOA, DOD.

**Root cause found:** the fields never had `value=` attributes — the app was
**silently auto-restoring the auto-saved draft on every load**, which is what
made the form look pre-filled. That behaviour is removed. The form is now
always blank on load; an existing draft is *offered* (toast + enabled
"Restore Last Draft" button) rather than applied.

Verified by seeding a draft, reloading, and asserting every field is still `''`.

## 2. Placeholders ✅

| Field | Placeholder |
|---|---|
| BPL/IP Number | `Enter BPL/IP Number` |
| Bill Number | `Enter Bill Number` |
| Patient Name | `Enter Patient Name` |
| Age / Sex | `Example: 71Y / M` |
| D.O.A | `Select Admission Date & Time` |
| D.O.D | `Select Discharge Date & Time` |

## 3. Keyboard workflow ✅

`BPL/IP → Bill No → Patient Name → Age/Sex → DOA → DOD → Bill Entry Table`

- **Enter** advances to the next field; from DOD it jumps straight into the
  bill table's first code cell (creating a row if the table is empty).
- **Shift+Enter** walks backwards.
- Date fields normalise on blur *before* focus moves, so pressing Enter after
  typing `20/07/2026 09:30 AM` both formats the value and advances.
- Order is driven by `data-flow` attributes, so it survives layout changes.
- `enterkeyhint` set for mobile keyboards ("next" / "done").

## 4. UI improvements ✅

- Section headings: smaller, wider-tracked, **underlined with a divider rule**.
- Labels: uppercase, 650 weight — standard clinical-software convention.
- Inputs: 10×12 px padding, 14 px text, hover + focus states.
- Cards: 20×22 px padding, 18 px rhythm between sections.
- Body line-height 1.5 with slight negative tracking for denser data screens.
- Red dot markers on mandatory fields, with a "● required" legend.
- Calendar buttons converted from emoji to **inline SVG** so they render
  identically on machines without an emoji font.

## 5. Header branding ✅
Title **CGHS Billing Suite Pro** · Subtitle **Apollo Sage Hospitals**

## 6. Footer branding ✅

Small footer: `CGHS Billing by Vishal` + version, class `no-print`.

**Proof it never reaches PDFs:** the generated PDF was parsed and neither the
extracted text nor the document metadata contains "Vishal"; the HTML print path
was also asserted branding-free. No PDF code path references it.

## 7. Clear Form ✅

Button in the draft bar (also `Ctrl+Shift+X`). Confirmation dialog titled
exactly **"Are you sure you want to clear this bill?"**, listing what will go.

Resets patient data, bill rows, totals, preview and the paste box — then offers
a one-click **UNDO** that restores everything including edit-mode state.
Saved bills are never touched.

## 8. Auto Save Draft (10 s) + Restore ✅

- Fixed **10-second heartbeat** (`AUTOSAVE_INTERVAL_MS = 10000`), plus a 1.2 s
  debounce after typing and a last-chance save on tab-hide/close.
- Writes only when content actually changed (signature comparison).
- Live status bar: *Auto-save ready → Unsaved changes → Saving… → Draft saved
  2s ago*, with a colour-coded dot.
- **Restore Last Draft** button shows a preview (patient, bill no, row count,
  save time) before restoring, and respects the unsaved-changes guard.
  Shortcut `Ctrl+Shift+R`.

## 9. Mandatory validation before PDF ✅

`MANDATORY_FIELDS` = **BPL/IP Number, Bill Number, Patient Name, D.O.A**
(Bill Number and DOA were previously only warnings — now hard blocks.)

On an attempted save/PDF the app shows **"Required fields missing"** listing
each one, paints the offending fields red with inline messages, and focuses the
first one. The red state clears the moment a field is filled. Age/Sex and D.O.D
remain optional warnings. A DOA that is present but unparseable is also blocked.

---

## Modified files

| File | Changes |
|---|---|
| `src/body.html` | Placeholders, `data-flow` order, required dots, draft bar, Clear Form + Restore buttons, footer, SVG calendar icons |
| `src/app.css` | Typography/spacing tokens, card & label restyle, required-dot, invalid-field state, draft bar, footer, flex page layout |
| `src/js/01-core.js` | 10 s auto-save engine (`writeDraftNow`, `startAutoSaveHeartbeat`, `draftSignature`), `MANDATORY_FIELDS` + `missingMandatoryFields()`, stricter `verifyBill()` |
| `src/js/02-datetime.js` | `setDateField()` clears the field's error state |
| `src/js/04-bills.js` | `highlightMandatory()`, `clearFieldError()`, required-fields dialog |
| `src/js/08-app.js` | `setDraftStatus`, `clearFormWithConfirm`, `restoreLastDraft`, `bindKeyboardFlow`, no-auto-restore init, new shortcuts |
| `test3.js` | New 86-check suite |

Preserved untouched: CGHS calculations, 1,998-code master DB, PDF generation
and 60/20/12/12 mm letterhead layout, search, dashboard, Excel export/import,
backup/restore, code mapping, auto-calculations, priority ordering, rate lock,
duplicate detection, edit/audit workflow.

## Known limitations

1. **Enter-to-advance** applies to the patient-details block. Inside the bill
   table, Tab still moves between cells (browser-native behaviour).
2. The **10-second timer** starts at page load; a field edited 1 s before the
   tick is saved on that tick (worst case ~10 s of exposure, mitigated by the
   1.2 s debounce and the save-on-hide handler).
3. **Only one draft slot** is kept — restoring overwrites the working form, and
   a new auto-save replaces the previous draft.
4. **Clear Form UNDO** lives in the toast; once it times out (~6 s) the clear is
   final, though the previous draft may still be recoverable via Restore.
5. The unsaved-changes browser prompt on tab close uses fixed browser wording.
