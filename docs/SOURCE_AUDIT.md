# Phase 0 Source Audit — CGHS Billing Suite VNEXT / Billing Suite

Audit date: 2026-09-26 UTC

Repository: `v8byvishal/BILLING-SUIT-`

Workspace path: `/home/user/BILLING-SUIT-`

Audit scope: source inspection and baseline validation only. No application feature development was performed.

## 1. Audit gate status

**PHASE 0 SOURCE AUDIT STATUS: COMPLETED FOR CURRENT SOURCE SNAPSHOT.**

This report records the actual repository state and the current baseline test/build evidence before any feature work. It does **not** certify the application as release-ready.

Important process note: this Arena session is pinned to branch `arena/01a0dfad-billing-suit`. Arena policy for this session does not permit switching to or creating separate phase branches. To satisfy the baseline-freeze intent without changing branches, a **local annotated tag** was created:

- Local tag: `baseline/rc2-source-freeze`
- Target commit: `ee8a70df3e5c658d7e6550ed940a7bbab1a78e3d`
- Tag object observed: `748738587521035ae4493dbec2a4353b0deb8a16`

No remote protected branch/tag was pushed during this audit.

## 2. Git baseline

| Item | Value |
|---|---|
| Audit branch | `arena/01a0dfad-billing-suit` |
| Audited source HEAD before this report was added | `ee8a70df3e5c658d7e6550ed940a7bbab1a78e3d` |
| Audited source HEAD subject | `Merge pull request #4 from v8byvishal/arena/01a0dec5-billing-suit` |
| Audited source HEAD author | `arena-ai-coding-agent[bot] <298482267+arena-ai-coding-agent[bot]@users.noreply.github.com>` |
| Audited source HEAD date | `2026-09-26T18:14:26+00:00` |
| Branches containing HEAD | `arena/01a0dfad-billing-suit`, `main` |
| Initial git status before audit file | clean |
| Remote | `origin https://github.com/v8byvishal/BILLING-SUIT-.git` |

## 3. Repository tree summary

Top-level source tree observed:

```text
.github/workflows/windows-release.yml
.gitattributes
.gitignore
00_PROJECT_ANALYSIS_REPORT.md
ADVANCED_SETTLEMENT_REPORT.md
ARCHITECTURE.md
BILL_PRESENTATION_REPORT.md
BROWSER
BUILD_INSTRUCTIONS.txt
CASE_GROUP_ENGINE_REPORT.md
CGHS_Billing_Suite_Pro.html
CLOUD_SYNC_SECURITY_REPORT.md
DEPENDENCY_MAP.md
DESIGN.md
ENGINE_AUDIT_REPORT.md
FEATURE_MAP.md
FUNCTION_MAP.md
INGESTION_ENGINE_REPORT.md
MATCHING_ENGINE_REPORT.md
MEMORY.md
PHASE10_PORTAL_EXECUTOR_VALIDATION.md
PHASE11_INBOX_WATCHER.md
PHASE12_PRODUCTION_ACCEPTANCE.md
PHASE13_WINDOWS_RELEASE.md
PHASE15_WINDOWS_HANDOFF.md
PHASE2_ZERO_AMOUNT_MISMATCH_REPORT.md
PHASE3_FINANCIAL_INTEGRITY_REPORT.md
PHASE4_HBIE_AI_REPORT.md
PHASES.md
PHASE_2B_REPORT.md
PORTABLE_HOWTO.txt
PRD.md
RELEASE_AUDIT_REPORT.md
REPORT_MAPPING_FIX.md
ROBUST_SETTLEMENT_REPORT.md
RULES.md
SETTLEMENT_MODULE_REPORT.md
STORAGE_MAP.md
UI_MAP.md
UI_WORKFLOW_REPORT.md
UNIVERSAL_READER_REPORT.md
UPGRADE_V3.2_REPORT.md
V4_PRODUCTION_READINESS_REPORT.md
V5_RC_DESKTOP_RELEASE_REPORT.md
VALIDATION_REPORT.md
app (1).py
config/default.json
main.js
package-lock.json
package.json
packaging/portal-executor.spec
packaging/requirements-executor.txt
preload.js
scripts/*.js
scripts/*.py
scripts/*.ps1
src/adapters/legacy-portal/*
src/core/*
src/desktop/*
src/services/*
src/shared/.gitkeep
src/ui/*
storage/**/.gitkeep
test-desktop.js
test-migration.js
tests/fixtures/**
tests/integration/*.test.js
tests/python/test_portal_execution_core.py
tests/unit/*.test.js
```

