#requires -Version 5.1
$ErrorActionPreference = 'Stop'
if (-not $env:KVS_TEST_RUN_DIR) {
    & node (Join-Path $PSScriptRoot 'run.mjs') --entry $PSCommandPath @args
    exit $LASTEXITCODE
}
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
$root = Split-Path $PSScriptRoot -Parent
Import-Module (Join-Path $root 'installer/Tools.psm1') -Force
Import-Module (Join-Path $root 'installer/Configuration.psm1') -Force
$sandbox = Join-Path ([IO.Path]::GetTempPath()) ('video-studio-test-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $sandbox | Out-Null
function Assert-True($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Assert-Throws([scriptblock]$Action, [string]$Message) { $thrown=$false; try { & $Action | Out-Null } catch { $thrown=$true }; Assert-True $thrown $Message }
try {
    $fixture = Join-Path $sandbox 'tool.bin'
    Set-Content -LiteralPath $fixture -Value 'original' -Encoding ascii
    $artifact = [pscustomobject]@{algorithm='SHA256';hash=(Get-FileHash -LiteralPath $fixture).Hash;url='https://example.invalid/tool.bin';file='tool.bin'}
    Assert-True (Test-ArtifactHash $fixture $artifact) 'Valid hash rejected.'
    Add-Content -LiteralPath $fixture -Value 'tampered'
    Assert-True (-not (Test-ArtifactHash $fixture $artifact)) 'Tampered file accepted.'
    Assert-Throws { Get-VerifiedArtifact $artifact $sandbox -Offline } 'Corrupt offline cache accepted.'
    Assert-Throws { Assert-ChildPath $sandbox (Join-Path $sandbox '../escaped') } 'Path traversal accepted.'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $badZip = Join-Path $sandbox 'traversal.zip'
    $zip = [IO.Compression.ZipFile]::Open($badZip,'Create')
    $entry=$zip.CreateEntry('../escaped.txt'); $writer=New-Object IO.StreamWriter($entry.Open()); $writer.Write('bad'); $writer.Dispose(); $zip.Dispose()
    Assert-Throws { Expand-SafeZip $badZip (Join-Path $sandbox 'unpacked') } 'ZIP traversal accepted.'
    $lock = Get-Content -LiteralPath (Join-Path $root 'installer/toolchain.lock.json') -Raw | ConvertFrom-Json
    foreach ($name in @('node','pnpm','ffmpeg','whisperCpu','whisperCuda','model','claude','python','autoEditor','vad','vcRuntime')) {
        $a=$lock.$name
        Assert-True (([uri]$a.url).Scheme -eq 'https') "Non-HTTPS source: $name"
        $length=if($a.algorithm -eq 'SHA512'){128}else{64}
        Assert-True ($a.hash -match "^[a-fA-F0-9]{$length}$") "Missing checksum: $name"
    }
    Assert-True ((Get-WhisperBackend Cpu) -eq 'Cpu') 'Explicit CPU selection ignored.'
    $before=Test-Path -LiteralPath (Join-Path $root 'studio.local.json')
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'Install.ps1') -Plan -Backend Cpu
    Assert-True ($LASTEXITCODE -eq 0) 'Dry run failed.'
    Assert-True ((Test-Path -LiteralPath (Join-Path $root 'studio.local.json')) -eq $before) 'Dry run wrote configuration.'
    $preferences = Join-Path $sandbox 'studio.local.json'
    $original = '{"schema":1,"reviewer":"Fixture Owner","language":"en","workspace":{"raw":"raw-fixture","edited":"edits-fixture","upload":"upload-fixture","extension":true},"post":{"primaryHashtag":"#Fixture","communityLine":null,"extra":[1,2]},"tools":{"node":"old-node","extension":"keep"},"brand":{"voice":"keep","flags":[false,true]}}'
    [IO.File]::WriteAllText($preferences, $original)
    $oldHash = (Get-FileHash -LiteralPath $preferences -Algorithm SHA256).Hash
    $existing = Read-StudioConfig $preferences
    $defaults = [ordered]@{schema=1;backend='Cpu';reviewer='New';language='tl';workspace=[ordered]@{raw='new-raw';edited='new-edits';upload='new-upload'};post=[ordered]@{primaryHashtag='#New';communityLine='New'};tools=[ordered]@{node='new-node'}}
    $merged = Merge-StudioConfig $defaults $existing
    Assert-True ($merged.reviewer -eq 'Fixture Owner' -and $merged.language -eq 'en') 'Editorial preferences lost.'
    Assert-True ($merged.brand.voice -eq 'keep' -and $merged.brand.flags.Count -eq 2 -and $merged.workspace.extension) 'Unknown settings lost.'
    Assert-True ($merged.post.extra.Count -eq 2 -and $null -eq $merged.post.communityLine) 'Post settings changed.'
    Assert-True ($merged.tools.node -eq 'new-node' -and $merged.tools.extension -eq 'keep') 'Tool refresh/extension merge failed.'
    $merged.brand | Add-Member -MemberType NoteProperty -Name unicode -Value ('Owner ' + [char]0xf1)
    Write-StudioConfig $preferences $merged -ExpectedHash $oldHash
    $readHash = ''
    $saved = Read-StudioConfig $preferences -ContentHash ([ref]$readHash)
    Assert-True ($saved.brand.unicode -eq ('Owner ' + [char]0xf1)) 'Unicode setting changed.'
    Assert-True ($readHash -eq (Get-FileHash -LiteralPath $preferences -Algorithm SHA256).Hash) 'Config read/hash evidence differs.'
    $backups = @(Get-ChildItem -LiteralPath (Join-Path $sandbox '.studio/config-backups') -File)
    Assert-True ($backups.Count -eq 1 -and [IO.File]::ReadAllText($backups[0].FullName) -eq $original) 'Original settings backup differs.'
    Assert-Throws { Write-StudioConfig $preferences $merged -ExpectedHash $oldHash } 'Stale settings replacement accepted.'
    Assert-Throws { Merge-StudioConfig $defaults ('{"schema":2}' | ConvertFrom-Json) } 'Future schema accepted.'
    Assert-Throws { Merge-StudioConfig $defaults ('{"schema":"1"}' | ConvertFrom-Json) } 'Invalid schema type accepted.'
    Assert-Throws { Merge-StudioConfig $defaults ('{"workspace":"bad"}' | ConvertFrom-Json) } 'Invalid settings accepted.'
    [IO.File]::WriteAllText($preferences, '{invalid')
    Assert-Throws { Write-StudioConfig $preferences $merged } 'Malformed settings overwritten.'
    Assert-True ([IO.File]::ReadAllText($preferences) -eq '{invalid') 'Malformed settings changed.'
    Write-Host 'PASS: checksum/offline/traversal/pins/CPU/no-write plan; settings merge, original-byte backup, stale-write and invalid-schema refusal.'
} finally {
    # Resolve and verify the exact test directory before recursive cleanup.
    $resolved = [IO.Path]::GetFullPath($sandbox)
    $tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
    if ($resolved.StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase) -and [IO.Path]::GetFileName($resolved).StartsWith('video-studio-test-')) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}

# Keep storage-policy checks in the existing CI installer gate.
& (Join-Path $PSScriptRoot 'storage.tests.ps1')
