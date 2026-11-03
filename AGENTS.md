# Kraven Video Studio

**You shoot. AI edits. You approve.**

AI-assisted video production toolkit.

Keep changes scoped to the local video project. Read `docs/WORKFLOW.md` and the relevant scripts before altering production behavior. Tool paths and reviewer/workspace settings belong in ignored `studio.local.json`, not source code.

Preserve raw footage and explicit human approval gates. Run typecheck and relevant installation/production tests after changes. Do not represent a render test as an editorial or transcription-accuracy review. Do not claim full landscape editing until assembly, captions, covers and validation support it together.

## Installation and public-source preparation

Read root INSTALL.md before setup or upgrades; it is the canonical human/agent protocol. Preserve existing studio, settings, custom assets and media. Use side-by-side updates and pinned tools. Never fabricate owner approvals, publish or configure remotes without explicit authorization. Run check:privacy and check:licenses after changes to distributable source/dependencies; do not copy private paths or project context into this repository.

## Required editorial reviews

Read docs/EDITORIAL-REVIEW.md. Run takes:review on the original Whisper JSON and 16 kHz mono WAV, with --source naming the actual source video. Selected ranges must cover the segments and snap margins. Every candidate needs a reasoned decision. Assembly requires current takeReview/takeDecisions; unresolved review cases may stay in a preview but block final rendering. Single-word repetitions are candidates, never automatic removals.

After the final render, run pacing:review on that encoded video and its captions, with --edit naming the rendered cues. Inspect the whole preview, including camera repositioning, noisy wordless gaps, readability and sound balance. Record truthful visualReview notes and decisions. The package project must name pacingReview/pacingDecisions. Validation and release require current resolved evidence. Never create human approvals on the owner's behalf. Edited timings require rebuilding/transcription/sync review and retimed enhancements, not surgery on an exported file.

Earlier media and review records are historical and remain unchanged. Regenerate editorial evidence for each new job. The scripts do not call a cloud model, automatically judge intent or publish.
