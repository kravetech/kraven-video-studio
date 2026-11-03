# Installer workflow

Repository: kraven-video-studio. Read package.json for the current version. GitHub is the intended source distribution; no publication is performed by any installer step.

| Step | What happens | Owner/settings boundary |
| --- | --- | --- |
| 1. Obtain source | Clone/download a reviewed tag/full commit into a fresh writable Windows x64 folder. | Keep the old studio and external media intact. Git is optional when downloading source ZIP. |
| 2. Read and plan | Human or Claude/Codex reads INSTALL.md, selects CPU/Auto/CUDA, reviewer and language; Install.ps1 -Plan shows the tool plan without writes/downloads. | Existing paths/preferences take precedence. Plan is not a migration diff. |
| 3. Authorize setup | Install.cmd launches process-scoped PowerShell; interactive consent or explicitly authorized -Yes accepts the displayed installation/third-party terms. | Account login, purchases, driver installation and footage approvals are separate. |
| 4. Validate existing config | Existing JSON is read and checked before installation. | Malformed/future-schema settings are refused; never reset automatically. |
| 5. Lock and prerequisites | Setup takes its local install lock; checks Microsoft VC++ runtime. | Only a missing signed Microsoft runtime may request system elevation. |
| 6. Provision pinned tools | Verify cached/downloaded hashes, reject unsafe archives, stage private Node/pnpm/FFmpeg/Whisper/Claude and the model. Optional Python/auto-editor/VAD are included unless SkipExtras. | No global PATH, global project skill or GPU-driver changes. Interrupted tool state remains recoverable. |
| 7. Merge local settings | Preserve existing reviewer/language, workspace/post preferences, unknown fields and custom tool extension keys; refresh known tool paths/backend. | Save the original configuration bytes under .studio/config-backups, then replace atomically. Refuse detected concurrent changes. Media is not migrated or rewritten. |
| 8. Activate process tools | Environment.ps1 supplies PATH, model variables, local config and protected raw root to child processes. | Changes apply to this shell and children. Restart that shell after changing paths. |
| 9. Install dependencies | Install the frozen pnpm lock with lifecycle scripts disabled; check product version, source privacy and installed-license evidence. | No automatic lockfile updates or UNLICENSED exceptions. |
| 10. Prepare rendering | Rebuild only the allowlisted esbuild hook, ensure the rendering browser and generate missing effects. | Valid existing sound assets and explicit cue gains/mutes are preserved. |
| 11. Verify tools/media | Typecheck and Doctor validate executables/model/SFX; default smoke executes Whisper and renders portrait/landscape plus preview/cover, then decodes outputs. | Synthetic checks use unique folders and a separate render port; existing Studio/media are left alone. Skipping smoke is diagnostic, not acceptance. |
| 12. Record result | Store local version/backend/test status in .studio/installation.json. Incomplete setup fails; reruns reuse verified downloads. | The receipt is tool evidence, not human editorial approval or proof of clean-server acceptance. |
| 13. Authenticate and launch | User opens Start-Video-Studio.cmd, signs in and enters /video-studio; another assistant can use the tool-enabled shell and AGENTS.md. | Credentials stay out of source. The native launcher opens Claude; it is not a provider switcher. |
| 14. Accept production | Owner tests a real vertical and horizontal job, reviews transcript/sync/cuts/takes/B-roll/sound/final pacing and validates delivery. | Only then switch production work; publication and stable promotion require separate explicit authorization. |

Upgrade by installing reviewed source in a separate folder, transferring agreed preferences/custom assets and regenerating machine-specific tool paths. Keep old installation/media until acceptance. Recovery is returning to the retained old installation; no transactional whole-install rollback is claimed. See INSTALL.md for commands and VERSIONING.md for release rules.
