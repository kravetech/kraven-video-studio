# Kraven Video Studio

**You shoot. AI edits. You approve.**

AI-assisted video production toolkit.

Version: **1.0.0**. Windows x64 source distribution; local media processing with Claude Code orchestration. This fresh repository retains the reviewed editing, managed storage, cleanup, security and Windows atomic-file retry implementation. Source history and release metadata are new; runtime contracts and dependency pins are preserved. See docs/VALIDATION.md for verification and reuse limits.

## Installation boundary

`Install.cmd` starts the PowerShell installer. `installer/toolchain.lock.json` pins download sources and hashes. `installer/Tools.psm1` verifies downloads, rejects unsafe archive paths/links and stages tool extraction. Tools live under ignored `.studio`; dependencies are installed from the lockfile, with only the allowlisted esbuild rebuild hook. The render browser is downloaded by the pinned Remotion CLI. Microsoft runtime installation is the only conditional elevated/system step.

Configuration is ignored `studio.local.json`. The launcher sets process-local tool paths and opens Claude; the project skill loads production guidance. No account/credential creation, global skill registration, external-workspace activation or publishing occurs. Account access remains external. Claude accesses the user's selected context through its service; local media processing is not a claim that the whole workflow runs offline.

## Production boundary

FFmpeg probes, cuts, grades and levels audio. whisper.cpp produces word-level transcripts. Deterministic scripts verify planned words and bind approval to text/timing. Remotion renders captions, callouts, covers and keynote cards. Package validation precedes human final approval and hash-verified local delivery. CLI reviewer fields record a claim; agent instructions and the human workflow enforce consent, not cryptographic identity.

The bundled `presets/default.tokens.json` is a self-contained snapshot of 251 source visual tokens. `pnpm sync:ds` regenerates typed tokens from that preset; no external design-system repository is needed. Personal logos and real footage are not shipped. Post hashtag/community text are configurable through local settings.

## Capability limits

Full editing has 1080x1920 portrait and 1920x1080 landscape profiles, with matching captions/callouts and platform artwork. The owner accepted the real horizontal workflow; each new recording still requires its own editorial review. Cue-driven cutaway compositing, zooms and sound effects are supported; editorial timing is chosen by the operator. Publishing integrations are absent. Python, auto-editor and Silero are companion tools; the main edit workflow uses FFmpeg/Whisper/Remotion. NVIDIA drivers are a user-managed prerequisite for CUDA; CPU is selectable.

## Release boundary

`scripts/package-source.ps1` creates an allowlisted archive with file hashes. It excludes tools, models, accounts, Git history, local configuration, recordings and generated outputs. Original project code is Apache-2.0 ; dependencies retain their own licenses. The stable release records target-machine setup and editorial acceptance; it does not certify every fresh Windows image or hardware configuration. See docs/VALIDATION.md and docs/KNOWN-ISSUES.md.

## Render and release records

Frame rates use a strict number/fraction parser and default to the probed source rate. A changed rate requires `frameRateConversion: true`. Assembly uses a unique temporary directory per invocation. SHA-256 media hashing uses bounded memory.

A full `render:final` emits `<name> - render.json` with input/output hashes and Node/Remotion/FFmpeg versions. Rendering checks input hashes before and after work. Validation requires that record, the actual captions/master, positive measured duration, and matching deliverables. It also fingerprints the declared source. This records the source declaration; it does not independently prove that an externally prepared master was derived from that source. Human editorial approval is still required.

Release verifies validation fingerprints and all recorded inputs, stages copies on the destination volume, and verifies hashes before directory promotion. An exclusive destination lock serializes this CLI. The previous directory is retained under `.superseded`; a failed final rename attempts to restore it. This is recoverable staged promotion, not a multi-folder database transaction or protection against unrelated writers. A hard process termination may require inspecting a stale lock/staging folder before retrying.

## Enhancement rendering and generated assets

`src/edit/Enhancements.tsx` consumes optional edit-file `broll`, `zooms` and `sfx` arrays. Pure timing helpers in `src/edit/timing.ts` use the same frame interval for cutaway compositing and caption/callout suppression. Zoom ramps adapt to short cues. Metadata rejects out-of-range cues and overlapping cards/zooms. Sound cues may overlap; final audio checks enforce delivery loudness/peak limits.

`scripts/make-sfx.mjs` and its library generate seeded whoosh/hit/tick PCM WAVs (48 kHz, mono). Existing valid files are preserved; corrupt files fail until explicitly regenerated with `--force`. Setup runs generation unconditionally before diagnostics. Doctor verifies assets even without its optional render check. A source archive ships the generator, not audio binaries. Render records include hashes of used sound assets as well as rendering code.