Tracked source counts observed:

- JavaScript files under `src`, `tests`, `scripts`: 81
- TypeScript / TSX files: 0
- Python files: 5
- HTML files: 2

## 4. Package, Electron, and build configuration

`package.json` observed:

| Field | Value |
|---|---|
| `name` | `cghs-billing-suite-vnext` |
| `productName` | `CGHS Billing Suite VNEXT` |
| `version` | `5.0.0-rc.2` |
| `main` | `src/desktop/main.js` |
| Runtime dependencies | `pdfjs-dist@4.10.38`, `sql.js@1.13.0` |
| Dev dependencies | `electron@31.7.7`, `electron-builder@25.1.8`, `pdf-lib@1.17.1` |

Scripts observed:

```text
start                  electron .
dev                    VNEXT_ENV=development electron .
test                   node scripts/run-unit-tests.js
test:desktop           node scripts/smoke-test.js
test:real-bills        node scripts/real-bill-regression.js
test:all               npm test && npm run test:desktop
build:dir              electron-builder --dir
build:win              npm run build:identity && node scripts/check-python-executor.js && electron-builder --win portable --x64
build:identity         node scripts/generate-build-info.js
build:python:win       pyinstaller --clean --noconfirm packaging/portal-executor.spec && copy dist/portal-executor.exe into build-resources
release:manifest       node scripts/generate-release-manifest.js
release:verify         node scripts/verify-release.js
release:win            npm run build:win && npm run release:manifest && npm run release:verify
```

Electron builder configuration observed in `package.json`:

- `appId`: `in.cghsbilling.vnext`
- Target: Windows portable x64
- Output directory: `release`
- Artifact name: `CGHS-Billing-Suite-VNEXT-${version}-${arch}.${ext}`
- `asar`: `true`
- Included files: `src/**/*`, `config/default.json`, `package.json`, selected `node_modules` for `sql.js` and `pdfjs-dist`
- Extra resources: bundled config, build-info, `build-resources/python-executor`

Electron runtime currently used by the packaged app:

- Main process: `src/desktop/main.js`
- Preload: `src/desktop/preload.js`
- Renderer: `src/ui/index.html`, `src/ui/renderer.js`, `src/ui/styles.css`

The repository also contains root-level `main.js`, root-level `preload.js`, `test-desktop.js`, and `CGHS_Billing_Suite_Pro.html`, which are legacy/duplicate artifacts and are **not** the `package.json` Electron entry point.

## 5. React / TypeScript structure

No React or TypeScript implementation exists in the current source tree.

Current UI is:

```text
src/ui/index.html
src/ui/renderer.js
src/ui/styles.css
```

It is a vanilla HTML/CSS/JavaScript Electron renderer exposed through `src/desktop/preload.js` IPC. This matches the current `ARCHITECTURE.md`, which explicitly describes a vanilla renderer, but it does **not** match the newly requested Phase 1 requirement of React + TypeScript.

## 6. Python structure

Python-related source observed:

```text
app (1).py
src/adapters/legacy-portal/portal_bridge.py
src/adapters/legacy-portal/portal_execution_core.py
scripts/portal-executor-benchmark.py
tests/python/test_portal_execution_core.py
```

Python packaging files observed:

```text
packaging/portal-executor.spec
packaging/requirements-executor.txt
```

`packaging/requirements-executor.txt` contains:

```text
PyInstaller==6.11.1
PyMuPDF==1.24.14
PyQt5==5.15.11
selenium==4.27.1
```

The preserved portal automation is centered in `app (1).py`. The current Node/Electron path calls it through:

```text
Portal Adapter
  -> PythonRunner
  -> portal_bridge.py
  -> app (1).py BatchAutomationThread
  -> Selenium + Chrome CDP 127.0.0.1:9222
```

## 7. Baseline validation before feature modification

### 7.1 Environment observed

| Tool | Observed value |
|---|---|
| Node.js | `v22.22.3` |
| npm | `10.9.8` |
| Python | `3.11.2` |
| `pyinstaller` | not available in the Linux audit environment |
| `node_modules` before install | absent |

