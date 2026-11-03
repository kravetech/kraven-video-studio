Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RenderStoragePlan {
    param([string]$ProjectRoot, $Existing, [string]$Requested, $Drives, [string]$SystemDrive = $env:SystemDrive)
    if (-not $Drives) { $Drives = @([IO.DriveInfo]::GetDrives() | Where-Object { $_.IsReady -and $_.DriveType -eq 'Fixed' }) }
    $saved = $null
    if ($null -ne $Existing -and $Existing.PSObject.Properties.Name -contains 'storage' -and $Existing.storage.PSObject.Properties.Name -contains 'renderCacheRoot') { $saved = $Existing.storage.renderCacheRoot }
    $source = 'recommended'
    if ($Requested) { $selected = $Requested; $source = 'command line' }
    elseif ($saved) { $selected = $saved; $source = 'saved settings' }
    else {
        $preferred = @($Drives | Where-Object { $_.Name.TrimEnd('\') -ne $SystemDrive.TrimEnd('\') } | Sort-Object AvailableFreeSpace -Descending)
        if ($preferred.Count) { $selected = Join-Path $preferred[0].Name 'RenderCache/KravenVideoStudio' }
        else { $selected = Join-Path $env:LOCALAPPDATA 'KravenVideoStudio/RenderCache' }
    }
    if (-not [IO.Path]::IsPathRooted($selected) -or $selected -notmatch '^[a-zA-Z]:[\\/]') { throw 'Select an absolute folder on a local fixed drive.' }
    $selected = [IO.Path]::GetFullPath($selected).TrimEnd('\')
    $driveRoot = [IO.Path]::GetPathRoot($selected)
    $drive = @($Drives | Where-Object { $_.Name.TrimEnd('\') -eq $driveRoot.TrimEnd('\') })
    if (-not $drive.Count) { throw 'Selected render drive is unavailable or is not a local fixed drive. Reconnect it or select another folder.' }
    $allowed = $false
    if ($null -ne $Existing -and $Existing.PSObject.Properties.Name -contains 'storage' -and $Existing.storage.PSObject.Properties.Name -contains 'allowSystemDriveCache') { $allowed = $Existing.storage.allowSystemDriveCache -eq $true }
    [pscustomobject]@{ Path=$selected; Source=$source; FreeGiB=[math]::Round($drive[0].AvailableFreeSpace/1GB,1); SystemDrive=($driveRoot.TrimEnd('\') -eq $SystemDrive.TrimEnd('\')); PreviouslyAllowed=$allowed }
}

function Assert-RenderStoragePath {
    param([string]$Path, [string]$ProjectRoot, $Workspace)
    $full = [IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full -notmatch '^[a-zA-Z]:[\\/]' -or $full -eq [IO.Path]::GetPathRoot($full).TrimEnd('\')) { throw 'Select a dedicated render-cache folder, not a drive root or network share.' }
    $project = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\')
    if ($project -eq $full -or $project.StartsWith($full+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Render storage cannot contain the installation.' }
    $protected = @('public','src','out','workspace' | ForEach-Object { Join-Path $project $_ })
    if ($null -ne $Workspace) { foreach ($p in $Workspace.PSObject.Properties) { if ($p.Value -is [string]) { $protected += $p.Value } } }
    foreach ($p in $protected) {
        $resolved = [IO.Path]::GetFullPath($p).TrimEnd('\')
        if ($resolved -eq $full -or $resolved.StartsWith($full+'\',[StringComparison]::OrdinalIgnoreCase) -or $full.StartsWith($resolved+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Render storage overlaps source or media folders.' }
    }
    foreach ($cloud in @($env:OneDrive,$env:OneDriveConsumer,$env:OneDriveCommercial) | Where-Object { $_ }) {
        $cloudRoot = [IO.Path]::GetFullPath($cloud).TrimEnd('\')
        if ($full -eq $cloudRoot -or $full.StartsWith($cloudRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Use local storage outside OneDrive for disposable render files.' }
    }
    $current = $full
    while ($current) {
        if (Test-Path -LiteralPath $current) {
            $item = Get-Item -LiteralPath $current -Force
            if (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Linked render-storage paths are not supported.' }
        }
        $parent = Split-Path $current -Parent
        if ($parent -eq $current) { break }; $current = $parent
    }
    return $full
}

function Initialize-RenderStorage {
    param([string]$Path, [string]$ProjectRoot, $Workspace)
    $full = Assert-RenderStoragePath $Path $ProjectRoot $Workspace
    $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot($full))
    if (-not $drive.IsReady -or $drive.DriveType -ne 'Fixed') { throw 'Render drive is unavailable or is not a fixed local drive.' }
    if ($drive.AvailableFreeSpace -lt 10GB) { throw 'Render drive needs at least 10 GiB free plus media/render space.' }
    New-Item -ItemType Directory -Path $full -Force | Out-Null
    $marker = Join-Path $full '.kraven-render-cache.json'
    if (-not (Test-Path -LiteralPath $marker)) {
        if (@(Get-ChildItem -LiteralPath $full -Force).Count) { throw 'Select an empty dedicated render folder; existing unowned files were preserved.' }
        $stream = New-Object IO.FileStream($marker,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
        try { $bytes = [Text.Encoding]::UTF8.GetBytes('{"schema":"kraven-render-cache-v1"}'); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Dispose() }
    }
    $markerItem = Get-Item -LiteralPath $marker -Force
    if (($markerItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $markerItem.PSIsContainer -or $markerItem.Length -gt 1KB) { throw 'Invalid render-storage marker.' }
    if ((Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json).schema -ne 'kraven-render-cache-v1') { throw 'Invalid render-storage ownership.' }
    $probe = Join-Path $full ('.probe-'+[Guid]::NewGuid().ToString('N'))
    $moved = $probe + '.moved'
    try {
        [IO.File]::WriteAllText($probe,'storage-probe')
        if ([IO.File]::ReadAllText($probe) -ne 'storage-probe') { throw 'Render-storage read test failed.' }
        [IO.File]::Move($probe,$moved)
    } finally {
        foreach ($file in @($probe,$moved)) {
            if ([IO.Path]::GetDirectoryName([IO.Path]::GetFullPath($file)) -ne $full) { throw 'Storage probe escaped the selected folder.' }
            if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force }
        }
    }
    return $full
}
Export-ModuleMember -Function Get-RenderStoragePlan,Assert-RenderStoragePath,Initialize-RenderStorage
