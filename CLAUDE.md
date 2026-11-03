# Kraven Video Studio

**You shoot. AI edits. You approve.**

AI-assisted video production toolkit.

Use the `video-studio` project skill for video work and `video-clear-cache` for render-cache inspection/cleanup. For installation or side-by-side upgrades, use `docs/CLAUDE-INSTALL-PROMPT.md` or `docs/CLAUDE-UPGRADE-PROMPT.md`. Start this project through `Start-Video-Studio.cmd`; tools are installed privately and passed to child processes. See `docs/INSTALLATION.md` for setup and `docs/WORKFLOW.md` for production.

The footage owner approves transcript text, synchronization and final packages. Nothing is automatically published. Preserve raw files. Full edits support portrait and landscape profiles; real-recording landscape visual acceptance remains pending. Standalone B-roll supports both formats. This project operates independently.


## Installation and public-source preparation

Read root INSTALL.md before setup or upgrades; it is the canonical human/agent protocol. Preserve existing studio, settings, custom assets and media. Use side-by-side updates and pinned tools. Never fabricate owner approvals, publish or configure remotes without explicit authorization. Run check:privacy and check:licenses after changes to distributable source/dependencies; do not copy private paths or project context into this repository.

## Required editorial reviews

Read docs/EDITORIAL-REVIEW.md. Run takes:review on the original Whisper JSON and 16 kHz mono WAV, with --source naming the actual source video. Selected ranges must cover the segments and snap margins. Every candidate needs a reasoned decision. Assembly requires current takeReview/takeDecisions; unresolved review cases may stay in a preview but block final rendering. Single-word repetitions are candidates, never automatic removals.

After the final render, run pacing:review on that encoded video and its captions, with --edit naming the rendered cues. Inspect the whole preview, including camera repositioning, noisy wordless gaps, readability and sound balance. Record truthful visualReview notes and decisions. The package project must name pacingReview/pacingDecisions. Validation and release require current resolved evidence. Never create human approvals on the owner's behalf. Edited timings require rebuilding/transcription/sync review and retimed enhancements, not surgery on an exported file.

Earlier media and review records are historical and remain unchanged. Regenerate editorial evidence for each new job. The scripts do not call a cloud model, automatically judge intent or publish.