### 7.2 Commands and results

| Command | Result | Notes |
|---|---:|---|
| `npm test` before dependency install | **FAIL** | Failed immediately because `pdf-lib` was unavailable (`MODULE_NOT_FOUND`). This was an environment/dependency installation state, not a test assertion failure. |
| `npm ci` | **FAIL** | Electron install script failed with `unable to verify the first certificate`. |
| `npm ci --ignore-scripts` | **PASS** | Installed JS dependencies without running Electron install scripts. Reported 14 total npm vulnerabilities in full dev dependency tree. |
| `npm test` after `npm ci --ignore-scripts` | **PASS** | `272/272` Node tests passed. |
| `python3 -m unittest discover -s tests/python -p 'test_*.py'` | **PASS** | `32/32` Python tests passed. |
| `npm run test:real-bills` | **NOT RUN BY HARNESS** | Exited 0 with `REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE`. |
| `npm run test:desktop` | **FAIL** | Electron binary was not installed because install scripts were skipped / Electron download failed. Error: `Electron failed to install correctly`. |
| `npm run build:dir` | **FAIL** | Electron-builder attempted Linux unpacked build and failed downloading Electron asset with `EOF`. |
| `node scripts/check-python-executor.js` | **FAIL** | `build-resources/python-executor/portal-executor.exe` missing. |
| `npm run build:win` | **FAIL** | Generated build identity, then failed closed because packaged Python executor was missing. |
| `npm audit --omit=dev` | **PASS / 0 prod vulnerabilities** | Production dependency audit reported 0 vulnerabilities. |
| `npm audit` | **FAIL / 14 dev vulnerabilities** | Full tree reported 13 high and 1 critical vulnerability in dev dependencies. |

### 7.3 Baseline test counts

Current automated source tests that ran successfully in this audit:

- Node: 272 passed, 0 failed after dependencies were present.
- Python: 32 passed, 0 failed.
- Total source tests run successfully in this audit: 304.

Important distinction: desktop smoke, Electron packaging, Windows packaging, real-PDF regression, and live portal validation did **not** pass in this audit.

## 8. Module mapping requested by audit

