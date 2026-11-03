#requires -Version 5.1
$ErrorActionPreference = 'Stop'
if (-not $env:KVS_TEST_RUN_DIR) {
    & node (Join-Path $PSScriptRoot 'run.mjs') --entry $PSCommandPath @args
    exit $LASTEXITCODE
}
$root = Split-Path $PSScriptRoot -Parent
Import-Module (Join-Path $root 'installer/Storage.psm1') -Force
Import-Module (Join-Path $root 'installer/Configuration.psm1') -Force
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('kvs-installer-storage-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sandbox | Out-Null
$systemVolume = $env:SystemDrive + '\'
$otherLetter = @('D','E','F') | Where-Object { ($_ + ':') -ne $env:SystemDrive } | Select-Object -First 1
$otherVolume = $otherLetter + ':\'
$script:checks = 0
function Assert-True($Condition,$Message) { if (-not $Condition) { throw $Message }; $script:checks++ }
function Assert-Throws([scriptblock]$Action,$Message) { $failed=$false;try{& $Action | Out-Null}catch{$failed=$true};Assert-True $failed $Message }
try {
    $drives=@([pscustomobject]@{Name=$systemVolume;AvailableFreeSpace=200GB},[pscustomobject]@{Name=$otherVolume;AvailableFreeSpace=100GB})
    $project=Join-Path $sandbox 'studio';New-Item -ItemType Directory -Path $project | Out-Null
    $plan=Get-RenderStoragePlan -ProjectRoot $project -Drives $drives -SystemDrive $env:SystemDrive
    Assert-True ($plan.Path -eq (Join-Path $otherVolume 'RenderCache/KravenVideoStudio') -and -not $plan.SystemDrive) 'Non-system recommendation failed.'
    $existing=[pscustomobject]@{storage=[pscustomobject]@{renderCacheRoot=(Join-Path $systemVolume 'RenderTests/Saved');allowSystemDriveCache=$true;custom='preserve'}}
    $plan=Get-RenderStoragePlan -ProjectRoot $project -Existing $existing -Drives $drives -SystemDrive $env:SystemDrive
    Assert-True ($plan.Path -eq (Join-Path $systemVolume 'RenderTests/Saved') -and $plan.PreviouslyAllowed -and $plan.Source -eq 'saved settings') 'Saved settings lost.'
    $override=Get-RenderStoragePlan -ProjectRoot $project -Existing $existing -Requested (Join-Path $otherVolume 'RenderTests/Chosen') -Drives $drives -SystemDrive $env:SystemDrive
    Assert-True ($override.Path -eq (Join-Path $otherVolume 'RenderTests/Chosen')) 'Explicit choice did not override saved preference.'
    $only=Get-RenderStoragePlan -ProjectRoot $project -Drives @($drives[0]) -SystemDrive $env:SystemDrive
    Assert-True $only.SystemDrive 'C-only fallback not classified.'
    Assert-Throws { Get-RenderStoragePlan -ProjectRoot $project -Requested (('Z'+':\')+'Missing\Cache') -Drives $drives -SystemDrive $env:SystemDrive } 'Unavailable drive accepted.'
    Assert-Throws { Get-RenderStoragePlan -ProjectRoot $project -Requested 'relative' -Drives $drives -SystemDrive $env:SystemDrive } 'Relative path accepted.'
    $cache=Join-Path $sandbox 'cache'
    Assert-True ((Initialize-RenderStorage $cache $project $null) -eq $cache) 'Storage initialization failed.'
    Assert-True (@(Get-ChildItem -LiteralPath $cache -Force).Count -eq 1) 'Probe files remained.'
    Assert-True ((Initialize-RenderStorage $cache $project $null) -eq $cache) 'Existing owned cache not reusable.'
    Assert-Throws { Initialize-RenderStorage $sandbox $project $null } 'Parent installation overlap accepted.'
    Assert-Throws { Initialize-RenderStorage (Join-Path $project 'public/cache') $project $null } 'Public media overlap accepted.'
    $raw=Join-Path $sandbox 'raw'
    Assert-Throws { Initialize-RenderStorage (Join-Path $raw 'cache') $project ([pscustomobject]@{raw=$raw}) } 'Raw-media overlap accepted.'
    $unowned=Join-Path $sandbox 'unowned';New-Item -ItemType Directory -Path $unowned | Out-Null
    [IO.File]::WriteAllText((Join-Path $unowned 'keep'),'original')
    Assert-Throws { Initialize-RenderStorage $unowned $project $null } 'Nonempty unowned cache accepted.'
    Assert-True ([IO.File]::ReadAllText((Join-Path $unowned 'keep')) -eq 'original') 'Unowned file changed.'
    $defaults=[ordered]@{schema=1;storage=[ordered]@{renderCacheRoot=(Join-Path $otherVolume 'RenderTests/New');allowSystemDriveCache=$false}}
    $merged=Merge-StudioConfig $defaults $existing
    Assert-True ($merged.storage.custom -eq 'preserve' -and $merged.storage.renderCacheRoot -eq (Join-Path $systemVolume 'RenderTests/Saved')) 'Upgrade merge lost storage preferences/extensions.'
    Assert-Throws { Merge-StudioConfig $defaults ('{"schema":1,"storage":{"renderCacheRoot":"relative"}}' | ConvertFrom-Json) } 'Invalid stored path accepted.'
    Assert-Throws { Merge-StudioConfig $defaults ('{"schema":1,"storage":{"allowSystemDriveCache":"yes"}}' | ConvertFrom-Json) } 'Invalid acknowledgement type accepted.'
    $policyDefaults=[ordered]@{schema=1;storage=[ordered]@{autoClean=$true;retentionHours=48;cacheWarningGiB=20}}
    $policyMerged=Merge-StudioConfig $policyDefaults $existing
    Assert-True ($policyMerged.storage.autoClean -eq $true -and $policyMerged.storage.retentionHours -eq 48 -and $policyMerged.storage.cacheWarningGiB -eq 20 -and $policyMerged.storage.custom -eq 'preserve') 'Upgrade defaults or unknown fields lost.'
    $custom=Merge-StudioConfig $policyDefaults ('{"storage":{"autoClean":false,"retentionHours":96,"cacheWarningGiB":50,"extension":"keep"}}' | ConvertFrom-Json)
    Assert-True ($custom.storage.autoClean -eq $false -and $custom.storage.retentionHours -eq 96 -and $custom.storage.cacheWarningGiB -eq 50 -and $custom.storage.extension -eq 'keep') 'Custom cleanup preferences lost.'
    $whole=Merge-StudioConfig $policyDefaults ('{"storage":{"retentionHours":48.0,"cacheWarningGiB":2e1}}' | ConvertFrom-Json)
    Assert-True ($whole.storage.retentionHours -eq 48 -and $whole.storage.cacheWarningGiB -eq 20) 'Whole-number JSON notation should match runtime validation.'
    foreach($invalid in @('{"autoClean":"false"}','{"retentionHours":0}','{"retentionHours":47}','{"retentionHours":721}','{"retentionHours":48.5}','{"cacheWarningGiB":0}','{"cacheWarningGiB":"20"}')) {
        $bad=[pscustomobject]@{storage=($invalid | ConvertFrom-Json)}
        Assert-Throws { Assert-StudioConfig $bad } 'Invalid cleanup policy accepted.'
    }
    $planCache=Join-Path $sandbox 'plan-only'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'Install.ps1') -Plan -Backend Cpu -RenderCacheRoot $planCache
    Assert-True ($LASTEXITCODE -eq 0 -and -not (Test-Path -LiteralPath $planCache)) 'Plan created render storage or failed.'
    Write-Host "PASS: $script:checks installer storage checks (selection, C-only, upgrade, validation, ownership and no-write plan)."
} finally {
    $resolved=[IO.Path]::GetFullPath($sandbox)
    if ([IO.Path]::GetDirectoryName($resolved) -eq [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') -and [IO.Path]::GetFileName($resolved).StartsWith('kvs-installer-storage-')) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
