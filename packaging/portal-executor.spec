# PyInstaller spec for the preserved legacy Selenium/CDP executor.
#
# This spec lives in packaging/, one directory below the repository root,
# while the scripts it packages live under the repo root itself. PyInstaller
# resolves relative paths written in a .spec file relative to the spec
# file's own directory (SPECPATH), not the caller's current working
# directory, so plain relative paths like 'src/adapters/legacy-portal/...'
# were being looked up as 'packaging/src/adapters/legacy-portal/...' and
# failing. Anchor every path on SPECPATH (which PyInstaller always sets to
# the absolute directory containing this spec file) so the build works the
# same regardless of the caller's working directory.
import os

from PyInstaller.utils.hooks import collect_submodules, collect_data_files

ROOT = os.path.dirname(SPECPATH)  # noqa: F821 - injected by PyInstaller

hidden = collect_submodules('selenium') + collect_submodules('PyQt5') + collect_submodules('fitz')
datas = [
    (os.path.join(ROOT, 'app (1).py'), '.'),
    (os.path.join(ROOT, 'src', 'adapters', 'legacy-portal', 'portal_execution_core.py'), 'src/adapters/legacy-portal'),
] + collect_data_files('selenium')
a = Analysis(
    [os.path.join(ROOT, 'src', 'adapters', 'legacy-portal', 'portal_bridge.py')],
    pathex=[ROOT],
    binaries=[],
    datas=datas,
    hiddenimports=hidden,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='portal-executor', debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=True)