| Concern | Current source module(s) | Audit notes |
|---|---|---|
| Bill ingestion | `src/services/bill-ingestion/index.js`, `pdf-loader.js`, `bill-parser.js`, `page-parser.js`, `section-detector.js`, `logical-row-builder.js`, `field-parser.js`, `bed-details-parser.js`, `normalized-model.js`, `aggregator.js` | Active text-based parser using `pdfjs-dist`. No OCR. Preserves pages, sections, raw context, source lines, and excluded Patient Payable sections. |
| Code normalization | `src/services/bill-ingestion/code-normalizer.js`, `compound-code-parser.js`, `src/services/cghs/rate-list/normalizer.js`; legacy `normalize_cghs_code` in `app (1).py` | Active Node parser only recognizes labeled/delimited syntactic codes. Legacy Python has broader row-aware CGHS normalization but is not the active Node parser. |
| CGHS rules | `src/services/cghs/rules/rule-engine.js`, `cc001.js`, `wc001.js`, `cn002.js`, `cc002.js`, `room-evidence.js` | Deterministic rules exist for room-derived `CC001`, `WC001`, `CN002`, and oxygen-derived `CC002`. Many locked mapping rules from the new instruction are not implemented in Node. |
| CGHS registry / rates | `src/services/cghs/data/hfos-reference-rates.json`, `rate-list/loader.js`, `repository.js`, `validator.js` | 1,998-record HFOS-derived snapshot. Source explicitly `RATE_SOURCE_UNDEFINED`; SHA-256 observed: `b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba`. |
| EnhancementPlan | `src/services/cghs/enhancement-plan.js`, `rules/rule-engine.js` | Current shape is `plan_version`, `bill`, `entries`, `rejected_candidates`, `excluded_candidates`, `execution_summary`, etc. It is not the newly specified `planId/sourceBillId/actions/reviewItems/excludedItems/diagnostics/state` schema. |
| Portal execution | `src/adapters/legacy-portal/plan-adapter.js`, `src/services/portal/portal-execution-service.js`, `src/adapters/legacy-portal/python-runner.js`, `portal_bridge.py`, `portal_execution_core.py`, `app (1).py` | Adapter filters executable statuses and invokes Python runner. Offline tests pass. Live portal not verified. |
| CDP attachment | `app (1).py`, `BatchAutomationThread.run` | Uses Selenium `Options().add_experimental_option("debuggerAddress", "127.0.0.1:9222")`. Retries connection 3 times. |
| Duplicate prevention | `plan-adapter.js`, `portal_execution_core.py`, `app (1).py` (`PlusButtonController`, `TreatmentPlanOrchestrator`), `CaseStore` source hash index | Multiple layers exist. Important risk: legacy Selenium path can treat unverified/unknown insertion as committed to avoid duplicate clicks, and may report success upstream. |
| Quantity handling | `field-parser.js`, `aggregator.js`, `cc002.js`, `portal_execution_core.py`, `app (1).py` (`QuantityController`, locked quantity paths) | Source quantities aggregate; oxygen derives 12/24; Selenium handles editable and locked quantities. Some verification semantics need live validation. |
| Speciality synchronization | `app (1).py` (`SpecialitySynchronizer`, `SpecialityClearController`, recovery in `TreatmentPlanOrchestrator`) | Present in legacy portal automation. Offline coverage is indirect; live validation pending. |
| Locked quantity handling | `app (1).py` (`QuantityController.is_locked`, `_process_locked_quantity`, `_execute_single_unit_transaction`) | Present in legacy portal automation; needs live regression before any modification. |
| Python bridge | `src/adapters/legacy-portal/python-runner.js`, `src/adapters/legacy-portal/portal_bridge.py`, `packaging/portal-executor.spec` | Explicit JSON contract exists. Runner uses `spawn`, `shell:false`, timeout, structured marker `VNEXT_RESULT=`. |
| Final bill generation / composition | Active: `src/services/final-bill/*`, `src/services/cases/case-workflow-service.js`; legacy inactive: `CGHS_Billing_Suite_Pro.html` PDF builder | Active app parses and stores final-bill metadata/package; it does **not** compose/order a final output PDF. Legacy HTML contains a PDF builder but is not active in the Electron VNEXT entry point. |
| Supporting section extraction | `src/services/final-bill/final-section-extractor.js`, `src/services/bill-ingestion/section-detector.js` | Extracts IP/OP/OT Pharmacy and several consumable families. It also includes generic `CONSUMABLES` and `OTHER_CONSUMABLES`, which may exceed the newly requested supported list. |
| Storage | `src/core/storage.js`, `src/services/cases/case-store.js`, `src/services/custom-codes/custom-code-registry.js`, `src/services/final-bill/completed-bill-storage.js`, `src/services/validation/*` | External Storage creation/probe implemented. Folder structure differs from new requirement: current source uses `Failed`, not `Failures`; lacks top-level `Temp` and `Config`; adds `Cases`, `Bills`, `Inbox`, `Custom_Codes`, `Logs`, etc. |
| Configuration | `config/default.json`, `src/core/config.js`, `src/core/user-config.js`, `src/core/runtime-paths.js` | Default config bundled, external user config under Electron userData, env override `VNEXT_STORAGE_PATH`. Feature flags currently false while UI surfaces exist. |
| IPC | `src/desktop/main.js`, `src/desktop/preload.js` | Context-isolated API exposed as `window.vnext`. Main process owns filesystem/process privileges. |
| Windows packaging | `package.json` build field/scripts, `packaging/portal-executor.spec`, `packaging/requirements-executor.txt`, `scripts/build-windows-release.ps1`, `scripts/generate-build-info.js`, `scripts/generate-release-manifest.js`, `scripts/verify-release.js`, `.github/workflows/windows-release.yml` | Source-level tooling exists and fails closed on missing Windows/Python executor artifacts. Actual Windows EXE not built in this audit. |

## 9. Source behavior probes performed during audit

These probes were run only to understand source behavior; they are not feature changes.

### 9.1 Parenthesized description-code expression

Input variants tested through `parseBillDocument`:

```text
Some Procedure (LB126) Qty: 1
Service: Some Procedure (LB126) | Qty: 1
Some Procedure | Code: LB126 | Qty: 1
```

Observed behavior:

