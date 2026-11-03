Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Assert-ChildPath {
    param([string]$Root, [string]$Path)
    $base = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    $full = [IO.Path]::GetFullPath($Path)
    if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { throw "Path escapes managed directory: $Path" }
    return $full
}

function Test-ArtifactHash {
    param([string]$Path, $Artifact)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { return $false }
    return (Get-FileHash -LiteralPath $Path -Algorithm $Artifact.algorithm).Hash -eq $Artifact.hash
}

function Get-VerifiedArtifact {
    param($Artifact, [string]$CacheDirectory, [switch]$Offline)
    if ([Uri]$Artifact.url -and ([Uri]$Artifact.url).Scheme -ne 'https') { throw 'Downloads require HTTPS.' }
    if ($Artifact.file -ne [IO.Path]::GetFileName($Artifact.file)) { throw 'Invalid artifact file name.' }
    New-Item -ItemType Directory -Path $CacheDirectory -Force | Out-Null
    $target = Assert-ChildPath $CacheDirectory (Join-Path $CacheDirectory $Artifact.file)
    if (Test-ArtifactHash $target $Artifact) { Write-Host "  Verified cache: $($Artifact.file)"; return $target }
    if ($Offline) { throw "Offline cache missing or invalid: $($Artifact.file)" }
    $partial = "$target.partial"
    $previousProgress = $ProgressPreference
    try {
        $ProgressPreference = 'SilentlyContinue'
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        for ($attempt = 1; $attempt -le 3; $attempt++) {
            try {
                Write-Host "  Downloading $($Artifact.file) (attempt $attempt/3)..."
                Invoke-WebRequest -Uri $Artifact.url -OutFile $partial -UseBasicParsing -TimeoutSec 1800
                if (-not (Test-ArtifactHash $partial $Artifact)) { throw "Checksum mismatch: $($Artifact.file). Nothing from this download will be executed." }
                Move-Item -LiteralPath $partial -Destination $target -Force
                return $target
            } catch {
                if ($attempt -eq 3 -or $_.Exception.Message -like 'Checksum mismatch*') { throw }
                Start-Sleep -Seconds (2 * $attempt)
            }
        }
    } finally { $ProgressPreference = $previousProgress }
}

function Expand-SafeZip {
    param([string]$Archive, [string]$Destination)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    $zip = [IO.Compression.ZipFile]::OpenRead($Archive)
    try {
        foreach ($entry in $zip.Entries) {
            $name = $entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
            if ([IO.Path]::IsPathRooted($name) -or $name.Contains(':')) { throw 'Unsafe archive entry.' }
            if ((($entry.ExternalAttributes -shr 16) -band 61440) -eq 40960) { throw 'Archive links are not supported.' }
            $target = Assert-ChildPath $Destination (Join-Path $Destination $name)
            if ($entry.FullName.EndsWith('/')) { New-Item -ItemType Directory -Path $target -Force | Out-Null; continue }
            New-Item -ItemType Directory -Path ([IO.Path]::GetDirectoryName($target)) -Force | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $target, $true)
        }
    } finally { $zip.Dispose() }
}

function Expand-SafeTar {
    param([string]$Archive, [string]$Destination)
    $tar = Join-Path $env:SystemRoot 'System32/tar.exe'
    if (-not (Test-Path -LiteralPath $tar)) { throw 'Windows tar.exe is required (Windows 10 1809+). Update Windows before setup.' }
    $entries = @(& $tar -tzf $Archive)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot list tar archive.' }
    foreach ($name in $entries) {
        if ($name -match '(^[/\\]|(^|[/\\])\.\.([/\\]|$)|:)') { throw 'Unsafe tar entry.' }
        $null = Assert-ChildPath $Destination (Join-Path $Destination $name)
    }
    $details = @(& $tar -tvzf $Archive)
    if ($LASTEXITCODE -ne 0 -or @($details | Where-Object { $_ -match '^[lh]' }).Count) { throw 'Tar links are not supported.' }
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    & $tar -xzf $Archive -C $Destination
    if ($LASTEXITCODE -ne 0) { throw 'Tar extraction failed.' }
}

function Install-Artifact {
    param($Artifact, [string]$ToolsDirectory, [string]$CacheDirectory, [switch]$Offline)
    $archive = Get-VerifiedArtifact $Artifact $CacheDirectory -Offline:$Offline
    $destination = Assert-ChildPath $ToolsDirectory (Join-Path $ToolsDirectory $Artifact.id)
    $marker = Join-Path $destination '.artifact-hash'
    $binary = Assert-ChildPath $destination (Join-Path $destination $Artifact.entry)
    if ((Test-Path -LiteralPath $marker) -and (Test-Path -LiteralPath $binary) -and ((Get-Content -LiteralPath $marker -Raw).Trim() -eq $Artifact.hash)) { return $binary }
    # Stage under the managed root. An interrupted extraction is never a completed install.
    $stage = Assert-ChildPath $ToolsDirectory (Join-Path $ToolsDirectory ('.stage-' + [Guid]::NewGuid().ToString('N')))
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    switch ($Artifact.kind) {
        'zip' { Expand-SafeZip $archive $stage }
        'tgz' { Expand-SafeTar $archive $stage }
        'file' { Copy-Item -LiteralPath $archive -Destination (Join-Path $stage $Artifact.entry) }
        default { throw "Unsupported artifact kind: $($Artifact.kind)" }
    }
    if (-not (Test-Path -LiteralPath (Join-Path $stage $Artifact.entry) -PathType Leaf)) { throw "Expected tool missing after extraction: $($Artifact.entry)" }
    Set-Content -LiteralPath (Join-Path $stage '.artifact-hash') -Value $Artifact.hash -Encoding ascii
    if (Test-Path -LiteralPath $destination) {
        # Keep incomplete/older state recoverable; never recursively delete user data.
        $backup = Assert-ChildPath $ToolsDirectory (Join-Path $ToolsDirectory ($Artifact.id + '.previous-' + [Guid]::NewGuid().ToString('N')))
        Move-Item -LiteralPath $destination -Destination $backup
    }
    Move-Item -LiteralPath $stage -Destination $destination
    return $binary
}

function Invoke-Checked {
    param([string]$File, [string[]]$Arguments = @())
    & $File @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $([IO.Path]::GetFileName($File))" }
}

function Get-WhisperBackend {
    param([ValidateSet('Auto','Cpu','Cuda')][string]$Requested = 'Auto')
    if ($Requested -eq 'Cpu') { return 'Cpu' }
    $smi = Get-Command nvidia-smi.exe -ErrorAction SilentlyContinue
    $supported = $false
    if ($smi) {
        $driver = @(& $smi.Source '--query-gpu=driver_version' '--format=csv,noheader' 2>$null)
        if ($LASTEXITCODE -eq 0 -and $driver.Count) {
            $version = [version](([string]$driver[0]).Trim())
            $supported = $version -ge [version]'551.61'
        }
    }
    if ($Requested -eq 'Cuda' -and -not $supported) { throw 'CUDA 12.4 requires a supported NVIDIA GPU/driver (Windows driver 551.61+). Use -Backend Cpu or update the driver manually.' }
    if ($supported) { return 'Cuda' }
    return 'Cpu'
}

Export-ModuleMember -Function Assert-ChildPath,Test-ArtifactHash,Get-VerifiedArtifact,Expand-SafeZip,Expand-SafeTar,Install-Artifact,Invoke-Checked,Get-WhisperBackend
