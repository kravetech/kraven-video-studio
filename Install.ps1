#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('Auto','Cpu','Cuda')][string]$Backend = 'Auto',
    [string]$CacheDirectory,
    [string]$RenderCacheRoot,
    [switch]$AllowSystemDriveCache,
    [string]$ModelFile,
    [string]$Reviewer,
    [string]$Language = 'tl',
    [switch]$Yes,
    [switch]$Plan,
    [switch]$Offline,
    [switch]$SkipExtras,
    [switch]$SkipSmokeTest
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
$root = [IO.Path]::GetFullPath($PSScriptRoot)
Import-Module (Join-Path $root 'installer/Tools.psm1') -Force
Import-Module (Join-Path $root 'installer/Configuration.psm1') -Force
Import-Module (Join-Path $root 'installer/Storage.psm1') -Force
if ($env:OS -ne 'Windows_NT' -or -not [Environment]::Is64BitProcess -or $env:PROCESSOR_ARCHITECTURE -notin @('AMD64','x86_64')) { throw 'This installer supports native Windows x64 only. Use 64-bit Windows PowerShell.' }
$lock = Get-Content -LiteralPath (Join-Path $root 'installer/toolchain.lock.json') -Raw | ConvertFrom-Json
$backendSelected = Get-WhisperBackend $Backend
Write-Host ($lock.productName + ' - Windows setup')
Write-Host ('Version: ' + $lock.productVersion)
Write-Host $lock.tagline
Write-Host "Project: $root"
Write-Host "Whisper: $backendSelected / large-v3 q5_0 (1.08 GB model)"
Write-Host 'Installs private copies of Node, pnpm, FFmpeg, Whisper, Claude Code and the render browser.'
if (-not $SkipExtras) { Write-Host 'Also installs portable Python, auto-editor and the optional Silero VAD model.' }
Write-Host 'Allow at least 10 GB free space. Initial downloads can exceed 2 GB; CUDA is about 685 MB.'
Write-Host 'No permanent PATH, execution-policy, credential or external-workspace changes are made.'
Write-Host 'If Microsoft Visual C++ runtime is missing, its signed installer requests Windows elevation.'
Write-Host 'Third-party terms apply: read THIRD_PARTY_NOTICES.md, especially Remotion and Claude Code.'
$localConfig = Join-Path $root 'studio.local.json'
$existingConfigHash = ''
$existingConfig = Read-StudioConfig $localConfig -ContentHash ([ref]$existingConfigHash)
$storagePlan = Get-RenderStoragePlan -ProjectRoot $root -Existing $existingConfig -Requested $RenderCacheRoot
Write-Host ('Render cache: ' + $storagePlan.Path + ' [' + $storagePlan.Source + '; ' + $storagePlan.FreeGiB + ' GiB free]')
Write-Host 'A non-system local SSD with ample free space is recommended. CacheDirectory controls downloads only.'
if ($storagePlan.SystemDrive) { Write-Warning 'Render cache is on the Windows drive. Prefer another local drive when available.' }
if ($Plan) { Write-Host 'Plan only: no downloads, installations or configuration writes performed.'; return }
if (-not $Yes -and -not $RenderCacheRoot) {
    $choice = Read-Host ('Render-cache folder [Enter keeps ' + $storagePlan.Path + ']')
    if ($choice.Trim()) { $storagePlan = Get-RenderStoragePlan -ProjectRoot $root -Existing $existingConfig -Requested $choice }
}
if ($storagePlan.SystemDrive -and -not $AllowSystemDriveCache -and -not $storagePlan.PreviouslyAllowed) {
    if ($Yes) { throw 'System-drive render storage requires -AllowSystemDriveCache, or select -RenderCacheRoot on another drive.' }
    if ((Read-Host 'Use the Windows drive for render cache? [y/N]') -notmatch '^(y|yes)$') { throw 'Select another render-cache folder.' }
}

