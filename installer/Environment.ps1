# Dot-source only. Changes this process and its children, never the system PATH.
$studioRoot = Split-Path $PSScriptRoot -Parent
$studioConfigPath = Join-Path $studioRoot 'studio.local.json'
if (-not (Test-Path -LiteralPath $studioConfigPath)) { throw 'Run Install.cmd before starting Kraven Video Studio.' }
$studioConfig = Get-Content -LiteralPath $studioConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$studioDirs = @($studioConfig.tools.node, $studioConfig.tools.ffmpeg, $studioConfig.tools.whisper, $studioConfig.tools.claude, $studioConfig.tools.python, $studioConfig.tools.autoEditor) | Where-Object { $_ } | ForEach-Object { Split-Path $_ -Parent }
$env:PATH = ((@((Join-Path $studioRoot '.studio/bin')) + $studioDirs) -join ';') + ';' + $env:PATH
$env:WHISPER_CLI = $studioConfig.tools.whisper
$env:WHISPER_MODEL = $studioConfig.tools.model
$env:WHISPER_VAD_MODEL = $studioConfig.tools.vad
$env:STUDIO_CONFIG = $studioConfigPath
$env:KRAVEN_PROTECTED_ROOTS = $studioConfig.workspace.raw
$env:REMOTION_BROWSER_EXECUTABLE = $null
$env:DISABLE_AUTOUPDATER = '1'
$studioBin = Join-Path $studioRoot '.studio/bin'
New-Item -ItemType Directory -Path $studioBin -Force | Out-Null
@('@echo off', ('"' + $studioConfig.tools.node + '" "' + $studioConfig.tools.pnpm + '" %*')) | Set-Content -LiteralPath (Join-Path $studioBin 'pnpm.cmd') -Encoding ascii