- `Some Procedure (LB126) Qty: 1` -> 0 items, no review candidate.
- `Service: Some Procedure (LB126) | Qty: 1` -> 0 items, review candidate `POSSIBLY_MISSING_CODE`.
- `Some Procedure | Code: LB126 | Qty: 1` -> 1 item.

Audit conclusion: the historical 39819-style parenthesized `Description (CODE)` regression is **not proven fixed** in current active parser. It can still produce zero actionable items unless the line contains a recognized `Code:` label/delimiter.

### 9.2 Raw alias emission probe

Input tested:

```text
Hospital Services
Service: Blood Transfusion Charge | Code: C008 | Qty: 1
```

Observed active plan entry:

```json
[
  {
    "code": "C008",
    "status": "UNKNOWN_CODE",
    "code_validation": "UNKNOWN",
    "warnings": [],
    "quantity": 1
  }
]
```

Audit conclusion: current `EnhancementPlan` can still emit raw aliases such as `C008` as plan entries, although not executable under the bundled snapshot. The newly locked requirement says final `EnhancementPlan` must not emit raw four-character aliases such as `C008`; this is a gap.

## 10. Comparison against repository documents

| Document | Current source alignment | Mismatches / audit notes |
|---|---|---|
| `PRD.md` | Broad workflow matches: local PDF ingestion, deterministic plan, review/custom codes, portal boundary, cases, final-bill processing, no autonomous login/discharge. | PRD correctly says real-PDF, live portal, Windows runtime, and clean-machine acceptance remain pending. This remains true. |
| `ARCHITECTURE.md` | Accurately describes current vanilla Electron/Node/Python architecture and external Storage boundary. | It says vanilla UI, which conflicts with the user's new React + TypeScript Phase 1 requirement. |
| `RULES.md` | Captures important invariants: no guessing, no fuzzy portal selection, Patient Payable exclusion, immutable plans, no automated login/discharge. | It does not fully encode the new locked alias/category mapping list from the user instruction. Current source also does not implement several of those locked mappings. |
| `PHASES.md` | Describes historical Phase 0-15 source handoff and says Windows artifact build remains blocked/not run. | It says development through Phase 15 source handoff is complete, while this task requests a fresh Phase 0 audit and future phase sequence. It should not be treated as proof of current release completion. |
| `DESIGN.md` | Describes the current vanilla UI and professional light visual style. | UI source still displays stale copy: top panel says `PHASE 3`, and the `Workflow boundaries` section says Final bill workflow is `Not implemented` despite active final-bill modules. No sidebar/navigation exists. |
| `MEMORY.md` | Contains useful history and safety boundaries. | Stale values: branch is recorded as `arena/01a0de46-billing-suit`, version as `5.0.0-rc.1`, and historical test count as 303. Current audit observed branch `arena/01a0dfad-billing-suit`, package version `5.0.0-rc.2`, and source test count 304 passing after dependency install. |

## 11. What already works

1. **Source-level Node tests pass after dependencies are available.** 272 Node tests pass.
2. **Python portal decision-core tests pass.** 32 Python unit tests pass.
3. **Text PDF ingestion exists and is modular.** `pdf-loader.js` validates PDF path/signature/size and extracts per-page text with `pdfjs-dist`.
4. **Normalized bill model exists.** Pages, sections, items, excluded sections, parser audit, transformations, and bed details are represented.
5. **Patient Payable exclusion exists.** Parser separates Patient Payable sections and rule/validation tests cover exclusion leakage.
6. **Deterministic room/oxygen rules exist.** `CN002`, `CC001`, `WC001`, and oxygen `CC002` are derived with provenance.
7. **Rate repository abstraction exists.** Bundled 1,998-record snapshot loads with explicit non-authoritative provenance and protected checksum tests.
8. **Custom code registry exists.** Persistent local records, active/inactive state, collision handling, override audit, revision/hash, and plan-staleness boundaries are implemented and tested.
9. **Review queue exists.** Unknown, invalid, unresolved, and validation findings can be surfaced for operator review.
10. **Portal plan adapter exists.** It blocks review/unknown/unresolved records and only allows `SOURCE_VERIFIED`, `RULE_VERIFIED`, and `CUSTOM_VALID` statuses.
11. **Python runner and bridge exist.** Structured JSON contract and `VNEXT_RESULT=` marker are implemented.
12. **Protected portal automation exists.** Selenium/CDP attachment, exact option matching helper, speciality synchronization, duplicate guard, quantity handling, diagnostics, and batch results exist in `app (1).py`.
13. **Selenium-free portal core is testable.** `portal_execution_core.py` has offline tests for exact matching, duplicate detection, quantity reconciliation, retry boundaries, and metrics.
14. **Case workflow exists.** SHA-256 case identity, duplicate detection, state transitions, active-case lock, restart recovery, and audit artifacts are implemented and tested.
15. **Final bill association/extraction exists.** Synthetic tests cover deterministic matching, supported section extraction, Patient Payable exclusion, duplicate final-PDF detection, and completed package storage.
16. **External Storage initialization exists.** Absolute external path validation, folder creation, and write probe are implemented.
17. **Release tooling fails closed.** Build scripts check required files, test gates, Python helper, artifact/hash/version consistency, no embedded PDFs, and rate snapshot hash.
18. **Production dependency audit is clean.** `npm audit --omit=dev` reported 0 vulnerabilities.

