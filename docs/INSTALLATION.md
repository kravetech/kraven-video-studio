# Kraven Video Studio installation

**You shoot. AI edits. You approve.**

Start with the canonical [INSTALL.md](../INSTALL.md). Obtain a reviewed GitHub source snapshot in a fresh short local directory and run `Install.cmd`. A separately packaged ZIP is optional. This starts Windows PowerShell 5.1 with an execution-policy exception for that process only. Project tools do not change permanent policy, global PATH, credentials, existing tool installations or GPU drivers. If Visual C++ runtime is missing, the signed Microsoft prerequisite installer requests elevation and installs that system runtime. Reviewed tools run with the user's rights; this is not a sandbox.

URLs and SHA-256/SHA-512 checksums are pinned in `installer/toolchain.lock.json`. Corrupted downloads are refused. Reruns reuse verified files and preserve workspace/reviewer/language preferences. Incomplete setup returns failure. Archive extraction rejects traversal and links.

## Setup options

From PowerShell in the source folder (if script policy permits):

```powershell
.\Install.ps1 -Plan                 # no writes or downloads
.\Install.ps1 -Backend Cpu          # no NVIDIA dependency
.\Install.ps1 -Backend Cuda         # CUDA 12.4; Windows driver 551.61+
.\Install.ps1 -SkipExtras           # omit Python, auto-editor and optional VAD
.\Install.ps1 -ModelFile '.\models\ggml-large-v3-q5_0.bin'
.\Install.ps1 -Yes -Reviewer 'Owner' -Language tl
```

`-Yes` explicitly accepts the shown installation and applicable terms. `-CacheDirectory` selects a verified tool-download cache. `-Offline` prevents missing tool downloads, but dependency/font/browser caches must also be populated; it is not a full offline mode. `-SkipSmokeTest` is diagnostic only and cannot establish readiness.

Private tools live under `.studio/tools`; project dependencies under `node_modules`. Paths and preferences are in ignored `studio.local.json`. Always use the launcher so child processes inherit the tools. No global Claude skill is installed.

## First use and checks

Start `Start-Video-Studio.cmd`, complete Claude sign-in and type `/video-studio`. Authentication may open a browser; the user supplies account/subscription or API access. Never store credentials in the repository.

For a tool-enabled PowerShell session: `. .\Start-Video-Studio.ps1 -Shell`. Run `.\Start-Video-Studio.ps1 -Doctor` for version/model checks or `.\installer\Doctor.ps1 -Smoke` for the generated-media check. The smoke test executes Whisper on a synthetic tone and renders both B-roll formats. It verifies tool execution and output decoding, not recognition accuracy or editorial quality.

## Updates and removal

Obtain a reviewed new version in a separate new folder; do not pull over a production working tree. Back up settings/media and migrate them deliberately; rerun setup to refresh tool paths. Keep the old folder until a new sample and production review pass. The launcher disables Claude auto-update only in that process for reproducibility; install reviewed releases to receive updates.

To remove an installation, back up source recordings, delivery packages, configuration and needed caches, then remove the selected folder in Explorer. Deleting media is a separate explicit user action. Independently installed tools, Claude account configuration and shared vendor browser caches are retained.

## Troubleshooting

Read [Known issues](KNOWN-ISSUES.md), including the observed initial-installation smoke exit `0xC0000409`. Preserve failure evidence before a manual rerun; do not treat skipped smoke as acceptance.


- Download/hash failure: rerun. A persistent mismatch needs a reviewed lock update, never a checksum bypass.
- GPU/model failure: try `-Backend Cpu`, check RAM and capture the error. Drivers are managed separately.
- Long paths: extract to a shorter directory before installing.
- Proxy/firewall: permit official Node, GitHub, npm, Hugging Face, Python, browser/font and Anthropic endpoints. Do not disable TLS validation.
- Organizational script/binary restrictions: follow policy. The installer does not disable antivirus or machine controls.

Setup generates the source-defined whoosh/hit/tick effects before diagnostics, including with -SkipSmokeTest. Doctor verifies their format. The updated smoke preview exercises a timed card, zoom and all effects. The sound files are generated locally and are excluded from the source archive.


The approved product name is Kraven Video Studio. Existing launcher/skill commands remain compatible; configure your own branding and media paths in local settings. The toolkit name/tagline are not stamped onto exported videos.

See [versioning](VERSIONING.md), [installer workflow](INSTALLER-WORKFLOW.md) and [source-only license review](LICENSE-REVIEW.md).

Reruns preserve unknown configuration fields, back up original configuration bytes and refresh known managed tool paths/backend. Invalid/future-schema or detected concurrent edits block replacement. Doctor smoke uses unique .installation-check folders; it does not replace existing welcome media. Renderer port 42177 can be overridden with KRAVEN_RENDER_PORT; occupied ports fail and Studio's 3000 is reserved.

## Dedicated render storage

Setup asks for a dedicated disposable render folder and recommends a non-system fixed drive with adequate free space. `-RenderCacheRoot` selects it explicitly; unattended use of the system drive requires `-AllowSystemDriveCache`. The saved location is preserved on reruns. Keep application files, raw media, edited deliverables and disposable cache in separate folders. No existing media or cache is moved automatically. See [render storage](RENDER-STORAGE.md) for layout, process recovery, isolated tests and safe cleanup.
