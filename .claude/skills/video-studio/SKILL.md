---
name: video-studio
description: Edit local talking-head recordings and produce branded video packages with captions, callouts, covers, post copy, validation and human review. Also render standalone B-roll in portrait or landscape.
---

# Video Studio

For setup or upgrades, read root `INSTALL.md` first; copyable Claude prompts live in `docs/CLAUDE-INSTALL-PROMPT.md` and `docs/CLAUDE-UPGRADE-PROMPT.md`. For excessive render-temp usage or cleanup requests, use the `video-clear-cache` project skill; do not delete cache manually. Use the local project and its installed tools. Read `docs/WORKFLOW.md` for the edit stages and commands. Read ignored `studio.local.json` for the selected language, human reviewer, workspace and tool paths. Use `Start-Video-Studio.cmd` for Claude, or dot-source `Start-Video-Studio.ps1 -Shell` in PowerShell so child tools inherit the correct environment. Do not process media with missing or guessed tool settings.

The included preset reproduces the current Kraven minimal video style: black-and-white graphics, Geist/Geist Mono, uppercase captions with a spoken-word box, stacked cover titles, restrained callouts and keynote B-roll. Preserve that style unless the owner requests changes. Original camera footage stays in color unless explicitly requested otherwise.

Before editing, analyze framing, loudness and the complete transcript. Use only the speaker's meaning; preserve natural language and delivery. Do not fabricate claims, complete unspoken sentences or omit negations. Correct transcription visibly and show the corrections for human approval.

Run preflight before assembly. The full captioned-video pipeline supports vertical-1080 and horizontal-1080. Choose the profile explicitly; review framing and the first real landscape recording before calling it visually accepted. B-roll supports both 9:16 and 16:9. Choose B-roll placement manually. Optional edit-file broll cues composite cards directly; external manual placement remains supported. Read docs/ENHANCEMENTS.md for zoom and sound cues. Use effects sparingly, review the complete picture/audio mix and revalidate after changes. Run pnpm sfx if developing outside the guided setup; never assume production-machine sound files exist.

Use deterministic verification, approval and validation scripts. Never approve transcripts, synchronization or final packages on the user's behalf. Human approval is required before calling the respective approval/release command. A checksum binds text/timing, not the identity of a human; the agent must still obtain explicit approval. Do not treat a CLI `--approved-by` value as proof of consent.

Raw footage is read-only. Build under the project's working directories and keep delivery files together by revision. Do not overwrite delivered files, publish externally, install global skills or connect external workspaces without explicit user instruction. No private external context is required.



Read `docs/AUDIO-STANDARD.md` for the shared speech mix. Normalize the voice master to −16 LUFS and validate the finished mix at −16 ±1 LU; generated effect defaults are asset-specific gain values, not loudness targets. Never rewrite existing user cue levels or regenerate valid sounds just to adopt the profile.

Follow docs/CUT-QC.md. Never supply listening decisions on behalf of the owner; bound reviews to source/cuts/settings. Horizontal videos have no burned captions but always need approved SRT. B-roll is considered by default only at useful spoken moments; cadence is not a quota. Grade each take independently; YAVG alone does not establish exposure.

## Required editorial reviews

Read docs/EDITORIAL-REVIEW.md. Run takes:review on the original Whisper JSON and 16 kHz mono WAV, with --source naming the actual source video. Selected ranges must cover the segments and snap margins. Every candidate needs a reasoned decision. Assembly requires current takeReview/takeDecisions; unresolved review cases may stay in a preview but block final rendering. Single-word repetitions are candidates, never automatic removals.

After the final render, run pacing:review on that encoded video and its captions, with --edit naming the rendered cues. Inspect the whole preview, including camera repositioning, noisy wordless gaps, readability and sound balance. Record truthful visualReview notes and decisions. The package project must name pacingReview/pacingDecisions. Validation and release require current resolved evidence. Never create human approvals on the owner's behalf. Edited timings require rebuilding/transcription/sync review and retimed enhancements, not surgery on an exported file.

Earlier media and review records are historical and remain unchanged. Regenerate editorial evidence for each new job. The scripts do not call a cloud model, automatically judge intent or publish.

Product identity: Kraven Video Studio. Tagline: You shoot. AI edits. You approve. Preserve the user’s content branding, paths and approval gates; never add this tagline as a video watermark. See docs/BRANDING.md.