## 12. What partially works

1. **Desktop shell:** Electron main/preload/UI exist, but the current UI is vanilla JS, not React/TypeScript; it lacks the requested sidebar/navigation and contains stale labels.
2. **Desktop smoke:** script exists but could not run in this audit because Electron binary installation failed in the sandbox.
3. **PDF ingestion:** works for labeled text-based synthetic PDFs, but does not parse all real-world formats such as `Description (CODE)` without a `Code:` label.
4. **EnhancementPlan:** deterministic plan exists, but schema does not match the newly requested V2 shape and may emit raw alias codes as non-executable entries.
5. **CGHS registry:** rate snapshot loads, but its authority is explicitly undefined; no authoritative master-rate source/version is present.
6. **Portal integration:** adapter/bridge/executor path exists and offline tests pass, but authenticated live portal/CDP validation has not been run.
7. **Portal preflight:** UI asks for operator confirmation and sends booleans, but backend does not independently probe CDP availability or authenticated page/context before spawning Selenium.
8. **Duplicate prevention:** multiple guards exist, but legacy Selenium path can classify uncertain insertions as committed to prevent duplicate clicks; this protects against duplicates but risks over-reporting success.
9. **Final-bill workflow:** matching, extraction, and completed package metadata exist; actual final PDF composition/ordered output is absent in active code.
10. **Windows packaging:** scripts/specs exist; actual Windows x64 artifact and packaged EXE launch are unverified.
11. **Storage:** external Storage exists, but folder names/structure differ from the new required `Storage/Source_Bills`, `Final_Bills`, `Audit`, `Failures`, `Temp`, `Config` set.
12. **Validation:** expected-fixture validation exists, but real PDF fixtures are unavailable and no current real-PDF acceptance was run.

## 13. What is missing against the new instruction set

1. React + TypeScript application shell.
2. Sidebar/navigation-based enterprise UI as specified for Phase 1.
3. Exact requested Storage structure including top-level `Failures`, `Temp`, and `Config` folders.
4. Open-folder controls for Storage paths.
5. Active parser support for parenthesized `Description (CODE)` expressions.
6. Explicit `NO_EXECUTABLE_ENHANCEMENT_ACTIONS` result code when plans contain no actions.
7. Authoritative CGHS master/rate source with filename/version/hash beyond the HFOS reference snapshot.
8. Locked alias/category normalization rules in the active Node parser/planner:
   - `CGHS-L + Bxxx -> LBxxx`
   - `CGHS-RI + numeric -> RIxxx`
   - `CGHS-CI + numeric -> CIxxx`
   - `CGHS-G + Pxxx -> GPxxx`
   - `CGHS-P + Txxx -> PTxxx`
   - known `CGHS-C` mappings such as `C004 -> CC004`, `C008 -> CC008`, etc.
   - explicit review for `C003` cases and no invented `CC003`.
