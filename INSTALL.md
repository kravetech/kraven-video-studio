# Install Kraven Video Studio

**You shoot. AI edits. You approve.**

Canonical installation instructions for people and AI assistants. Version **1.0.0** includes pinned Zod 4.6.6, managed render storage and configurable automatic cleanup; review the [known issues](docs/KNOWN-ISSUES.md) before installation. Supported installer target: **Windows x64, 64-bit Windows PowerShell 5.1 or later**. Do not assume macOS/Linux installer support.

Use the official v1.0.0 source-installer archive and its published checksum in a separate application folder, or the exact source commit recorded in release notes. Production cutover requires the workflow acceptance below.

## 1. Get a reviewed source snapshot

Use a fresh, short, writable local folder outside media folders, Program Files and cloud-synced folders. Keep the old studio intact. Obtain the maintainer-approved tag or full commit from the repository's release notes; do not deploy an unreviewed moving branch.

The repository is `kravetech/kraven-video-studio`. Choose an explicitly reviewed tag/full commit from the repository releases. With Git already available:

```powershell
git clone https://github.com/kravetech/kraven-video-studio.git
Set-Location .\kraven-video-studio
git checkout --detach <reviewed-tag-or-full-commit>
git rev-parse HEAD
```

Replace the angle-bracket placeholder before execution. If Git is absent, download **Source code (zip)** for the reviewed release/tag from GitHub and extract it instead. A custom installer ZIP is unnecessary. Review downloaded scripts before unblocking them; follow organizational policy. GitHub-generated archives and earlier custom ZIPs have different bytes: do not reuse an old ZIP checksum. Prefer a verified full commit for source identity. See [GitHub's archive guarantees](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives).

## 2. Establish the installation plan

Read [third-party terms](THIRD_PARTY_NOTICES.md), [security boundaries](SECURITY.md), and the scripts before execution. Original project code is Apache-2.0; that does not cover the entire runtime. Remotion has eligibility-based terms. Claude requires the user's own account/access. Do not purchase licenses or authenticate on someone else's behalf.

Confirm these inputs with the owner or existing configuration:

| Input | Behavior |
| --- | --- |
| New installation or upgrade | Upgrades use a separate new folder; no overwrite-all or blind `git pull` in production. |
| Backend | Auto detects compatible NVIDIA; Cpu avoids CUDA; Cuda needs compatible hardware/drivers (CUDA 12.4, Windows driver 551.61+). Setup does not install GPU drivers. |
| Reviewer and language | Supply the real reviewer display name and transcription language; installer default language is `tl`. A display name is not approval. |
| Raw, edited and upload roots | Keep existing paths/media. First installs default to local `workspace`; external paths are configured after installation. |
| Existing settings | Preserve reviewer, language, workspace and post preferences, explicit cue gains/mutes and custom media/assets. Regenerate tool paths on the new machine. |

Reserve at least 10 GB free disk space plus media/render space. Initial downloads exceed 2 GB; large-v3 has significant RAM/GPU needs (16 GB system RAM is a practical starting point). Setup and initial browser/font downloads need internet; hosted AI use is separate.

From the source folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install.ps1 -Plan
```

`-Plan` makes no downloads or configuration writes. It is a tool/backend plan, not an exhaustive filesystem diff or a reversible migration engine. Inspect the source folder and selected media roots separately. The process-only execution policy does not override organizational restrictions.

## 3. Install private tools

When the owner has authorized the displayed installation and applicable terms, run `Install.cmd` interactively, or use the explicit unattended form:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install.ps1 -Yes -Backend Cpu -Reviewer 'Owner' -Language tl
```

Choose backend/reviewer/language deliberately. `-Yes` accepts the installation and applicable terms; it does not approve any transcript, video or release. Do not pass it before authorization. Do not skip smoke tests to claim a successful installation.

Setup pins Node, pnpm, FFmpeg/FFprobe, whisper.cpp, the Whisper model, Claude Code and project dependencies/browser. Portable Python, auto-editor and Silero VAD are included by default as companion tools. Exact versions, URLs and hashes are in [the toolchain lock](installer/toolchain.lock.json). Tools live under `.studio`, dependencies under `node_modules`; there are no permanent PATH changes or global project-skill registrations. A missing signed Microsoft Visual C++ runtime is a conditional system prerequisite that can request elevation. See [options and troubleshooting](docs/INSTALLATION.md).

Never bypass checksums/TLS or regenerate lockfiles to resolve setup errors. Existing valid sound assets are retained; missing effects are generated locally. Account login remains a human action.

## 4. Configure and verify

Start a tool-enabled shell in the installed source directory:

```powershell
. .\Start-Video-Studio.ps1 -Shell
.\Start-Video-Studio.ps1 -Doctor
pnpm check
pnpm test:installer
pnpm check:privacy
pnpm check:licenses --installed
pnpm sfx --check
```

Settings belong in ignored `studio.local.json`. Preserve its complete schema, generated `tools`, and unknown existing fields. Set `workspace.raw`, `workspace.edited`, `workspace.upload`, reviewer/language and `post` preferences only as agreed with the owner. Do not copy tool paths from another installation or computer. Restart the tool-enabled shell after changing configuration so protected raw paths refresh. Additional protected roots can be appended to `KRAVEN_PROTECTED_ROOTS` in that process (semicolon-separated); the launcher resets it from configured raw on its next start.

The default installer smoke exercises synthetic vertical/horizontal rendering and decoding plus Whisper execution. If diagnosing separately:

```powershell
.\installer\Doctor.ps1 -Smoke
```

Render scripts use a separate port (42177 by default) and refuse occupied endpoints. Set KRAVEN_RENDER_PORT to another free port when needed; port 3000 is reserved for Studio. Do not stop another production process to free a test port. Smoke fixtures use unique folders. Record skipped/blocked tests truthfully.

For a fresh install with no existing demo files, `pnpm demo` then `pnpm dev` opens Remotion Studio. `pnpm dev` keeps Studio and its lazy-compilation listener on `127.0.0.1`, so open it on the same computer and ignore any Network address Remotion prints. Running `remotion studio` directly bypasses this and listens on every interface. See [security boundaries](SECURITY.md) for the guard's limits. Demo generation replaces its fixed sample paths; do not use it to overwrite an existing project. For complete synthetic portrait/landscape pipeline acceptance run `pnpm test:media`; synthetic fixture approvals are test data, never real owner consent.

For Claude, open `Start-Video-Studio.cmd`, sign in yourself and enter `/video-studio`. Other assistants should read `AGENTS.md`, use the tool-enabled shell and follow [the workflow](docs/WORKFLOW.md); the launcher itself opens Claude, not a provider selector.

## 5. Production acceptance and updates

Before switching your active installation, review a real vertical and horizontal job: transcript/sync, take and cut reviews, B-roll readability, actual voice/effects, final pacing, SRT delivery and final package validation. Vertical has burned captions; horizontal has clean picture and SRT. Finished mix target is −16 LUFS ±1, encoded true peak at most −1 dBTP. No agent may fabricate human approvals. Keep manual editorial decisions and uncertainty visible.

For updates: retain the old installation, back up local settings/custom assets and record external media paths; install the new reviewed source in a separate folder. Transfer preferences deliberately, regenerate tools and rerun acceptance. Do not copy `.git`, `node_modules`, `.studio` or absolute tool paths into a public repo. Do not delete/move media or rewrite historical approvals. Recovery means returning to the retained old installation; this installer does not implement transactional rollback.

## Copyable AI installation and upgrade prompts

Copy the complete [Claude Code installation prompt](docs/CLAUDE-INSTALL-PROMPT.md) for a new machine, or the [1.0.0 upgrade prompt](docs/CLAUDE-UPGRADE-PROMPT.md) for an existing Windows computer. Both verify the official archive/checksum or the full source commit from official release notes. The upgrade prompt stages and tests a separate installation while preserving production; cutover is a separate decision. Git is optional; use your own Claude account/access. Both prompts verify the project-local `/video-studio` and `/video-clear-cache` skills.

See [versioning](docs/VERSIONING.md), [installer workflow](docs/INSTALLER-WORKFLOW.md) and [source-only license review](docs/LICENSE-REVIEW.md).

## Dedicated render storage

Setup asks for a dedicated disposable render folder and recommends a non-system fixed drive with adequate free space. `-RenderCacheRoot` selects it explicitly; unattended use of the system drive requires `-AllowSystemDriveCache`. The saved location is preserved on reruns. Keep application files, raw media, edited deliverables and disposable cache in separate folders. New settings default to automatic startup cleanup, 48-hour diagnostic retention and a 20 GiB cache warning threshold; installer reruns preserve explicit policy choices. Successful jobs clean immediately. The warning is not a hard cap. No existing media or cache is moved automatically. See [render storage](docs/RENDER-STORAGE.md) for layout, process recovery, isolated tests and safe cleanup.
