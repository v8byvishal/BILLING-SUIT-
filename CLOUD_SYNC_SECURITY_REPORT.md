# CGHS Billing Suite Pro — Cloud Sync, Multi-Device, Security & Backup

**Deliverable:** `CGHS_Billing_Suite_Pro.html` (2.71 MB, single file, offline-capable)
**Version:** 3.1 · **Date:** 27 Jul 2026

## Test Results — 635 / 635 passed, 0 failures

| Suite | Scope | Result |
|---|---|---|
| `test6.js` | Security, sync, roles, mobile, backup, files (this phase) | **125 / 125** |
| `test5.js` | Advanced settlement / UTR automation | **153 / 153** |
| `test4.js` | Settlement module baseline | **98 / 98** |
| `test3.js` | UI & workflow | **86 / 86** |
| `test2.js` | Letterhead, PDF, PDF tools | **99 / 99** |
| `test2b.js` | Billing logic & validation | **74 / 74** |

Run in headless Chrome. Cross-device sync was proven with **two independent
browser profiles** (device A → export → device B → merge), not mocked.

---

## Architecture — please read this part

You asked for a "central cloud database". Your application is **one self-contained
HTML file with no backend**, and 635 tests assert it makes **zero network
requests**. I cannot provision a real cloud database that outlives this sandbox,
and embedding someone else's (Firebase/Supabase) would require your own API keys
and would permanently break offline operation.

You chose **shared-folder sync**, which is the right fit. Here is what actually ships:

```
   Desktop PC ─┐                                        ┌─ Android Phone
   Laptop ─────┼──► CGHS_SyncBundle.json ◄──────────────┼─ Tablet
               │    (inside your Google Drive /         │
               └─    OneDrive / Dropbox folder)         ┘
                    ↑ Drive's own app does the transport
                      The billing app never opens a socket
```

**Three sync providers are implemented:**

| Provider | Status | How it works |
|---|---|---|
| **Shared Cloud Folder** | ✅ working now | Reads/writes one JSON bundle in your Drive/OneDrive folder via the File System Access API. Their cloud replicates it. |
| **REST Server** | ✅ built, ships disabled | Paste any endpoint + key in Settings; `GET /sync` and `POST /sync` with the same merge logic. |
| **Multi-tab (BroadcastChannel)** | ✅ working now | Two tabs/windows on one device stay live-synced instantly. |

**Merge strategy:** every `sSet()` write records a revision stamp
`{time, deviceId}`. On merge, each key is resolved **last-write-wins**; bill
records are additionally merged **by id**, so two devices editing *different*
bills never clobber each other. Verified: stale remote data is rejected, newer
remote data is applied, remote-only bills are added while local bills survive.

**Honest limitation:** this is near-real-time, not instant. Propagation speed is
whatever Drive/OneDrive takes to replicate the file (usually seconds). Two
devices editing the *same field* within that window resolve last-write-wins.

---

## Security Features Added

| Feature | Implementation |
|---|---|
| **PIN login** | 4-digit, default owner **Vishal / 2010**. Stored as **salted SHA-256 hash** — the PIN itself is never persisted (asserted in tests). |
| **Session** | Device remembered **24 hours**, then PIN again. Manual lock/logout clears it immediately. |
| **Input** | Hidden (`type=password`), on-screen numeric keypad **and** physical keyboard both work. |
| **Brute-force guard** | Attempt counter, message shows *"Incorrect PIN (attempt N of 5)"*, then a 30-second cooldown. Stored PIN never revealed. |
| **Welcome screen** | Time-aware greeting (Morning ☀️ / Afternoon 🌤️ / Evening 🌙) with matching **inline-SVG** illustration — sunrise, office skyline, night skyline. Soft animation, zero external images. |
| **Delete protection** | Bills, backups, hospital profile, files and audit trail all route through `confirmDelete()` → *"Enter Security PIN to Continue"*. Wrong PIN blocks the deletion. |
| **Roles** | **Owner** (full) and **Mobile Viewer** (read-only, no PIN — your choice). Viewer has 6 tabs hidden *and* server-side-style guards: `saveCurrentBill`, `stlGenerate`, Excel upload, settings and profile all refuse. |
| **PIN management** | Change PIN, Backup PIN settings (hash only), Admin Reset (itself requires the current PIN). |
| **Audit trail** | Login, logout, failed PIN, bill create/edit/delete, settlement generation, Excel upload, report export, backup download, restore, settings & profile changes, file delete — each with date, time, user, role and device. |

---

## Features Added