9. A guarantee that final `EnhancementPlan` never emits raw aliases (`C002`, `C003`, `C008`, `C010`, etc.) as plan entries.
10. New V2 `EnhancementPlan` schema with `planId`, `sourceBillId`, `actions`, `reviewItems`, `excludedItems`, `diagnostics`, and `state`.
11. Backend CDP/authenticated-page/control availability preflight before Selenium starts.
12. Exposed cancellation support through Node/Python bridge for live portal execution.
13. Fast operator verification table showing code, description, quantity, source section/page, rule status, review reason, portal result, timing, and failure state. Current UI mostly displays JSON audit.
14. Active ordered final-PDF composition/output. Current code stores final source PDF and JSON artifacts but does not generate a composed final bill PDF.
15. Phase 9 editable bill formatting fields and derived `Credit : C/O NHA, Dated:- DD/MM/YYYY` behavior.
16. Actual performance profiling artifacts for parser/plan/DOM/portal/UI frequencies.
17. Full structured recovery coverage for all requested failure classes; some classes exist, but not all are normalized across layers.
18. Actual Windows x64 EXE artifact, manifest, checksums, source ZIP, and runtime acceptance.
19. Clean Windows environment validation.
20. Authenticated live CGHS portal validation.
21. Privacy-approved production PDF regression.
22. Updated `MEMORY.md` / `PHASES.md` reflecting this new audit and current branch/version; not changed in this source-only audit except by this report.

## 14. What is unsafe or high risk

1. **Legacy Selenium uncertainty can be reported as success.** In `app (1).py`, `_execute_single_unit_transaction` can treat an unverified/unknown insertion as committed to avoid duplicate Plus clicks. `process_item` can then set `last_item_outcome` to `EXECUTED` / `PORTAL_ROW_VERIFIED`. This protects against duplicate clicks but risks false success when portal evidence was not actually verified.
2. **Backend preflight trusts renderer-supplied booleans.** `src/ui/renderer.js` calls `productionPortalPreflight` with values such as `cdpAvailable:true` and `portalContext:true` after confirmation dialogs. No backend CDP/page/control probe is performed before `portal:execute` starts Selenium.
3. **Raw aliases can enter plan entries.** Audit probe confirmed `C008` can appear as an `UNKNOWN_CODE` plan entry. It is blocked today, but the new locked requirement says such raw aliases must not be emitted in final plan output.
4. **Parenthesized real-world code format can silently produce zero items.** A row like `Some Procedure (LB126) Qty: 1` produced no item and no review candidate in audit probing.
5. **Final-section extraction may exceed supported section families.** Current final extractor includes generic `CONSUMABLES` and `OTHER_CONSUMABLES`; the new requirement only lists IP Pharmacy, OP Pharmacy, OT Pharmacy, Ward Consumables, OT Consumables, and Cathlab Consumables.
6. **No actual Windows build/runtime evidence.** Packaging tooling exists but current audit failed on Linux before artifact creation.
7. **Electron install/build is environment-fragile in this sandbox.** Normal `npm ci` failed on Electron TLS certificate verification; `build:dir` failed downloading Electron asset.
8. **Root legacy Electron files are stale.** Root `main.js` points to `app/index.html`, which is not present. It is not the package entry point, but it can confuse maintainers and older scripts.
9. **Legacy `app (1).py` contains broad `VALID_CODES` and category mapping logic.** This should not be used as authoritative business policy without tests; it is currently protected portal legacy, not the active Node planner.
10. **Documentation drift is significant.** `MEMORY.md` branch/version/test counts are stale; UI copy is stale; historical phase docs can be mistaken for current acceptance evidence.
11. **Full dependency audit has dev vulnerabilities.** Production audit is clean, but full `npm audit` reports 13 high and 1 critical vulnerabilities in dev dependencies.

## 15. What is duplicated

1. **Electron main/preload duplication:** root `main.js`/`preload.js` vs active `src/desktop/main.js`/`src/desktop/preload.js`.
2. **Desktop test duplication:** root `test-desktop.js` targets the legacy app, while `scripts/smoke-test.js` targets the active VNEXT app.
3. **Parser duplication:** active Node parser in `src/services/bill-ingestion`; legacy PyMuPDF parser in `app (1).py`.
4. **CGHS normalization duplication:** active Node syntactic normalizer and legacy `normalize_cghs_code` in Python differ materially.
5. **PDF generation duplication/inactivity:** legacy `CGHS_Billing_Suite_Pro.html` contains a PDF builder, but active VNEXT final-bill service does not use it.
6. **Reports/documentation duplication:** many historical audit/report markdown files exist. They are useful evidence but not current acceptance proof.
7. **Storage concepts:** root `storage/` placeholders, active external Storage, legacy root Electron encrypted SQLite userData, and case package Storage coexist conceptually.

