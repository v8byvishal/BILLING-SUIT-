# PyInstaller spec for the preserved legacy Selenium/CDP executor.
from PyInstaller.utils.hooks import collect_submodules, collect_data_files
hidden = collect_submodules('selenium') + collect_submodules('PyQt5') + collect_submodules('fitz')
datas = [
    ('app (1).py', '.'),
    ('src/adapters/legacy-portal/portal_execution_core.py', 'src/adapters/legacy-portal'),
] + collect_data_files('selenium')
a = Analysis(['src/adapters/legacy-portal/portal_bridge.py'], pathex=['.'], binaries=[], datas=datas, hiddenimports=hidden, hookspath=[], runtime_hooks=[], excludes=[])
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='portal-executor', debug=False, bootloader_ignore_signals=False, strip=False, upx=False, console=True)
