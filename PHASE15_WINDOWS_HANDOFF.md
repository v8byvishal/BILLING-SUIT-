# Phase 15 — Windows release and acceptance handoff

## Build on a developer Windows x64 machine

Use a clean checkout of the target commit. Open PowerShell in the repository root and run exactly:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows-release.ps1
```

The script fails immediately outside Windows x64, validates the toolchain and repository, installs locked Node dependencies with `npm ci`, installs pinned Python build dependencies, runs JavaScript and Python test gates, builds and protocol-checks `portal-executor.exe`, builds Electron, generates actual hashes/manifest, verifies the release, checks the immutable rate snapshot, performs a practical secret/PDF check, and writes `release/WINDOWS_RELEASE_ACCEPTANCE.txt`.

`-SkipTests` and `-SkipClean` are explicit exceptional switches; neither is the default. Clean mode removes only `dist`, `release`, and `build-resources/python-executor`. It never targets Storage, Cases, Bills, Inbox, Custom_Codes, Audit, external config, or validation data.

Expected output:

- `release/CGHS-Billing-Suite-VNEXT-5.0.0-rc.1-x64.exe`
- `release/release-manifest.json`
- `release/SHA256SUMS.txt`
- `release/WINDOWS_RELEASE_ACCEPTANCE.txt`

Workflow dispatch in `.github/workflows/windows-release.yml` becomes available only after that workflow is present on the repository default branch.

## Developer-machine runtime acceptance

Building alone is not runtime acceptance. Using synthetic, non-patient data:

1. Compare the EXE SHA-256 with `SHA256SUMS.txt` and the manifest.
2. Copy the EXE to a path with spaces and parentheses, preferably under a protected/read-only program directory.
3. Start it and verify the main window, preload/IPC, displayed version, and clean startup.
4. Confirm Storage is external at `%USERPROFILE%\Documents\CGHS Billing Suite VNEXT\Storage` unless an absolute external path was configured.
5. Confirm config exists at `%APPDATA%\CGHS Billing Suite VNEXT\config.json`.
6. Confirm Cases, Bills, Inbox, Custom_Codes, Audit, Logs, and validation artifacts are not written beside the EXE.
7. Seed controlled Storage with a synthetic case/index, custom registry/audit, bill artifact, production-validation JSON, and watcher setting. Restart and verify all remain readable and unchanged.
8. Add a synthetic custom code through the application, restart, and verify both registry record and audit persist. Confirm the reference snapshot is unchanged.
9. Preserve a `RECOVERY_REQUIRED` synthetic case across restart and verify no portal execution or discharge starts automatically.
10. Verify watcher defaults to STOPPED. If explicitly enabled, use a synthetic text-based PDF and verify intake/duplicate behavior without lock acquisition or portal execution.
11. Exercise portal preparation far enough to confirm Electron resolves the embedded `portal-executor.exe`, not system Python or a source path. Live portal success is not required. Check explicit structured failure without authenticated CDP.
12. Close the app and verify no Electron or `portal-executor.exe` process remains.
13. Make the program directory non-writable and repeat startup, config, Storage, log, and shutdown checks.
14. Test an external data path containing spaces and Unicode.
15. Record every result in a copy of `WINDOWS_RELEASE_ACCEPTANCE.txt`. Only mark Windows runtime PASS after all required checks genuinely pass.

## Replacement/update preservation test

1. Run Build A with controlled external Storage/config.
2. Record hashes of representative case, custom-code, audit, bill, validation, and config files.
3. Close Build A and replace only its EXE with Build B.
4. Start Build B and verify Storage path and config path are unchanged.
5. Verify cases, custom codes, audit, bills, validation results, watcher settings, and recovery states remain present.
6. Confirm no historical package was deleted. No online updater or uninstaller is provided; deleting the portable EXE must not delete external data.

## Genuine clean-machine acceptance

Use a fresh Windows x64 VM/machine with no Node, npm, Python, pip, repository, or developer environment:

1. Transfer only the EXE, manifest, checksum file, and acceptance report.
2. Verify the EXE hash independently.
3. Start the EXE and verify UI/preload/IPC.
4. Confirm external Storage and external config initialization.
5. Confirm the embedded Python helper is resolved without installing Python.
6. Perform a controlled non-live bridge failure check; do not claim portal validation.
7. Exit and verify no orphan Electron/Python helper process.
8. Repeat from a protected program path and with Unicode/space-containing external paths.

Only then may `CLEAN-MACHINE VALIDATION` be marked PASS.

## Optional acceptance layers

- Real PDF testing uses the existing Phase 9 fixture contract and privacy-approved files only. Never auto-generate `expected.json` from actual output.
- Live portal testing uses Phase 12 with manual Chrome debugging, login, correct case selection, reviewed plan, explicit execution confirmation, actual row/quantity verification, manual verification, and manual discharge.
- No login, discharge, portal upload/download, OCR, settlement, fuzzy matching, or AI decision is automated.
