# Dependency Map

## Embedded runtime libraries (script block 1, lines 2388–4762)
| Library | Version | Used by |
|---|---|---|
| pdf-lib | 1.17.1 | Bill PDF export (`buildBillPdf`, `exportRecordPdf`), PDF Tools view |
| pdf.js + worker | bundled | PDF reading: Universal Reader / ingestion, PDF Tools view |
| Inline XLSX writer | custom | `exportExcelReport`, settlement exports |

## Embedded data
| Data | Size |
|---|---|
| `window.MASTER_CGHS` | 1,998 CGHS codes with rates (script block 2) |

## External network dependencies
**None** — fully offline.

## Dev-only (package.json — not shipped)
jsdom ^29 (headless tests), puppeteer ^24 (browser tests)
