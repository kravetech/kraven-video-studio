#requires -Version 5.1
[CmdletBinding()]
param([switch]$Shell, [switch]$Doctor)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'installer/Environment.ps1')
Set-Location -LiteralPath $PSScriptRoot
$productIdentity = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'installer/toolchain.lock.json') -Raw | ConvertFrom-Json
Write-Host $productIdentity.productName
Write-Host $productIdentity.tagline
if ($Doctor) { & (Join-Path $PSScriptRoot 'installer/Doctor.ps1'); return }
$receiptPath = Join-Path $PSScriptRoot '.studio/installation.json'
if (-not (Test-Path -LiteralPath $receiptPath) -or (Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json).status -ne 'tools-installed') { throw 'Setup is incomplete. Rerun Install.cmd before starting production.' }
if ($Shell) { Write-Host 'Kraven Video Studio shell ready. Try pnpm dev or pnpm transcribe --help.'; return }
Write-Host 'Claude Code will use your own account. Sign in when prompted, then type /video-studio.'
& $studioConfig.tools.claude
exit $LASTEXITCODE
