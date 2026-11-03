# Kraven Video Studio

**You shoot. AI edits. You approve.**

AI-assisted video production toolkit.

Version: **1.0.0** — Windows x64 stable baseline with reviewed editing, managed render storage and pinned Zod 4.6.6.

Local video production with your AI assistant. Turn talking-head recordings into reviewed portrait or landscape videos, subtitles and platform artwork. Includes the source production setup's Kraven minimal visual preset and standalone portrait/landscape B-roll. No external workspace is required.

## Install from GitHub

Read **[INSTALL.md](INSTALL.md)** for the human/AI installation protocol, required tools, preservation rules, verification and upgrades. Source repository: **[kravetech/kraven-video-studio](https://github.com/kravetech/kraven-video-studio)**. Use a reviewed release/tag or full commit. GitHub source downloads are sufficient; a separate installer ZIP is optional.

Use the immutable v1.0.0 release and the full source commit recorded in its release notes. The supplied source-installer ZIP includes a file manifest and checksum. Install upgrades side by side and retain the previous installation until a separate production cutover decision.

**Install stable with Claude Code:** copy the [ready-to-use installation prompt](docs/CLAUDE-INSTALL-PROMPT.md) into Claude Code on the Windows computer where you want Studio installed. It obtains the pinned release, installs the required tools and verifies both video orientations. Your own Claude account/access is required; Git is optional.

**Upgrade with Claude Code:** use the [side-by-side 1.0.0 upgrade prompt](docs/CLAUDE-UPGRADE-PROMPT.md) to preserve the existing installation on your Windows computer while testing the new version.

1. Obtain a reviewed source snapshot in a fresh writable local folder. Keep any existing studio and media intact.
2. Review [third-party terms](THIRD_PARTY_NOTICES.md), then run `Install.cmd` (or inspect `Install.ps1 -Plan` first).
3. Verify diagnostics and the checks in INSTALL.md. Open `Start-Video-Studio.cmd`, sign in to your own Claude account and enter `/video-studio`.

The installer is tested on **Windows x64 only**. Original project code is Apache-2.0; Remotion and downloaded tools/models retain their own terms. Account access and any required commercial licenses are separate.

Setup installs Node 24.15.0, pnpm 11.17.0, FFmpeg/FFprobe 9.0.1, whisper.cpp b5454, large-v3 q5_0, Claude Code 2.1.310, pinned Remotion/React dependencies and the rendering browser. Portable Python 3.12.10, auto-editor 29.3.1 and Silero VAD 5.1.2 are included by default as companion tools. VAD is not used for caption timing. CPU is available without NVIDIA; compatible NVIDIA drivers select CUDA 12.4. No drivers are installed.

Expect more than 2 GB of downloads and reserve 10 GB free disk space. For large-v3, 16 GB system RAM is a practical starting point; actual resource needs depend on backend and recording. Internet is needed for setup, initial fonts/browser downloads and Claude access. Account, subscription/API usage and third-party licenses are not supplied by the installer.

## Production and limits

Read [the production workflow](docs/WORKFLOW.md). Raw media belongs in `workspace/raw` or an external read-only folder. Work under `public/samples`/`out`; deliver packages under `workspace/Edited/<video-name>` and release reviewed copies to `workspace/For Upload`.

The preset retains Geist/Geist Mono, black-and-white graphics, uppercase captions with active-word boxes, stacked cover titles, technical callouts and restrained keynote B-roll. Camera footage is not automatically monochrome.

- Assembly, captions, callouts and validation support vertical 1080x1920 and horizontal 1920x1080 profiles. Horizontal delivery uses a 1280x720 thumbnail. The owner accepted the real vertical/horizontal workflows; each operator must review their own footage.
- Standalone B-roll supports both orientations. Choose its timing manually, then either insert it externally or use edit-file cues for direct compositing. Optional zoom cues and whoosh/hit/tick effects use the same edited timeline.
- Human review is required for transcript, sync and final delivery. An install test does not measure speech accuracy.
- The retained implementation has prior Windows x64/CUDA installation and synthetic media acceptance. Checks for this baseline and their reuse limits are recorded in [validation](docs/VALIDATION.md). Each operator supplies their own account and reviews their recordings.
- External workspace integrations are not installed or activated here.

Keep `.studio`, `studio.local.json`, media and outputs out of Git. **Kraven Video Studio by Kraven. Original project code licensed under Apache-2.0. Third-party components retain their respective licenses.** See [LICENSE](LICENSE) and retain [NOTICE](NOTICE). Dependencies, tools, models, fonts and user assets retain their own terms; see [third-party notices](THIRD_PARTY_NOTICES.md).

Known issues, including an observed initial-setup smoke crash and Studio prop-saving limitations, are documented in [Known issues](docs/KNOWN-ISSUES.md).

## Developer preview

Use Node 24 and pnpm 11.17.0, with FFmpeg/FFprobe on PATH. The guided installer provisions them if needed.

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm rebuild esbuild
pnpm sync:ds
pnpm check
pnpm check:privacy
pnpm check:licenses --installed
pnpm sfx                      # setup does this automatically
pnpm demo
pnpm dev
```

`pnpm demo --profile horizontal-1080` generates the landscape example using the same fixed demo filenames; use only in a fresh test folder. Examples use test patterns and tones; captions remain marked unreviewed. No private design-system checkout, personal footage or branding assets are needed. `pnpm sync:ds` reads the bundled 251-token preset. The dependency stack, font downloads and hosted AI service retain their own terms and connectivity requirements.

## Release integrity

`render:final` writes a render record containing hashes of the video, master, captions, edit and rendering source. Validation requires matching inputs and measured duration. Release rechecks the files and inputs, stages a complete upload directory, then promotes it. Previous packages are retained under the upload root's `.superseded` directory. A CLI lock prevents concurrent releases to the same destination; it does not authenticate the reviewer or prevent another program from modifying files. Human review remains required.

Local project/render/validation records contain private file paths. Keep them in the ignored workspace. Run `pnpm check:privacy` before sharing source. It checks tracked files (including tracked ignored files) and unignored candidates, or the source tree when Git is absent. It does not audit prior Git history. Start public history from reviewed source only. `scripts/package-source.ps1` remains an optional source-archive utility; GitHub-first installation does not require it.

## Timed enhancements

The optional edit-file arrays `broll`, `zooms` and `sfx` schedule cards, speaker push-ins and restrained sound effects. Times are milliseconds on the edited master. Choose every cue deliberately; the software does not decide editorial placement. Captions and technical callouts step aside only while the card renders, and the SRT retains the full approved transcript. See [cue examples and commands](docs/ENHANCEMENTS.md).

Setup generates the three sound effects locally, including when smoke tests are skipped. Generated WAVs are ignored and excluded from source releases. Developers can run `pnpm sfx` to create missing assets or `pnpm sfx --check` to verify them. Rendering fingerprints every used sound, so an audio change invalidates the old render record. Final-mix loudness/peak validation still applies.


The shared speech audio profile is documented in [Audio standard](docs/AUDIO-STANDARD.md): −16 LUFS ±1 for the finished mix, restrained per-asset effect defaults, and final true-peak validation.

Horizontal videos now deliver SRT captions with a clean picture; vertical videos retain burned captions. Cut jobs require current [cut QC](docs/CUT-QC.md). Default whoosh gain is 3; source sound files and explicit cue gains are preserved.

## Required editorial reviews

Read docs/EDITORIAL-REVIEW.md. Run takes:review on the original Whisper JSON and 16 kHz mono WAV, with --source naming the actual source video. Selected ranges must cover the segments and snap margins. Every candidate needs a reasoned decision. Assembly requires current takeReview/takeDecisions; unresolved review cases may stay in a preview but block final rendering. Single-word repetitions are candidates, never automatic removals.

After the final render, run pacing:review on that encoded video and its captions, with --edit naming the rendered cues. Inspect the whole preview, including camera repositioning, noisy wordless gaps, readability and sound balance. Record truthful visualReview notes and decisions. The package project must name pacingReview/pacingDecisions. Validation and release require current resolved evidence. Never create human approvals on the owner's behalf. Edited timings require rebuilding/transcription/sync review and retimed enhancements, not surgery on an exported file.

Earlier media and review records are historical and remain unchanged. Regenerate editorial evidence for each new job. The scripts do not call a cloud model, automatically judge intent or publish.

Product identity and preserved configuration boundaries are documented in [Branding](docs/BRANDING.md).

See [versioning](docs/VERSIONING.md), [installer workflow](docs/INSTALLER-WORKFLOW.md) and [source-only license review](docs/LICENSE-REVIEW.md).

## Dedicated render storage

Setup asks for a dedicated disposable render folder and recommends a non-system fixed drive with adequate free space. `-RenderCacheRoot` selects it explicitly; unattended use of the system drive requires `-AllowSystemDriveCache`. The saved location is preserved on reruns. Keep application files, raw media, edited deliverables and disposable cache in separate folders. No existing media or cache is moved automatically. See [render storage](docs/RENDER-STORAGE.md) for layout, process recovery, isolated tests and safe cleanup. Automatic cleanup defaults to enabled before supported launches, 48-hour failed-job retention and a 20 GiB disk-cache warning threshold (not a hard cap). Configure these in the existing `storage` settings; see the linked storage guide. In Claude, use `/video-clear-cache` to inspect and clean eligible owned cache with a space report. Active and unverifiable jobs remain protected; this is not a Windows Temp sweep.