if (-not $Yes) {
    if ((Read-Host 'Download/install these tools under this folder and accept their applicable terms? [y/N]') -notmatch '^(y|yes)$') { throw 'Setup cancelled. Nothing installed.' }
}
if (-not $Reviewer) {
    $Reviewer = if ($Yes) { 'Owner' } else { Read-Host 'Display name of the human who approves transcripts and final packages' }
    if (-not $Reviewer.Trim()) { $Reviewer = 'Owner' }
}
$storageWorkspace = if ($null -ne $existingConfig -and $existingConfig.PSObject.Properties.Name -contains 'workspace') { $existingConfig.workspace } else { $null }
$selectedRenderCache = Initialize-RenderStorage -Path $storagePlan.Path -ProjectRoot $root -Workspace $storageWorkspace
$state = Join-Path $root '.studio'
$tools = Join-Path $state 'tools'
if (-not $CacheDirectory) { $CacheDirectory = Join-Path $state 'downloads' }
$CacheDirectory = [IO.Path]::GetFullPath($CacheDirectory)
New-Item -ItemType Directory -Path $tools -Force | Out-Null
$mutex = $null
try {
    # File lock is released even when setup fails; two installers cannot mutate one workspace.
    $mutex = [IO.File]::Open((Join-Path $state 'install.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    @{status='installing';startedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $state 'installation.json') -Encoding utf8
    if (-not ((Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32/vcruntime140_1.dll')) -and (Test-Path -LiteralPath (Join-Path $env:SystemRoot 'System32/msvcp140.dll')))) {
        $vc = Get-VerifiedArtifact $lock.vcRuntime $CacheDirectory -Offline:$Offline
        $signature = Get-AuthenticodeSignature -LiteralPath $vc
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'O=Microsoft Corporation') { throw 'Microsoft runtime signature check failed.' }
        Write-Host 'Installing Microsoft Visual C++ runtime. Accept the Windows elevation prompt to continue.'
        $process = Start-Process -FilePath $vc -ArgumentList @('/install','/passive','/norestart') -Verb RunAs -Wait -PassThru
        if ($process.ExitCode -notin @(0,3010)) { throw "Microsoft runtime installation failed: $($process.ExitCode)" }
        if ($process.ExitCode -eq 3010) { throw 'Microsoft runtime requires a restart. Restart Windows and rerun setup.' }
    }
    $node = Install-Artifact $lock.node $tools $CacheDirectory -Offline:$Offline
    $pnpm = Install-Artifact $lock.pnpm $tools $CacheDirectory -Offline:$Offline
    $ffmpeg = Install-Artifact $lock.ffmpeg $tools $CacheDirectory -Offline:$Offline
    $whisperArtifact = if ($backendSelected -eq 'Cuda') { $lock.whisperCuda } else { $lock.whisperCpu }
    $whisper = Install-Artifact $whisperArtifact $tools $CacheDirectory -Offline:$Offline
    $claude = Install-Artifact $lock.claude $tools $CacheDirectory -Offline:$Offline
    $modelDir = Join-Path $tools 'models'
    New-Item -ItemType Directory -Path $modelDir -Force | Out-Null
    $model = Join-Path $modelDir $lock.model.file
    if ($ModelFile) {
        if (-not (Test-ArtifactHash $ModelFile $lock.model)) { throw 'The supplied model does not match the pinned large-v3 q5_0 SHA-256.' }
        if ([IO.Path]::GetFullPath($ModelFile) -ne [IO.Path]::GetFullPath($model)) { Copy-Item -LiteralPath $ModelFile -Destination $model -Force }
    } elseif (-not (Test-ArtifactHash $model $lock.model)) {
        Copy-Item -LiteralPath (Get-VerifiedArtifact $lock.model $CacheDirectory -Offline:$Offline) -Destination $model -Force
    }
    $python = $null; $autoEditor = $null; $vad = $null
    if (-not $SkipExtras) {
        $python = Install-Artifact $lock.python $tools $CacheDirectory -Offline:$Offline
        $autoEditor = Install-Artifact $lock.autoEditor $tools $CacheDirectory -Offline:$Offline
        $vad = Join-Path $modelDir $lock.vad.file
        if (-not (Test-ArtifactHash $vad $lock.vad)) { Copy-Item -LiteralPath (Get-VerifiedArtifact $lock.vad $CacheDirectory -Offline:$Offline) -Destination $vad -Force }
    }
    $config = [ordered]@{
        schema = 1; backend = $backendSelected; reviewer = $Reviewer; language = $Language
        tools = [ordered]@{ node = $node; pnpm = $pnpm; ffmpeg = $ffmpeg; whisper = $whisper; model = $model; claude = $claude; python = $python; autoEditor = $autoEditor; vad = $vad }
        workspace = [ordered]@{ raw = (Join-Path $root 'workspace/raw'); edited = (Join-Path $root 'workspace/Edited'); upload = (Join-Path $root 'workspace/For Upload') }
        storage = [ordered]@{ renderCacheRoot=$selectedRenderCache; allowSystemDriveCache=[bool]$storagePlan.SystemDrive; autoClean=$true; retentionHours=48; cacheWarningGiB=20 }
        post = [ordered]@{ primaryHashtag = '#VideoStudio'; communityLine = $null }
    }
    $config = Merge-StudioConfig $config $existingConfig
    $config.storage.renderCacheRoot = $selectedRenderCache
    $config.storage.allowSystemDriveCache = [bool]$storagePlan.SystemDrive
    foreach ($dir in @($config.workspace.raw, $config.workspace.edited, $config.workspace.upload)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Write-StudioConfig $localConfig $config -ExpectedHash $existingConfigHash
    . (Join-Path $root 'installer/Environment.ps1')
    Push-Location $root
    try {
        Invoke-Checked $node @($pnpm, 'install', '--frozen-lockfile', '--ignore-scripts')
        Invoke-Checked $node @($pnpm, 'version:check')
        Invoke-Checked $node @($pnpm, 'check:privacy')
        Invoke-Checked $node @($pnpm, 'check:licenses', '--installed')
        # Dependencies are pinned; pnpm-workspace.yaml allowlists the esbuild build hook.
        Invoke-Checked $node @($pnpm, 'rebuild', 'esbuild')
        Invoke-Checked $node @($pnpm, 'exec', 'remotion', 'browser', 'ensure')
        # Generate source-defined effects even when the optional smoke test is skipped.
        Invoke-Checked $node @('scripts/make-sfx.mjs')
        Invoke-Checked $node @($pnpm, 'typecheck')
        & (Join-Path $root 'installer/Doctor.ps1') -Smoke:(-not $SkipSmokeTest)
        if (-not $?) { throw 'Installation checks failed.' }
    } finally { Pop-Location }
    [ordered]@{ version = $lock.productVersion; checkedAt = [DateTime]::UtcNow.ToString('o'); backend = $backendSelected; smokeTest = (-not $SkipSmokeTest); authentication = 'User must sign in through Claude Code'; status = 'tools-installed' } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $state 'installation.json') -Encoding utf8
    Write-Host ''
    Write-Host 'TOOLS INSTALLED. Next: double-click Start-Video-Studio.cmd, sign in to Claude Code, then type /video-studio.'
    Write-Host 'Account/subscription access is supplied by the user. No account was created and no video was published.'
} catch {
    if ($mutex) { @{status='incomplete';failedAt=[DateTime]::UtcNow.ToString('o');error=$_.Exception.Message} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $state 'installation.json') -Encoding utf8 }
    Write-Error "SETUP INCOMPLETE: $($_.Exception.Message). Correct the problem and rerun Install.cmd; verified downloads are reused." -ErrorAction Continue
    exit 1
} finally { if ($mutex) { $mutex.Dispose() } }
