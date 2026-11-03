#requires -Version 5.1
[CmdletBinding()]
param([string]$OutputPath)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Utility/Microsoft.PowerShell.Utility.psd1') -Force
$root = Split-Path $PSScriptRoot -Parent
$package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
if (-not $OutputPath) { $OutputPath=Join-Path $root ("out/distribution/kraven-video-studio-$($package.version)-windows.zip") }
$OutputPath=[IO.Path]::GetFullPath($OutputPath)
if (Test-Path -LiteralPath $OutputPath) { throw 'Output archive already exists. Choose a new version/path.' }
# Privacy checks also run independently of archive creation.
& node (Join-Path $root 'scripts/check-privacy.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Source privacy check failed.' }
$roots=@('src','scripts','examples','presets','installer','tests','docs','.claude','.github')
$names=@('INSTALL.md','README.md','AGENTS.md','CLAUDE.md','ARCHITECTURE.md','CHANGELOG.md','THIRD_PARTY_NOTICES.md','CONTRIBUTING.md','SECURITY.md','.gitattributes','.gitignore','package.json','pnpm-lock.yaml','pnpm-workspace.yaml','tsconfig.json','remotion.config.ts','Install.ps1','Install.cmd','Start-Video-Studio.ps1','Start-Video-Studio.cmd')
$names+=@('LICENSE','NOTICE')
$files=@()
foreach($dir in $roots){$files+=@(Get-ChildItem -LiteralPath (Join-Path $root $dir) -File -Recurse -Force)}
foreach($name in $names){$files+=Get-Item -LiteralPath (Join-Path $root $name)}
$manifest=[ordered]@{version=$package.version;files=[ordered]@{}}
$prefix=$root.TrimEnd('\','/')+[IO.Path]::DirectorySeparatorChar
foreach($file in ($files | Sort-Object FullName)){
    if(($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Source links are not packaged.'}
    $relative=$file.FullName.Substring($prefix.Length).Replace('\','/')
    if($relative -match '(^|/)(node_modules|\.studio|workspace|\.git|out)(/|$)' -or $relative -match '^docs/reports/' -or $relative -match '\.(mp4|mov|wav|mp3|pem|key)$' -or $relative -eq 'studio.local.json'){throw "Private/runtime file included: $relative"}
    $body=Get-Content -LiteralPath $file.FullName -Raw
    if($body -match '(?im)(?:^|[\s"''`(=])(?:[a-z]:[\\/]|/(?:Users|home)/[^/\s]+/|\\{2,}[a-z0-9_][a-z0-9_.-]*[\\/]+[a-z0-9_$ .-]+[\\/])' -or $body -match '(?i)(?:^|\n)\s*(?:ai_access\s*:\s*(?:internal|restricted)|type\s*:\s*ai-(?:memory|handoff))\s*(?:\r?\n|$)' -or $body -match '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' -or $body -match 'ghp_[A-Za-z0-9]{30,}') {throw "Private path or credential-like content in: $relative"}
    $manifest.files[$relative]=[ordered]@{sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant();bytes=$file.Length}
}
New-Item -ItemType Directory -Path (Split-Path $OutputPath -Parent) -Force | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::Open($OutputPath,'Create')
try{
    foreach($file in ($files | Sort-Object FullName)){
        $relative=$file.FullName.Substring($prefix.Length).Replace('\','/')
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,('kraven-video-studio/'+$relative),[IO.Compression.CompressionLevel]::Optimal)|Out-Null
    }
    $entry=$zip.CreateEntry('kraven-video-studio/SOURCE-MANIFEST.json')
    $writer=New-Object IO.StreamWriter($entry.Open())
    try{$writer.Write(($manifest | ConvertTo-Json -Depth 8))}finally{$writer.Dispose()}
}finally{$zip.Dispose()}
$hash=(Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath ($OutputPath+'.sha256') -Value ($hash+'  '+[IO.Path]::GetFileName($OutputPath)) -Encoding ascii
Write-Host "Packaged $($files.Count) reviewed source files; tools, models, media, settings and Git history excluded."
Write-Host $OutputPath
Write-Host "SHA256 $hash"
