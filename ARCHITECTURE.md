# Architecture

This repository is a local vanilla Electron/JavaScript desktop application. Phase 3 adds source-bill PDF evidence extraction on top of the Phase 2 external Storage layer while preserving existing CGHS rule, portal, final-bill, and legacy Python/Selenium behavior.

Detailed storage/parser documentation:

- `docs/ARCHITECTURE.md`
- `docs/PARSER_PIPELINE.md`
- `docs/PARSER_REGRESSION.md`
- `docs/PHASE_03_IMPLEMENTATION.md`

## Runtime layering

```text
Renderer UI (src/ui, vanilla HTML/CSS/JS)
  ↓ controlled preload API: window.cghsSuite
Preload bridge (src/desktop/preload.js)
  ↓ declared IPC operation contract
Electron main process (src/desktop/main.js)
  ↓ service orchestration
StorageService (src/core/storage.js)
  ↓ external Storage root outside application package
Source parser (src/services/bill-ingestion/source-parser.js)
  ↓ parser evidence output only
Existing Node domain services and adapters
  ↓ where already implemented
Legacy Python/Selenium/CDP portal executor
```

The renderer does not directly access Node filesystem APIs, shell commands, Python, Selenium, CGHS rule internals, source PDFs, or arbitrary Storage manipulation. Privileged work flows through the preload bridge and declared IPC handlers.

## External Storage root

The canonical default root is resolved from Electron's standard application data location:

```text
<ApplicationData>/CGHS-Billing-Suite/Storage
```

The resolver rejects paths inside the application package. Operational files must not silently fall back into the repository or packaged app directory.

## Source-bill ingestion lifecycle

```text
Operator selects PDF
  -> StorageService.importSourceBill()
  -> Storage/Source_Bills/<billSessionId>/source.pdf
  -> parseStoredSourceBill()
  -> pdfjs-dist extraction
  -> page model
  -> normalization
  -> section detection
  -> evidence candidates
  -> Storage/Source_Bills/<billSessionId>/parse-result.json
  -> Source Bills UI
```

The stored source artifact is the canonical parser input. Parser output is associated with exactly one `billSessionId` and `runId`.

## Parser contract

`src/services/bill-ingestion/source-parser.js` exports parser version `3.0.0` and produces evidence-oriented parse results. Parser output includes:

- pages with `rawText`, `normalizedText`, and extraction status;
- sections with type, page range, status, confidence, and evidence;
- candidates with description, raw code, normalized candidate code, quantity evidence, and provenance;
- warnings, metrics, and status timeline.

The parser does not produce executable portal actions and does not apply CGHS business-rule normalization.

## Description (CODE) regression

Phase 3 fixes the parser evidence gap for parenthesized code patterns such as:

```text
Blood Transfusion Charge (C008)
Blood Transfusion Charge
(C008)
```

The parser preserves `C008` as `C008`; it does not map aliases or convert to `CC008`.

## Storage contract

Canonical folders remain:

```text
Storage/Source_Bills
Storage/Final_Bills
Storage/Audit
Storage/Failures
Storage/Temp
Storage/Config
```

Source parser results live beside the source artifact:

```text
Storage/Source_Bills/<billSessionId>/source.pdf
Storage/Source_Bills/<billSessionId>/metadata.json
Storage/Source_Bills/<billSessionId>/parse-result.json
```

## IPC and preload policy

The Phase 3 IPC contract adds controlled parse-result access through `sourceBill.getParseResult`. Folder opening remains allowlisted by folder key. There is no generic shell execution, arbitrary Python execution, arbitrary Node execution, JavaScript eval, unrestricted filesystem access, or credential storage.

## Preserved business boundaries

Phase 3 does not change:

- CGHS mapping/rule semantics;
- EnhancementPlan business semantics;
- portal duplicate prevention, portal quantity reconciliation, speciality logic, locked quantity handling, Selenium workflow, or CDP behavior;
- final-bill business logic;
- legacy Python executor ownership of browser automation.

Portal readiness is still `NOT VERIFIED` until authenticated validation exists.
