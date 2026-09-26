# Phase 13 — Windows x64 release

## Supported distribution

The supported format is a Windows x64 portable Electron executable. “Portable” describes the program artifact only: runtime data is never written beside the executable. By default it is stored under `%USERPROFILE%\Documents\CGHS Billing Suite VNEXT\Storage`; the absolute `storagePath` in `%APPDATA%\CGHS Billing Suite VNEXT\config.json` may point elsewhere. Program replacement does not remove Storage or user configuration.

The external configuration has `configSchemaVersion: 1`. First launch copies merged defaults non-destructively. Migrations add missing defaults while preserving known and unknown user values. Existing cases, source hashes, custom codes, audit, bills, watcher settings, and validation runs are never reset. Uninstalling/removing the portable EXE does not delete external data.

## Deterministic Windows build

On Windows x64 with Node 20 and Python 3.11:

```powershell
npm ci
py -m pip install -r packaging/requirements-executor.txt
npm test
npm run build:python:win
npm run release:win
```

`build:python:win` uses pinned PyInstaller dependencies to package the existing `portal_bridge.py`, `app (1).py`, Selenium/CDP code, and decision helper as `portal-executor.exe`. Electron invokes it directly with argument-safe `spawn` (`shell: false`); end users do not need Python, Node, npm, pip, or source files. A missing helper produces `PYTHON_EXECUTOR_UNAVAILABLE`, never portal success.

Outputs:

- `release/CGHS-Billing-Suite-VNEXT-<version>-x64.exe`
- `release/release-manifest.json`
- `release/SHA256SUMS.txt`

The manifest and checksums are generated only after an artifact exists. `npm run release:verify` recomputes hashes. GitHub Actions contains the same Windows build pipeline. No updater, signing service, telemetry, or online processing was added.

## Manual update

1. Close the application and confirm no portal execution is active.
2. Back up the external Storage folder and external `config.json`.
3. Verify the new EXE against `SHA256SUMS.txt`.
4. Replace or place the new portable EXE in any program folder.
5. Start it. Confirm displayed version, Storage path, cases, custom registry, watcher setting, and recovery state.
6. Keep the old EXE until local acceptance completes. Never copy Storage into the application directory.

## Release checklist

- [ ] Source/unit tests pass.
- [ ] Python executor builds on Windows x64.
- [ ] Electron Windows artifact exists.
- [ ] Artifact SHA-256 verified.
- [ ] Release manifest generated.
- [ ] App starts in an actual Windows environment.
- [ ] Program directory can be read-only while external Storage remains writable.
- [ ] Existing Cases, Custom Codes, Audit, Bills, configuration, watcher settings, and validation runs remain present.
- [ ] Inbox and final-bill paths work.
- [ ] Packaged Python helper is located and starts.
- [ ] Incomplete portal work remains recovery-required and does not auto-resume.
- [ ] Clean shutdown succeeds.
- [ ] No credentials are stored.
- [ ] Rate snapshot hash is unchanged.

`WINDOWS RUNTIME VALIDATION = NOT RUN` in Arena unless the generated artifact is actually run on Windows.

`CLEAN-MACHINE VALIDATION = NOT RUN` unless a clean Windows machine is actually used.

`REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE`

`LIVE PORTAL VALIDATION = NOT RUN — AUTHENTICATED PORTAL/CDP SESSION REQUIRED`
