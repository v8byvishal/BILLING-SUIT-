[CmdletBinding()]
param(
  [switch]$SkipTests,
  [switch]$SkipClean
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
function Fail([string]$Code,[string]$Message){ Write-Error "$Code`: $Message"; exit 1 }
function Require-Command([string]$Name,[string]$Code){ if(-not (Get-Command $Name -ErrorAction SilentlyContinue)){ Fail $Code "$Name is required" } }
function Invoke-Gate([string]$Name,[scriptblock]$Command){ Write-Host "`n=== $Name ==="; & $Command; if($LASTEXITCODE -ne 0){ Fail "${Name}_FAIL" "Command exited $LASTEXITCODE" } }

if([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT){ Fail 'WINDOWS_BUILD_REQUIRED' 'Run this release builder on Windows x64.' }
if($env:PROCESSOR_ARCHITECTURE -notmatch 'AMD64|x86_64'){ Fail 'TOOLCHAIN_VERSION_MISMATCH' "Windows x64 is required; found $env:PROCESSOR_ARCHITECTURE" }
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $RepoRoot
$required = @('package.json','package-lock.json','app (1).py','src/adapters/legacy-portal/portal_bridge.py','src/adapters/legacy-portal/portal_execution_core.py','packaging/portal-executor.spec','packaging/requirements-executor.txt','scripts/generate-release-manifest.js','scripts/verify-release.js')
foreach($item in $required){ if(-not (Test-Path -LiteralPath (Join-Path $RepoRoot $item))){ Fail 'REQUIRED_SOURCE_MISSING' $item } }
Require-Command 'git' 'MISSING_GIT'; Require-Command 'node' 'MISSING_NODE'; Require-Command 'npm' 'MISSING_NPM'; Require-Command 'py' 'MISSING_PYTHON'
$nodeVersion = (& node --version).Trim(); $nodeMajor=[int](($nodeVersion -replace '^v','').Split('.')[0]); if($nodeMajor -lt 20){ Fail 'TOOLCHAIN_VERSION_MISMATCH' "Node 20+ required; found $nodeVersion" }
$npmVersion=(& npm --version).Trim(); $pythonVersion=(& py -3 --version 2>&1).ToString().Trim(); if($pythonVersion -notmatch 'Python 3\.(10|11|12)\.'){ Fail 'TOOLCHAIN_VERSION_MISMATCH' "Python 3.10-3.12 required; found $pythonVersion" }
& py -3 -m pip --version *> $null; if($LASTEXITCODE -ne 0){ Fail 'MISSING_PIP' 'Python pip is unavailable' }
$package=Get-Content package.json -Raw | ConvertFrom-Json
foreach($name in @('build:python:win','build:win','release:manifest','release:verify')){ if(-not $package.scripts.PSObject.Properties[$name]){ Fail 'REQUIRED_SCRIPT_MISSING' $name } }
$storageNames=@('Storage','Cases','Bills','Inbox','Custom_Codes','Audit'); foreach($name in $storageNames){ if((Join-Path $RepoRoot $name) -in @((Join-Path $RepoRoot 'dist'),(Join-Path $RepoRoot 'release'),(Join-Path $RepoRoot 'build-resources'))){ Fail 'UNSAFE_CLEAN_TARGET' $name } }
$releaseDir=Join-Path $RepoRoot 'release'; New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null; $probe=Join-Path $releaseDir '.write-test'; Set-Content $probe 'ok'; Remove-Item $probe
if(-not $SkipClean){ foreach($relative in @('dist','release','build-resources/python-executor')){ $target=Join-Path $RepoRoot $relative; if(Test-Path $target){ Remove-Item -LiteralPath $target -Recurse -Force } }; New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null }
$commit=(& git rev-parse HEAD).Trim(); $windowsVersion=[Environment]::OSVersion.VersionString
Invoke-Gate 'NPM_CI' { npm ci }
Invoke-Gate 'PYTHON_DEPENDENCIES' { py -3 -m pip install -r packaging/requirements-executor.txt }
$pyInstallerVersion=(& py -3 -m PyInstaller --version).Trim(); if(-not $pyInstallerVersion){ Fail 'TOOLCHAIN_VERSION_MISMATCH' 'PyInstaller unavailable after dependency installation' }
if(-not $SkipTests){ Invoke-Gate 'TEST_GATE' { npm test }; Invoke-Gate 'PYTHON_TEST_GATE' { py -3 -m unittest discover -s tests/python } } else { Write-Host 'TEST GATE = SKIPPED BY EXPLICIT OPERATOR SWITCH' }
Invoke-Gate 'PYTHON_EXECUTOR_BUILD' { npm run build:python:win }
$executor=Join-Path $RepoRoot 'build-resources/python-executor/portal-executor.exe'; if(-not (Test-Path $executor) -or (Get-Item $executor).Length -le 0){ Fail 'PYTHON_EXECUTOR_UNAVAILABLE' $executor }
$executorHash=(Get-FileHash $executor -Algorithm SHA256).Hash.ToLowerInvariant()
$bridgeOutput=('{}' | & $executor 2>&1 | Out-String); if($bridgeOutput -notmatch 'VNEXT_RESULT='){ Fail 'PYTHON_EXECUTOR_UNAVAILABLE' 'Controlled invalid request did not return bridge protocol output' }
Invoke-Gate 'ELECTRON_BUILD' { npm run build:win }
$expected="CGHS-Billing-Suite-VNEXT-$($package.version)-x64.exe"; $artifact=Join-Path $releaseDir $expected; if(-not (Test-Path $artifact) -or (Get-Item $artifact).Length -le 0){ Fail 'ELECTRON_ARTIFACT_MISSING' $expected }
Invoke-Gate 'RELEASE_MANIFEST' { npm run release:manifest }
Invoke-Gate 'RELEASE_VERIFY' { npm run release:verify }
$manifestPath=Join-Path $releaseDir 'release-manifest.json'; $sumsPath=Join-Path $releaseDir 'SHA256SUMS.txt'; if(-not (Test-Path $manifestPath)){ Fail 'RELEASE_MANIFEST_MISSING' $manifestPath }; if(-not (Test-Path $sumsPath)){ Fail 'CHECKSUMS_MISSING' $sumsPath }
$manifest=Get-Content $manifestPath -Raw | ConvertFrom-Json; $artifactHash=(Get-FileHash $artifact -Algorithm SHA256).Hash.ToLowerInvariant(); if($manifest.artifacts[0].sha256 -ne $artifactHash){ Fail 'HASH_MISMATCH' $expected }; if($manifest.python_executor_artifact.sha256 -ne $executorHash){ Fail 'HASH_MISMATCH' 'portal-executor.exe' }
$rateHash=(Get-FileHash 'src/services/cghs/data/hfos-reference-rates.json' -Algorithm SHA256).Hash.ToLowerInvariant(); if($rateHash -ne 'b606c25a035d0b49f433741655c64ca0e019e9fc701d3b534968361804d1a5ba'){ Fail 'RATE_SNAPSHOT_MISMATCH' $rateHash }
if(Get-ChildItem $releaseDir -Recurse -File | Where-Object {$_.Extension -eq '.pdf'}){ Fail 'SECURITY_CHECK_FAIL' 'PDF found in release payload' }
$tracked=(& git grep -Il -E 'BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}' -- . ':(exclude)tests/**' 2>$null); if($LASTEXITCODE -eq 0 -and $tracked){ Fail 'SECURITY_CHECK_FAIL' "Possible secret in tracked source: $tracked" }
$report=@"
WINDOWS RELEASE ACCEPTANCE HANDOFF
Repository commit: $commit
Build timestamp: $($manifest.build_timestamp)
Windows version: $windowsVersion
Architecture: $env:PROCESSOR_ARCHITECTURE
Node version: $nodeVersion
npm version: $npmVersion
Python version: $pythonVersion
PyInstaller version: $pyInstallerVersion
TEST GATE = $(if($SkipTests){'SKIPPED'}else{'PASS'})
PYTHON EXECUTOR BUILD = PASS
Python executor: portal-executor.exe
Python executor SHA-256: $executorHash
ELECTRON ARTIFACT BUILD = PASS
Artifact: $expected
Artifact bytes: $((Get-Item $artifact).Length)
Artifact SHA-256: $artifactHash
RELEASE MANIFEST = PASS
CHECKSUM VERIFICATION = PASS
RELEASE VERIFICATION = PASS
RATE SNAPSHOT SHA-256: $rateHash
SOURCE TESTING = $(if($SkipTests){'SKIPPED'}else{'PASS'})
BUILD VALIDATION = PASS
WINDOWS RUNTIME VALIDATION = NOT RUN — FOLLOW PHASE15_WINDOWS_HANDOFF.md
CLEAN-MACHINE VALIDATION = NOT RUN — FOLLOW PHASE15_WINDOWS_HANDOFF.md
REAL PDF REGRESSION = NOT RUN — SOURCE PDFs NOT AVAILABLE
LIVE PORTAL VALIDATION = NOT RUN — AUTHENTICATED PORTAL/CDP SESSION REQUIRED
WINDOWS RELEASE CANDIDATE = NOT ESTABLISHED — RUNTIME ACCEPTANCE PENDING
"@
Set-Content -LiteralPath (Join-Path $releaseDir 'WINDOWS_RELEASE_ACCEPTANCE.txt') -Value $report -Encoding UTF8
Write-Host $report
Write-Host "Release output: $releaseDir"
