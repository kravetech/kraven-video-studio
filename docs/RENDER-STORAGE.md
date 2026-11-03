# Render storage

The toolkit provides a dedicated disposable render cache. During setup, choose an empty local folder with ample free space. The installer recommends a non-system fixed drive when one is available; prefer a local SSD. A drive letter alone does not establish speed or a separate physical disk.

`Install.ps1 -RenderCacheRoot (Read-Host 'Dedicated absolute render folder')` selects it explicitly. On a Windows-drive-only computer, choose a dedicated local folder; unattended setup requires `-AllowSystemDriveCache`. `-Plan` displays the proposal without writing files. `-CacheDirectory` continues to mean installer downloads. Known OneDrive locations, network shares, links, drive roots and overlapping source/media folders are refused.

The choice is saved under `storage.renderCacheRoot` in ignored `studio.local.json`; reruns preserve it and unknown storage preferences unless an explicit new location is supplied. Keep the complete settings file when preparing a side-by-side upgrade, and let setup regenerate its tool paths. No media or old cache is moved. Changing location does not delete the previous cache.

Each installation has a namespace derived from its location, with unique job folders containing `public`, `bundle`, `temp` and ownership metadata. Final-video, artwork and B-roll jobs stage selected assets and reuse their bundle within the job. Original media, approvals and render provenance stay in durable storage. New working files may live under `out/sources/<job>`; legacy public inputs remain valid.

All supported render commands, setup smoke and `pnpm dev` launch with per-job TEMP/TMP. Windows-wide environment variables are unchanged. The stable Studio loopback guard remains active. Running Remotion directly bypasses the supported launcher and its storage/network controls.

Windows workers and descendants run in a Job Object that terminates them when its supervising process closes or the owner disappears. Successful commands remove their owned job. A normal Studio Ctrl+C stop is a cancelled session and removes bulk files only after workers have stopped. Interrupted renders and failed commands retain bulk files for at least 48 hours. At later launches or cleanup apply, a proven abandoned job changes to abandoned and starts a fresh configured retention period (48 hours by default). Expired jobs require ownership and process-use checks. Unknown, linked and active jobs remain preserved. Older records lack containment evidence and require separate investigation; the current implementation never guesses that their descendants are gone. Compact exit/ownership records survive separately in `.studio/render-logs`; this is diagnostic metadata, not a complete console transcript. Studio uses a session job and releases it on a clean exit; long-running sessions can grow until closed.

Use `pnpm storage:status` to inspect location, free space and this installation's jobs. `pnpm storage:clean` previews expired terminal candidates; `pnpm storage:clean --apply` checks process use and removes eligible jobs only. No command sweeps Windows Temp or other installations. The initial floor is 10 GiB plus staging/bundle copies; it is a preflight check, not a guarantee for arbitrarily long renders. Missing selected drives fail without falling back to Windows Temp.

Storage changes do not approve transcripts, listening checks, pacing decisions or final delivery. Synthetic acceptance verifies mechanical behavior; it does not supply human editorial consent.

## Isolated tests

All package test commands and direct test entry files enter a guarded test runner before loading media/browser modules. Each run gets isolated TEMP/TMP/TMPDIR, configuration, render cache and logs. The test area is a sibling of the selected cache with `-tests` appended; it never prunes the live installation cache. Successful runs remove bulk fixtures, while failed runs retain their owned workspace for at least 48 hours. Compact test-run exit records remain in that test area. Without a selected cache the legacy installation-local fallback still applies; select a non-system folder first. Normal shell variables need no override. `pnpm test:studio` exercises the local Studio; it refuses an occupied test port.

Runtime containment and automatic abandoned-job recovery target supported native Windows x64. If the Job Object cannot be established, rendering fails before its worker runs. A legacy record or unavailable process visibility is preserved. Retention cleanup runs on subsequent launches or explicit cleanup, not on a background schedule. Changing cache locations leaves previous folders untouched. Long Studio sessions can grow until stopped. The installer download cache and package store are separate from render storage.

## Claude cache cleanup

Use `/video-clear-cache` in Claude from this installation for an owned-cache cleanup and space report; ask to inspect only when you want a preview. The [project skill](../.claude/skills/video-clear-cache/SKILL.md) uses the commands above, preserves active/unknown/legacy jobs and distinguishes estimated removed file bytes from observed disk free-space change. It does not sweep Windows Temp, installer downloads or the package store. For a new Windows computer use the [installation prompt](CLAUDE-INSTALL-PROMPT.md); for a Windows computer with an existing installation use the [upgrade prompt](CLAUDE-UPGRADE-PROMPT.md).

## Automatic cleanup settings

Merge these fields into the existing `storage` object in ignored `studio.local.json`; keep its selected `renderCacheRoot`, system-drive choice and unknown settings:

```json
{
  "autoClean": true,
  "retentionHours": 48,
  "cacheWarningGiB": 20
}
```

- `autoClean`: Boolean, default `true`. Before each supported render or Studio launch, recover proven abandoned jobs and remove eligible expired jobs belonging to this installation. There is no background timer or Windows scheduled task. Disabling this leaves manual `pnpm storage:clean --apply` available; it does not disable immediate successful-job/normal-Studio-stop cleanup.
- `retentionHours`: whole hours from 48 through 720, default 48. Applies to both automatic and manual cleanup. Abandonment starts the full configured period when recovery is proven. The minimum protects diagnostic evidence; cache pressure cannot shorten it.
- `cacheWarningGiB`: whole GiB from 1 through 10240, default 20. A soft warning threshold for measured recognized jobs in this installation, not a quota, preallocation or eviction trigger. All eligible expired jobs are removed on launch even below this threshold. Active/recent/unverifiable jobs may keep usage above it. Unknown folders and other installations are excluded from this measurement. Status reports incomplete measurements explicitly.

These are disk-cache policy settings, not Remotion frame-memory controls. Twenty GiB is an initial operational warning level for this workflow, not a benchmarked maximum job size. For sustained large-source or concurrent rendering, inspect actual peak disk usage before raising the warning threshold (for example to 50 GiB). Allow space for active jobs and retain the existing minimum 10 GiB free-space headroom plus staging/bundle copies. Keep the cache on a non-system local drive when available.

New installations write these defaults; old settings inherit them without rewriting files, and installer reruns preserve explicit choices. Invalid values fail instead of silently disabling protection. Restart Studio/render launchers after changing settings. `pnpm storage:status` and `pnpm storage:clean` show effective policy, measured bytes, warning status and individual eligibility without deleting anything. Long-running Studio sessions retain active cache until stopped normally; no mid-session enforcement or universal disk cap is promised.
