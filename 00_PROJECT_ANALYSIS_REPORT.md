# CGHS Billing Suite Pro — Project Import & Analysis Report

**Date:** 30 Jul 2026 · **Step:** Import & Analysis only — **zero source changes made**
**Active workspace:** `/home/user/CGHS_Billing_Suite_Pro/`

---

## 1. Import Summary

| Item | Result |
|---|---|
| ZIP file uploaded | **No ZIP was received.** The upload contained loose files (main HTML + package.json + 15 reports). |
| Action taken | All project files were imported directly into `/home/user/CGHS_Billing_Suite_Pro/` — equivalent outcome, nothing lost. |
| Files imported | `CGHS_Billing_Suite_Pro.html` (3.0 MB), `package.json`, `package-lock.json`, 15 module reports → `docs/` |
| Source modified? | **No.** Byte-identical copies. |

### Workspace layout
```
CGHS_Billing_Suite_Pro/
├── CGHS_Billing_Suite_Pro.html     ← the complete application (single file)
├── package.json                    ← dev/test tooling only (jsdom, puppeteer)
├── package-lock.json
└── docs/                           ← 15 historical module reports (md)
```

---

## 2. Technology Detection

| Aspect | Finding |
|---|---|
| **Type** | Single-file offline web application (HTML + CSS + vanilla JavaScript) |
| **Framework** | None — pure DOM/vanilla JS, ~470 named app functions, 18,969 lines total |
| **Runtime** | Any modern browser; 100% offline; no external network resources referenced |
| **App version** | `APP_VERSION = '3.1'` (UI strings also mention v3.3) |
| **package.json role** | Not part of the shipped app — only test tooling (`jsdom ^29`, `puppeteer ^24`) used by the previous automated check suites |

## 3. Entry Point & Internal Structure

One HTML file with 3 `<style>` + 3 `<script>` blocks:

| Block | Lines | Content |
|---|---|---|
| Style 1–2 | 10 – 1015 | Full theme (light/dark via `data-theme`), design tokens, print styles |
| Body markup | 1017 – 2387 | 10 views + navigation tabs |
| Script 1 | 2388 – 4762 | **Embedded libraries:** pdf-lib v1.17.1 (PDF create/merge/split), pdf.js incl. worker (PDF reading), an XLSX writer (OOXML built by hand around line 8980) |
| Script 2 | 4765 – 4768 | `window.MASTER_CGHS` — embedded master rate list, **1,998 CGHS codes** with descriptions + NABH rates |
| Script 3 | 4771 – 18967 | The application: engine, parser, state, storage, UI, all modules |

### Views (10 tabs — the complete feature surface)
`Dashboard` · `New Bill` · `Saved Bills` · `Reports` · `Settlement` · `PDF Tools` · `Local Rates` · `Mobile` · `Settings` · `Security & Sync`

## 4. Key Subsystems Identified (all confirmed present in code)

| Subsystem | Evidence (functions) |
|---|---|
| Billing engine | `round2`, `buildRecord`, `generateBill`, `saveCurrentBill`, `renderBillSheet`, `renderValidationPanel` |
| Bill PDF / letterhead export | `buildBillPdf`, `exportRecordPdf`, `renderLetterheadPreview`, `buildPdfFilename`, `renderPrintableBill` |
| Universal ingestion (Excel/CSV/PDF/paste) | `ingestCsv`, `ingestCsvBatch`, `importBillsFromSheet`, `parsePastedText`, `generateOcrVariants`, `showImportPreview`, `runImportGate` |
| Settlement + matching engine | `buildMatchIndex`, `resolveMatch`, `buildSettlementRow`, `nameMatchLevel`, `uhidMatchLevel`, `looksLikeUtrValue`, `matchEngineSelfTest` (built-in self-test) |
| Case-group engine | `groupByCaseRef`, `buildCaseSettlement`, `stlRenderCaseGroups`, `caseGroupDebugText` |
| Reports / Excel export | `exportExcelReport`, `excelSerialDate`, KPI + trend/codes/status charts (`renderKpis`, `renderTrendChart`…) |
| Backup & restore | `collectBackupData`, `exportFullBackup`, `importFullBackup`, `writeRestorePoint`, `runScheduledBackups`, `buildBackupZip`, `downloadDailyBackup` |
| Security / lock / audit | `showLockScreen`, `auditLog`, `isRateLocked`, admin-mode rate lock, `rateOverrides` (admin-approved master overrides) |
| Sync (multi-device) | `buildSyncBundle`, `mergeSyncBundle`, `syncPush/Pull/Now`, `queueAutoSync`, per-key revision stamps (`SYNC_META`, `stampKey`) |

## 5. Data & Storage

| Aspect | Finding |
|---|---|
| Backend | `localStorage` behind an async `storage` adapter (`sGet`/`sSet`/`sDel`) — pluggable: uses `window.storage` if a host provides one |
| Keys | `local-rates`, `bills-index`, `bill:<id>`, `print-settings`, `app-settings`, `backup-settings`, `search-history`, `pdf-history`, `activity-log`, `error-log`, `rate-overrides`, `sync-meta`, plus `cghs-backup-*`, `cghs-snapshot-*`, `cghs-activity-*` |
| Record safety already present | Bills carry `createdAt`, `modifiedAt`, `status`, `revision`, `originalRef`, `codeSig`; index migration on load; audit trail (`editingAudit`) |
| Master data | 1,998-code CGHS rate list embedded; local rates + admin-locked overrides layered on top |

## 6. Build System, Dependencies, Assets, Configuration

- **Build system:** none needed — the HTML file *is* the deliverable. `package.json` is test-harness-only.
- **Runtime dependencies:** all vendored inline (pdf-lib, pdf.js + worker, XLSX writer). No CDN/network calls found.
- **Assets:** none external; icons/charts are inline SVG/CSS.
- **Configuration:** all in-app via Settings/Security views, persisted to storage keys above.

## 7. Health Check (read-only smoke test)

Loaded the file in a headless DOM (jsdom): scripts execute, all 10 views and tab buttons render, `MASTER_CGHS` = 1,998 codes, PDFLib + pdf.js initialise. Only finding: a benign `scrollTo not implemented` jsdom warning (not a real browser issue). **The application is intact and functional as imported.**

## 8. History (from the 15 bundled reports)

The project evolved through documented phases — Phase 2B → UI/Workflow → Settlement Manager → Matching Engine → Robust Settlement → Universal Reader → Ingestion Engine → Case-Group Engine → Report Mapping Fix → Engine Audit → Bill Presentation → Advanced Settlement/UTR → Cloud Sync & Security — with self-check counts growing from 173 to **1,578 checks passing, 0 failures** (Engine Audit).

## 9. Observations Relevant to a Future Upgrade (no action taken)

1. **PDF Tools** (`view-pdftools`, line 1693) and **Mobile** (`view-mobile`, line 2110) exist as full views — these are the modules you previously asked to remove; they are clearly delimited and removable without touching other views.
2. Storage is `localStorage`-backed — a size-limited, plain-text store; candidates for hardening: quota handling, encryption at rest, atomic writes.
3. Revision/audit scaffolding already exists (`revision`, `originalRef`, `auditLog`) — a good base for the never-overwrite policy.
4. Amount protection groundwork exists (`isRateLocked`, admin `rateOverrides`).
5. The single-file design (3 MB) is the project's core convention — any upgrade should preserve it.

---

**No code was changed. Awaiting your approval and upgrade instructions before touching anything.**
