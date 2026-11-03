# Install 1.0.0 with Claude Code

Use the official v1.0.0 release, source identity and published checksums.

Copy the complete prompt into Claude Code on the target Windows computer. Use your own Claude account/access. Setup provisions the project's pinned private Claude executable; Git is optional. For an existing installation, prefer the [upgrade prompt](CLAUDE-UPGRADE-PROMPT.md).

Use the official 1.0.0 source-installer archive and the checksum from the release assets, or verify the full source commit from the official release notes. [INSTALL.md](../INSTALL.md) is canonical; review [known issues](KNOWN-ISSUES.md) and [third-party terms](../THIRD_PARTY_NOTICES.md).

```text
Install Kraven Video Studio 1.0.0 on this computer in a fresh application folder.

Repository: https://github.com/kravetech/kraven-video-studio
Target release: v1.0.0
Release notes: https://github.com/kravetech/kraven-video-studio/releases/tag/v1.0.0

I authorize installing the required pinned tools and running isolated verification tests. Preserve existing applications and media. Do not switch an existing production installation.

1. Confirm native Windows x64 and 64-bit PowerShell 5.1 or later. Stop on an unsupported environment.

2. Establish source identity before executing downloaded scripts. Use the official v1.0.0 source-installer archive: compare Get-FileHash -Algorithm SHA256 with the independently supplied expected checksum, then verify every SOURCE-MANIFEST.json entry's SHA256 and byte size and reject missing/extra source files. The manifest must say 1.0.0. A checksum supplied only by the downloaded archive is not independent verification. Otherwise obtain the full Source commit from the official v1.0.0 release notes and check out that exact commit; without Git, use its exact-commit source archive. Verify package.json says 1.0.0. Stop if identity cannot be verified; do not substitute the default branch or an older version.

3. Read INSTALL.md, AGENTS.md, THIRD_PARTY_NOTICES.md, docs/KNOWN-ISSUES.md and docs/RENDER-STORAGE.md. Ask only for inputs that existing settings or my request do not establish: installation folder, reviewer name, language, media workspace and dedicated render-cache folder. If an existing installation is found, use docs/CLAUDE-UPGRADE-PROMPT.md for side-by-side staging.

4. Recommend a short writable local application folder outside cloud sync, Program Files and media. Keep Raw, Edited and For Upload in durable media folders. Ask for a dedicated disposable render-cache folder, recommending a non-system fixed local drive with sufficient space, preferably SSD. Keep application, media and cache separate. If only the Windows system drive is suitable, explain the space implications and obtain my explicit choice before using -AllowSystemDriveCache. Do not select a drive just because its letter is not the system drive; check availability and free space. -CacheDirectory is installer downloads, not render temp. No existing files are moved or deleted.

5. Run Install.ps1 -Plan with the selected -RenderCacheRoot and backend. Use the official pinned installer and its consent flow, preserving the selected cache path. Include companion tools and smoke tests. Verify CUDA hardware/drivers before choosing Cuda; otherwise choose Cpu. Do not replace tool pins, regenerate lockfiles, bypass checksums, install GPU drivers, change permanent PATH/TEMP/TMP, firewall or security settings, purchase licenses or create accounts.

6. Configure ignored studio.local.json using its complete schema. Preserve generated tools and unknown fields. Record the actual saved storage.renderCacheRoot, media roots, reviewer and language; do not expose the whole settings file. Keep automatic cleanup defaults unless I choose otherwise: storage.autoClean=true, storage.retentionHours=48, storage.cacheWarningGiB=20. Verify their effective values with storage:status. Cleanup runs before supported launches, and successful jobs clean immediately; the size setting warns only and never overrides retention or active-job protection. Check for an inherited KVS_RENDER_CACHE_ROOT override so the runtime uses the intended folder. Restart the tool-enabled shell after configuration changes.

7. In the new application folder run:

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

Check every exit code; record failures and stop promotion on any required failure. Test runners isolate their cache and synthetic media automatically. Keep their evidence outside production media. Do not override TEMP/TMP to conceal a leak. Do not fabricate human approvals. The Studio test exercises a real local UI export and clean shutdown; do not stop unrelated applications to free its port.

8. Verify both project skills exist: .claude/skills/video-studio/SKILL.md and .claude/skills/video-clear-cache/SKILL.md. Open Start-Video-Studio.cmd when account setup is needed and let me complete normal login. Never request passwords in chat. Explain /video-studio and /video-clear-cache. Cache cleanup previews with pnpm storage:clean; pnpm storage:clean --apply removes only eligible owned jobs. Active, unknown and recent failed jobs remain; proven abandonment starts a fresh configured retention period (48 hours by default). No Windows Temp sweep is included.

If the documented installation-smoke crash occurs, preserve logs, receipts and outputs before recovery. Never hide a failure or skip a gate to claim acceptance.

Finish with the installed source identity/version/location, selected application/media/render folders, tool/backend versions, actual check results, skill availability, preserved data, known limitations and exact reopen commands. Do not claim an authenticated Claude skill run unless observed. Mechanical tests do not approve real editorial content; follow INSTALL.md before production cutover.

Do not publish videos, push code, replace production shortcuts/services or delete a previous installation.
```
