# Validation â€” 1.0.0

This new repository uses the reviewed stable implementation with fresh source history and release metadata. The release notes identify the immutable new commit and exact archive checksum.

## Feature preservation

Executable renderer, workflow, installer modules, tests, visual presets, dependency lockfile and tool download pins are compared byte for byte with the reviewed source baseline. Product-version metadata and documentation establish the new baseline. CI additionally packages, extracts and verifies every source-archive entry against its manifest and reruns privacy checks on the extracted output. The private release record retains the original source identity and comparison results.

The retained implementation has prior fresh application-install and installer-rerun acceptance on Windows 11 x64/CUDA, model execution, synthetic portrait/landscape rendering and native Studio UI export/shutdown evidence. That evidence is reused only for unchanged implementations and pins. It does not establish a fresh OS image, CPU-only configuration, every GPU/server, real speech accuracy or new human editorial approval.

## Current baseline verification

Local checks on 2026-11-03 passed version/TypeScript and all 104 tests without skips, installer safety plus 28 storage assertions, 27 portrait and 24 landscape enhanced synthetic media checks, and native Studio UI export with loopback listeners, stopped session and removed cache. Source privacy and the installed 261-package license inventory passed. Runtime code and tool/dependency pins match the reviewed baseline.

An initial test run in a deeply nested staging folder hit Windows path limits. A subsequent Studio run exported successfully but Windows refused removal of its nested cache. Failures were retained; the complete unit/installer/media suite passed from a shorter application folder, and Studio export/shutdown/cleanup passed with a short dedicated cache root. These results do not claim a general Windows file-lock fix. Use the short application and dedicated cache layout documented by the installer.

Fresh pinned-tool installation and installer-rerun evidence is reused from the unchanged reviewed implementation; this baseline did not repeat a full tool download or new-server setup. Account login and real-media approval were not repeated.

Before publication, the exact source-installer archive must match its manifest and outgoing commit, extracted-source privacy must pass, and hosted main/tag checks must succeed. The public CI also builds and verifies a source archive. The release notes record final source identity, artifact checksums and hosted results.

## Operator acceptance

Each operator supplies eligible account access and performs installation diagnostics. Real recordings require transcript, synchronization, take/cut/pacing, picture, audio and final-delivery review. Publication does not approve content or switch production. See [INSTALL.md](../INSTALL.md), [known issues](KNOWN-ISSUES.md) and [security boundaries](../SECURITY.md).
