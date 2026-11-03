Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-StudioConfig {
    param($Config)
    if ($null -eq $Config -or $Config -isnot [pscustomobject]) { throw 'Local configuration must be a JSON object.' }
    if ($Config.PSObject.Properties.Name -contains 'schema' -and (($Config.schema -isnot [int] -and $Config.schema -isnot [long]) -or $Config.schema -ne 1)) { throw 'Unsupported local configuration schema. Preserve the file and migrate it explicitly.' }
    foreach ($name in @('reviewer','language')) {
        if ($Config.PSObject.Properties.Name -contains $name -and ($Config.$name -isnot [string] -or -not $Config.$name.Trim())) { throw "Invalid local configuration: $name" }
    }
    foreach ($name in @('workspace','post','tools','storage')) {
        if ($Config.PSObject.Properties.Name -contains $name -and $Config.$name -isnot [pscustomobject]) { throw "Invalid local configuration object: $name" }
    }
    if ($Config.PSObject.Properties.Name -contains 'workspace') {
        foreach ($name in @('raw','edited','upload')) {
            if ($Config.workspace.PSObject.Properties.Name -contains $name -and ($Config.workspace.$name -isnot [string] -or -not $Config.workspace.$name.Trim())) { throw "Invalid workspace path: $name" }
        }
    }
    if ($Config.PSObject.Properties.Name -contains 'storage') {
        if ($Config.storage.PSObject.Properties.Name -contains 'renderCacheRoot' -and ($Config.storage.renderCacheRoot -isnot [string] -or -not [IO.Path]::IsPathRooted($Config.storage.renderCacheRoot))) { throw 'Render-cache location must be an absolute path.' }
        if ($Config.storage.PSObject.Properties.Name -contains 'autoClean' -and $Config.storage.autoClean -isnot [bool]) { throw 'Automatic cache cleanup must be Boolean.' }
        foreach ($rule in @(@('retentionHours',48,720),@('cacheWarningGiB',1,10240))) {
            $name=$rule[0]
            if ($Config.storage.PSObject.Properties.Name -contains $name) {
                $value=$Config.storage.$name
                $numeric=$value -is [int] -or $value -is [long] -or $value -is [double] -or $value -is [decimal]
                if (-not $numeric -or -not ($value -ge $rule[1] -and $value -le $rule[2] -and $value -eq [Math]::Truncate([double]$value))) { throw "Invalid storage setting: $name" }
            }
        }
        if ($Config.storage.PSObject.Properties.Name -contains 'allowSystemDriveCache' -and $Config.storage.allowSystemDriveCache -isnot [bool]) { throw 'System-drive cache choice must be Boolean.' }
    }
    function Assert-Depth($Value, [int]$Depth) {
        if ($Depth -gt 64) { throw 'Local configuration exceeds the supported nesting depth; nothing was rewritten.' }
        if ($Value -is [pscustomobject]) { foreach ($p in $Value.PSObject.Properties) { Assert-Depth $p.Value ($Depth + 1) } }
        elseif ($Value -is [array]) { foreach ($v in $Value) { Assert-Depth $v ($Depth + 1) } }
    }
    Assert-Depth $Config 0
}

function Read-StudioConfig {
    param([string]$Path, [ref]$ContentHash)
    if (-not (Test-Path -LiteralPath $Path)) { return $null }
    $file = Get-Item -LiteralPath $Path -Force
    if ($file.PSIsContainer -or ($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $file.Length -gt 1MB) { throw 'Local configuration must be a regular JSON file of at most 1 MB.' }
    $bytes = [IO.File]::ReadAllBytes($Path)
    $existing = [Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xfeff) | ConvertFrom-Json
    Assert-StudioConfig $existing
    if ($PSBoundParameters.ContainsKey('ContentHash')) {
        $algorithm = [Security.Cryptography.SHA256]::Create()
        try { $ContentHash.Value = [BitConverter]::ToString($algorithm.ComputeHash($bytes)).Replace('-','') } finally { $algorithm.Dispose() }
    }
    return $existing
}

function Merge-StudioConfig {
    param($Defaults, $Existing)
    $merged = $Defaults | ConvertTo-Json -Depth 100 | ConvertFrom-Json
    if ($null -eq $Existing) { Assert-StudioConfig $merged; return $merged }
    Assert-StudioConfig $Existing
    foreach ($p in $Existing.PSObject.Properties) {
        if ($p.Name -in @('schema','backend')) { continue }
        if ($p.Name -in @('workspace','post','tools','storage')) {
            if ($merged.PSObject.Properties.Name -notcontains $p.Name) { $merged | Add-Member -MemberType NoteProperty -Name $p.Name -Value ([pscustomobject]@{}) }
            foreach ($child in $p.Value.PSObject.Properties) {
                # Known tool paths are regenerated for this installation; extension settings survive.
                if ($p.Name -eq 'tools' -and $merged.tools.PSObject.Properties.Name -contains $child.Name) { continue }
                $merged.($p.Name) | Add-Member -MemberType NoteProperty -Name $child.Name -Value $child.Value -Force
            }
        } else {
            $merged | Add-Member -MemberType NoteProperty -Name $p.Name -Value $p.Value -Force
        }
    }
    Assert-StudioConfig $merged
    return $merged
}

function Write-StudioConfig {
    param([string]$Path, $Config, [string]$ExpectedHash)
    Assert-StudioConfig $Config
    $Path = [IO.Path]::GetFullPath($Path)
    $root = Split-Path $Path -Parent
    $state = Join-Path $root '.studio'
    $backups = Join-Path $state 'config-backups'
    foreach ($dir in @($state,$backups)) {
        if (Test-Path -LiteralPath $dir) {
            $item = Get-Item -LiteralPath $dir -Force
            if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Configuration state directories must not be links.' }
        }
    }
    # Recheck before replacement; malformed settings are never silently repaired or overwritten.
    $null = Read-StudioConfig $Path
    if ($PSBoundParameters.ContainsKey('ExpectedHash')) {
        $actual = if (Test-Path -LiteralPath $Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash } else { '' }
        if ($actual -ne $ExpectedHash) { throw 'Local configuration changed during setup; preserve it and rerun.' }
    }
    New-Item -ItemType Directory -Path $backups -Force | Out-Null
    $id = [Guid]::NewGuid().ToString('N')
    $temp = Join-Path $state ("config-stage-$id.json")
    $backup = Join-Path $backups ("studio.local-$id.json")
    try {
        [IO.File]::WriteAllText($temp, ($Config | ConvertTo-Json -Depth 100), (New-Object Text.UTF8Encoding($false)))
        if (Test-Path -LiteralPath $Path) {
            [IO.File]::Replace($temp, $Path, $backup)
            Write-Host 'Existing local configuration backed up under .studio/config-backups before atomic replacement.'
        } else { [IO.File]::Move($temp, $Path) }
    } finally { if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force } }
}

Export-ModuleMember -Function Assert-StudioConfig,Read-StudioConfig,Merge-StudioConfig,Write-StudioConfig
