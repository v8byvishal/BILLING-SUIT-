# Feature Map (per view)

| View | Features | Key functions |
|---|---|---|
| Dashboard | KPIs, trend/codes/status charts, activity | renderKpis, renderTrendChart, renderCodesChart, renderStatusChart |
| New Bill | bill entry, paste-parser, validation panel, letterhead PDF, print | parsePastedText, buildRecord, generateBill, renderValidationPanel, buildBillPdf, renderPrintableBill |
| Saved Bills | search/filter/sort, revisions, duplicates, edit, export | renderBillsList, renderSearchHistory, loadRecordIntoForm, formMatchesRecord |
| Reports | Excel report export, KPI summaries | exportExcelReport, excelSerialDate |
| Settlement | ingestion (CSV/XLS/PDF/paste), matching engine, case groups, UTR, audit | ingestCsv, buildMatchIndex, resolveMatch, buildCaseSettlement, stlRenderCaseGroups, matchEngineSelfTest |
| PDF Tools | merge/split/compress PDFs (standalone utility) | pdf-lib based tools |
| Local Rates | local rate table, admin-locked master overrides | saveLocalRates, isRateLocked, saveRateOverrides |
| Mobile | QR/share companion view | qr(...) |
| Settings | app/print/backup settings | saveAppSettings, savePrintSettings, bindBackupUI |
| Security & Sync | lock screen, audit log, backups/restore points, device sync | showLockScreen, auditLog, exportFullBackup, writeRestorePoint, buildSyncBundle, syncNow |
