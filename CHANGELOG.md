# Changelog

## 1.0.0 — 2026-11-03

Initial stable baseline for this repository, prepared from the reviewed existing implementation with fresh source history.

- Portrait and landscape editing, approved captions/SRT, covers, thumbnails and timed B-roll, zoom and sound cues.
- Human transcript, synchronization, take, cut, pacing and final-delivery review gates.
- Dedicated per-job render storage, Windows process containment, safe abandoned-job recovery and configurable startup cleanup.
- Default 48-hour failed-job retention and 20 GiB cache warning; ownership, active-job and unknown-job protection.
- Pinned Windows x64 installer, diagnostics and project-local video and cache skills.
- Pinned Zod 4.6.6 and bounded retries for temporary Windows atomic-file sharing errors.
- Source-only distribution with clean local defaults, Apache-2.0 original-code licensing and retained third-party notices.

The release number starts a new repository baseline; it does not downgrade the included implementation. Existing installations are not changed by publication. See [validation](docs/VALIDATION.md) and [known issues](docs/KNOWN-ISSUES.md).