- **Mobile View-Only Portal** — dedicated phone-optimised tab: search bar,
  4 quick status cards, and results for patient / bill no / claim no / UTR /
  UHID with PDF view + download. Verified at 390 px with **zero overflow across
  all 10 views** (measured with `overflow:hidden` disabled so nothing is masked).
- **Hospital Profile** — name, address, city, phone, email, GSTIN, empanelment,
  accreditation, contact; feeds the bill header and syncs across devices.
- **Daily Backup ZIP** — `database/`, `settings/`, `reports/`, `settlement/`
  (claim + UTR databases), `audit/`, `pdfs/` and a README. Auto-runs once a day,
  **30-day retention**, restore + delete. Verified by opening the ZIP externally.
- **Secure File Library** — every generated PDF, uploaded Excel, settlement
  report, tracker and backup, with preview, download, search and delete.
  Files under 1.5 MB keep their bytes (12 MB cap) so they stay re-downloadable.
- **Auto-save** — existing 10-second draft heartbeat retained; profile, settings
  and settlement state persist on every change.

---

## Bugs Found And Fixed During Testing

1. **Stale sync data could overwrite live data.** Keys that existed locally but
   had never been *re-written* carried no revision stamp, so `lastLocal = 0` and
   *any* remote value — even one timestamped 1970 — won the merge. A device
   restoring an old bundle would have silently wiped newer work. Fixed with an
   install-baseline timestamp for unstamped keys.
2. **Mobile layout overflowed by 547 px.** The new role badge and sync chip made
   the topbar 937 px wide on a 390 px phone. Compounded by `body{display:flex}`
   (added for the sticky footer) making `.app` size to content rather than the
   viewport. Both fixed; now clean at 390/768/1440 px.
3. **`overflow-x:hidden` was masking the problem** — my first check reported
   "0 px overflow" while the screenshot was visibly clipped. I rewrote the check
   to temporarily disable the hidden overflow before measuring.

---

## Files Modified

| File | Change |
|---|---|
| `src/js/10-security-sync.js` | **New, ~1,470 lines** — auth, PIN hashing, lock screen, roles, sync engine (3 providers), merge, hospital profile, file library, daily backup ZIP, mobile portal, audit trail |
| `src/js/01-core.js` | Revision stamping on every `sSet`/`sDel`; `noStamp` option for session-local keys |
| `src/js/03-pdf-print.js` | Generated PDFs registered into the File Library with their bytes |
| `src/js/04-bills.js` | PIN-protected bill delete, owner guard on save, bill lifecycle audit |
| `src/js/07-excel-backup.js` | Report exports registered as files; backup/restore audited |
| `src/js/08-app.js` | Security boot before render, lock gate, new views/tabs, `Ctrl+L`, settings guard |
| `src/js/09-settlement.js` | Owner guards on upload/generate, uploads + exports into File Library, settlement audit |
| `src/body.html` | Lock screen, Mobile portal, Security & Sync view (6 sub-tabs), topbar tools |
| `src/app.css` | Lock screen, keypad, role badge, sync chip, mobile portal, responsive topbar |
| `test6.js` | **New** 125-check suite |
| `test2–test5.js` | Unlock helper added (all now pass through the security layer) |

**Preserved and regression-tested:** billing generation, PDF generation with the
60/20/12/12 mm letterhead, print preview, CGHS code mapping (1,998 codes
byte-identical to your original upload), settlement module, search dashboard,
Excel export/import, backup module, PDF tools, keyboard flow, auto-save, branding.

---

## Remaining Limitations

1. **Sync is near-real-time, not push.** Speed depends on your cloud client;
   there is no server to notify other devices instantly.
2. **File System Access API is Chrome/Edge desktop.** On Firefox/Safari and on
   Android, use **Export/Import Sync Bundle** (a one-tap file share) instead.
3. **The sync bundle is not encrypted at rest** — it relies on your cloud
   account's security. Do not place it in a public folder.
4. **PIN is a workflow guard, not cryptographic protection.** Data lives in
   browser storage; anyone with device + devtools access can read it. It prevents
   *casual* access, not a determined attacker with the physical machine.
5. **Mobile Viewer needs no PIN** (your explicit choice). Anyone who opens the
   app on that device can read data. Switch to a viewer PIN if that changes.
6. **Large PDFs (>1.5 MB) keep metadata only** in the File Library, to protect
   browser storage limits. The 12 MB cap drops the oldest file bytes first.
7. **Deleted records do not propagate as deletions.** The merge is additive by
   design (safer); a bill deleted on device A can return from device B's bundle.
8. **Storage quota** — browsers typically allow 5–10 MB for localStorage. Heavy
   PDF retention can approach this; the Diagnostics panel shows current usage.