The shared speech audio profile is documented in [Audio standard](docs/AUDIO-STANDARD.md): −16 LUFS ±1 for the finished mix, restrained per-asset effect defaults, and final true-peak validation.

Horizontal videos now deliver SRT captions with a clean picture; vertical videos retain burned captions. Cut jobs require current [cut QC](docs/CUT-QC.md). Default whoosh gain is 3; source sound files and explicit cue gains are preserved.

## Required editorial reviews

Read docs/EDITORIAL-REVIEW.md. Run takes:review on the original Whisper JSON and 16 kHz mono WAV, with --source naming the actual source video. Selected ranges must cover the segments and snap margins. Every candidate needs a reasoned decision. Assembly requires current takeReview/takeDecisions; unresolved review cases may stay in a preview but block final rendering. Single-word repetitions are candidates, never automatic removals.

After the final render, run pacing:review on that encoded video and its captions, with --edit naming the rendered cues. Inspect the whole preview, including camera repositioning, noisy wordless gaps, readability and sound balance. Record truthful visualReview notes and decisions. The package project must name pacingReview/pacingDecisions. Validation and release require current resolved evidence. Never create human approvals on the owner's behalf. Edited timings require rebuilding/transcription/sync review and retimed enhancements, not surgery on an exported file.

Earlier media and review records are historical and remain unchanged. Regenerate editorial evidence for each new job. The scripts do not call a cloud model, automatically judge intent or publish.

## GitHub-first onboarding

INSTALL.md is the canonical human/agent installation protocol. README and provider adapters route to it; the pinned Windows installer remains the execution engine. Public source starts from a clean source-only snapshot, with local state/media/generated outputs ignored. Source privacy checks and lock-bound Windows dependency metadata checks are CI gates. No Git initialization, remote configuration or publication is performed by setup. Optional source packaging is retained for maintainers. Production rendering and review contracts are preserved.

See [versioning](docs/VERSIONING.md), [installer workflow](docs/INSTALLER-WORKFLOW.md) and [source-only license review](docs/LICENSE-REVIEW.md).

## Studio loopback

`pnpm dev` runs `scripts/start-studio.mjs`, which adds `scripts/lib/studio-loopback.cjs` to `NODE_OPTIONS` for Studio's process tree only. The guard wraps `net.Server.prototype._listen2` and, for Windows cluster workers, `net._createServerHandle`. Both run after Node has resolved `listen()`, so the guard reads Node's own decision instead of reparsing its arguments. A new TCP listener whose resolved address is not loopback moves to `127.0.0.1`. Pipes, adopted handles and descriptors pass through. If either step is missing, the guard refuses to load. These are Node internals, so repeat the listener audit after any Node.js, Remotion or webpack upgrade.

## Release preparation

package.json is the SemVer authority. Version checks bind installer product metadata, current onboarding headers, the latest changelog entry and any CI tag. The version setter plans local metadata updates and performs no Git operations. Stable promotion remains an explicit owner decision after server and real-footage acceptance.

Original-source distribution retains Apache LICENSE/NOTICE and excludes runtime downloads. License decisions bind exact installed manifests to immutable upstream references; every UNLICENSED package is refused. The unused transitions dependency is removed without changing application source or retained dependency versions. Missing vendor metadata remains recorded rather than rewritten as Apache licensing.

Installer configuration is UTF-8, preserves unknown fields and backs up original bytes before atomic replacement. Managed tool paths/backend refresh; invalid/future-schema and detected concurrent edits fail. Synthetic diagnostics use unique media/output folders. Render entrypoints use a dedicated port, refuse occupied endpoints and reserve port 3000 for interactive Studio. These changes preserve real media and do not alter composition IDs, editorial algorithms, visual tokens or the audio profile.

## Dedicated render storage

Setup asks for a dedicated disposable render folder and recommends a non-system fixed drive with adequate free space. `-RenderCacheRoot` selects it explicitly; unattended use of the system drive requires `-AllowSystemDriveCache`. The saved location is preserved on reruns. Keep application files, raw media, edited deliverables and disposable cache in separate folders. No existing media or cache is moved automatically. See [render storage](docs/RENDER-STORAGE.md) for layout, process recovery, isolated tests and safe cleanup.

Cleanup policy is validated consistently in runtime and installer configuration: autoClean=true, retentionHours=48 (minimum 48), cacheWarningGiB=20. Automatic pruning occurs before supported launches; explicit manual pruning uses the same retention. Measured recognized-job usage warns above the threshold without bypassing ownership, process checks or retention. This is not a background service or hard capacity limit.
