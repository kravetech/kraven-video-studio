# Upgrade to 1.0.0 with Claude Code

Use the official v1.0.0 release, source identity and published checksums.

Use this prompt on a Windows computer with an existing installation. This repository starts a new 1.0.0 release baseline. An older repository may also have used version 1.0.0 or a higher number; compare the repository identity, full source commit and checksums rather than version numbers alone. Prepare and test this release side by side; production cutover is a separate decision. No intermediate installation is required. [INSTALL.md](../INSTALL.md) remains canonical.

Use the official v1.0.0 source-installer archive and its published checksum, or the exact source commit in the release notes. Keep the prior installation, its configuration and delivery evidence for rollback. The new [cache skill](../.claude/skills/video-clear-cache/SKILL.md) cannot clean another installation's cache or unverified system Temp.

```text
Prepare a side-by-side upgrade of Kraven Video Studio to 1.0.0 on this Windows computer. Keep my existing stable production installation running and unchanged. Do not cut over production automatically.

Repository: https://github.com/kravetech/kraven-video-studio
Target release: v1.0.0
Release notes: https://github.com/kravetech/kraven-video-studio/releases/tag/v1.0.0

I authorize creating a new installation, installing its required pinned tools, copying private settings/custom assets into that installation as needed and running isolated automated acceptance. This does not authorize production writes, shutdown, cleanup, publication or a Git push.

1. Confirm native Windows x64 and 64-bit PowerShell 5.1 or later. Locate the current production application, launcher/shortcut/service target, version, complete studio.local.json, custom assets/sound overrides and external media roots. Ask only for locations or choices that cannot be established. Record read-only baseline hashes of production source, configuration and custom assets in a private evidence folder outside both installations; inventory media locations without modifying them. Do not include credentials or full configuration in the report. Preserve prior RC installations and acceptance evidence too.

2. Verify the 1.0.0 source before running its scripts. Use the official v1.0.0 source-installer archive: compare its SHA256 with the independently supplied expected checksum, then verify every SOURCE-MANIFEST.json entry's SHA256 and byte size, reject missing/extra source files, and check manifest/package version 1.0.0. Otherwise read the full Source commit from the official release notes and obtain that exact checkout (or exact-commit source archive without Git). Stop if identity cannot be verified. Do not substitute a branch, run git pull in production, or use pnpm upgrade: that script upgrades Remotion dependencies, not this application.

3. Extract into a fresh version-specific application folder beside the old one, outside media, cloud sync and Program Files. Do not overlay an existing folder. Read the new INSTALL.md, AGENTS.md, THIRD_PARTY_NOTICES.md, docs/KNOWN-ISSUES.md and docs/RENDER-STORAGE.md.

4. Make a byte-preserving backup of the existing complete local configuration in private evidence. Copy that complete file to the new installation before setup so unknown preferences survive. Preserve reviewer/language, post branding, workspace roots and custom settings. Resolve any existing relative workspace paths against the OLD installation before copying settings; write their equivalent absolute locations only into the new private configuration so they keep referencing the same durable media. Do not let relative paths silently redirect to a new empty workspace. Do not copy node_modules, .git, .studio, cached executables/models, account tokens or old absolute tool paths into generated new tool configuration. Let the installer regenerate managed tool paths/backend values. Stop on malformed/future-schema settings instead of resetting them.

5. Establish storage explicitly. Recommend a dedicated disposable render folder on a non-system fixed local drive with sufficient free space, preferably SSD. Prefer a separate 1.0.0 cache root for operational clarity; record this deliberate change from any saved old value. Keep it separate from application, media and old cache. Ask for the folder only if my request or existing approved plan does not supply it. If only the system drive is suitable, obtain my explicit choice before using -AllowSystemDriveCache. Check KVS_RENDER_CACHE_ROOT so an inherited override cannot redirect tests/rendering. -CacheDirectory means installer downloads, not render cache. Do not migrate or delete old cache or change global TEMP/TMP.

6. Run the new Install.ps1 -Plan with the selected -RenderCacheRoot and backend, then use the pinned installer and its consent flow. Include companion tools and smoke tests. Verify compatible CUDA hardware/drivers or use Cpu. No driver/security/firewall changes, dependency upgrades, checksum bypasses, purchases or new accounts. Preserve custom assets and sound overrides: copy into the new installation with a reviewed destination map, never overwrite distributed source or existing custom files blindly. Preserve existing cue gains/mutes. Preserve explicit storage.autoClean, storage.retentionHours and storage.cacheWarningGiB preferences; missing fields default to true, 48 and 20. Verify effective policy with storage:status and explain that the size threshold is a warning, not forced eviction. Validate resulting configuration: preferences/unknown fields retained, managed tool paths belong to the new setup, selected cache saved. Keep private settings/backups out of source archives.

7. From the NEW application folder run:

. .\Start-Video-Studio.ps1 -Shell
.\Start-Video-Studio.ps1 -Doctor
pnpm storage:status
pnpm storage:clean
pnpm check
pnpm test:installer
pnpm check:privacy
pnpm check:licenses --installed
pnpm sfx --check
.\installer\Doctor.ps1 -Smoke
pnpm test:media
pnpm test:studio

Check exit codes, retain private logs and report all failures/skips. Tests self-isolate synthetic configuration/media/cache; do not rewrite production media or approvals. No external TEMP/TMP override is needed. Never stop production or another process to free a port: record the blocker and use only a documented isolated alternative. Do not start a second normal pnpm dev against production's occupied port. The Studio acceptance command already exercises a local UI export and shutdown. If the known smoke crash occurs, preserve evidence before recovery; do not suppress it.

8. Verify both project skills exist and document /video-studio and /video-clear-cache. Cache cleanup in the new installation is preview-only during this upgrade. Actual cleanup is a separate requested action: it preserves active/unknown/other-installation jobs and retains failed jobs at least 48 hours; recovery of proven abandonment starts a fresh configured retention period (48 hours by default). Never sweep system Temp or run new cleanup against old production cache. Confirm shell/launcher resolves the new pinned tools; let me handle any normal Claude login. Do not claim an authenticated skill run unless observed.

9. Recheck production source/configuration/custom-asset hashes and launcher/service targets against the baseline. Distinguish normal runtime log/media activity from installation changes without editing either. Report any unexpected difference, do not revert concurrent owner changes. Confirm production is still serving from its original installation and that test processes have stopped.

Finish with PASS/FAIL/BLOCKED for each gate, exact source identity and new folder, selected render/media roots, tool/backend versions, preference preservation, new skill availability, production preservation evidence and known limitations. Record the old launch target as the rollback target. If gates pass, recommend a separately authorized maintenance-window cutover: finish active jobs, apply the real-content acceptance requirements in INSTALL.md, switch only the intended launch target, and retain the old installation. Do not execute that cutover in this task or invent human approvals.

Do not delete old installations/cache/media/evidence, restart production, change its shortcuts/services, publish videos, commit, tag or push.
```
