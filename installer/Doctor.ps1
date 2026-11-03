#requires -Version 5.1
[CmdletBinding()]
param([switch]$Smoke)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
$root = Split-Path $PSScriptRoot -Parent
. (Join-Path $PSScriptRoot 'Environment.ps1')
Import-Module (Join-Path $PSScriptRoot 'Tools.psm1') -Force
Write-Host 'Kraven Video Studio - You shoot. AI edits. You approve.'
Write-Host 'Checking the installed toolchain...'
Invoke-Checked $studioConfig.tools.node @((Join-Path $root 'scripts/check-tools.mjs'))
$lock = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'toolchain.lock.json') -Raw | ConvertFrom-Json
if (-not (Test-ArtifactHash $studioConfig.tools.model $lock.model)) { throw 'Whisper model checksum failed.' }
Push-Location $root
try {
    Invoke-Checked $studioConfig.tools.node @('scripts/storage.mjs', '--check')
    Invoke-Checked $studioConfig.tools.node @('scripts/make-sfx.mjs', '--check')
    if ($Smoke) { Invoke-Checked $studioConfig.tools.node @('scripts/installation-smoke.mjs') }
} finally { Pop-Location }
Write-Host 'Toolchain checks passed. Claude account sign-in and editorial approval remain user steps.'