## 16. What should be preserved

1. `app (1).py` Selenium/CDP executor until a live defect is reproduced and protected by regression.
2. `portal_execution_core.py` exact matching/reconciliation tests.
3. `plan-adapter.js` executable-status filter and stale registry guard.
4. Patient Payable exclusion behavior and tests.
5. Room-derived `CN002`, `CC001`, `WC001` and oxygen-derived `CC002` tests.
6. Custom Code Registry audit/revision/hash behavior.
7. CaseStore SHA-256 identity, active-case lock, restart recovery, and completed-case immutability.
8. Final-bill deterministic matching and duplicate-final detection.
9. Release tooling fail-closed behavior, especially no fake EXE/hash claims.
10. Rate snapshot checksum guard and explicit `RATE_SOURCE_UNDEFINED` status.
11. No automated credential entry and no automated discharge.
12. No blind duplicate Plus clicks.

## 17. What must be refactored or corrected before final release

1. Establish the required phase workflow within the fixed Arena branch constraint, or document why branch creation must occur outside Arena.
2. Update stale docs (`MEMORY.md`, `PHASES.md`, UI labels) after audit approval so they do not claim obsolete branch/version/test state.
3. Decide whether Phase 1 truly requires React + TypeScript; if yes, introduce it without moving business rules into UI.
4. Implement/validate exact external Storage folder contract or update acceptance criteria to match current expanded Storage model.
5. Add regression for parenthesized `Description (CODE)` ingestion and fix active parser only with evidence.
6. Add locked alias/category mapping tests before modifying code normalization.
7. Redesign `EnhancementPlan` output/adapter compatibility to meet V2 schema while preserving existing portal adapter behavior.
8. Add backend CDP/authenticated-page/control preflight service instead of trusting renderer booleans.
9. Make zero-action plans return explicit `NO_EXECUTABLE_ENHANCEMENT_ACTIONS` and skip Selenium.
10. Reconcile legacy Selenium unknown-commit behavior with the invariant that success requires actual portal row/quantity evidence.
11. Add cancellation path through UI -> Node -> child process / Python executor.
12. Build the final-bill workspace into actual ordered PDF output, not only metadata/package storage.
13. Implement editable final bill formatting fields and DOD-derived credit date behavior from an actual project template/reference.
14. Remove or clearly quarantine stale root Electron files and legacy scripts after confirming no packaging dependency.
15. Produce real Windows x64 build and clean-machine validation on Windows.
16. Run privacy-approved real-PDF and live authenticated CGHS portal acceptance.

## 18. What prevents final release now

A final release is blocked by all of the following current facts:

1. Actual Windows x64 EXE was not built.
2. Packaged `portal-executor.exe` is missing in this environment.
3. Electron desktop smoke test did not run successfully.
4. Build failed in this Linux sandbox due Electron download/certificate issues and missing Windows helper.
5. No packaged EXE launch evidence exists.
6. No clean Windows machine validation exists.
7. No privacy-approved real source PDF regression was run.
8. No authenticated live CGHS portal/CDP validation was run.
9. Active parser does not prove support for parenthesized `Description (CODE)` expressions.
10. Locked alias/category mapping requirements are not fully implemented in active Node parser/planner.
11. `EnhancementPlan` schema does not match the new required V2 contract.
12. Active final-bill code does not generate a composed output PDF.
13. Backend portal preflight does not independently prove CDP/authenticated page/control readiness.
14. Documentation and UI contain stale state/version/phase claims.
15. Full dev dependency audit reports vulnerabilities.

## 19. Immediate next safe actions after audit approval

No feature development should begin until this report is reviewed. The safest next sequence is:

1. Decide how to handle Arena's fixed-branch constraint versus the requested phase-branch policy.
2. Update `MEMORY.md` and `PHASES.md` to record this audit as the current baseline without claiming release readiness.
3. Add failing regression tests for the specific gaps before implementation:
   - parenthesized `Description (CODE)` ingestion;
   - no raw alias emission in final `EnhancementPlan`;
   - cross-bill UI/application-state isolation for new uploads;
   - explicit no-executable-actions behavior;
   - backend CDP preflight fail-closed behavior.
4. Only then begin Phase 1/2 work, preserving the legacy portal automation unless a reproduced defect and regression require a targeted change.
