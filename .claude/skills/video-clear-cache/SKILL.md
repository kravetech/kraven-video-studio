---
name: video-clear-cache
description: Inspect Kraven Video Studio render-cache usage and safely remove eligible owned Remotion jobs when asked to clear cache, reclaim render space or diagnose temporary-file growth. Preserve active renders, media and unverified legacy files.
---

# Video Clear Cache

Use this installation's existing storage commands; do not implement another deletion mechanism. Read [render storage](../../../docs/RENDER-STORAGE.md) for lifecycle details. Resolve repository-relative paths from the installed project root.

## Inspect and clean

1. Confirm the intended installation and run from its root in the tool-enabled shell (`. .\Start-Video-Studio.ps1 -Shell`). Read only the relevant storage settings in ignored `studio.local.json`; do not print the whole configuration. Record whether `KVS_RENDER_CACHE_ROOT` overrides the saved location. Do not change either value to reach another installation's files.
2. Run `pnpm storage:status` and `pnpm storage:clean`. These are read-only. Record the resolved root, installation ID, effective cleanup policy, free GiB, job paths, statuses, measured bytes, eligibility and errors. Use the reported retentionHours; 48 hours is the default/minimum, not a fixed expiry for every installation. Report unmeasuredJobs and the recognized-job scope; the 20 GiB default warning is not a hard cap. Do not change policy during cleanup unless requested. The JSON payload is also available without pnpm's banner through `node scripts/storage.mjs` and `node scripts/storage.mjs --clean`.
3. For an inspection-only request, report the preview and stop. When the user requests cleanup (including invoking `/video-clear-cache` without an inspection qualifier), that authorizes applying the supported owned-cache cleanup. Run `pnpm storage:clean --apply` and check its exit status. Do not request repeat confirmation for this already requested operation. If scope is ambiguous, present the preview before asking whether to apply.
4. Capture the apply result and run `pnpm storage:status` again. Report the actual `removed` paths/count, remaining cache, preserved categories, and observed free GiB before/after. Sum the previously measured bytes only for paths confirmed in `removed`, labeling this as estimated removed file bytes; eligibility alone is not proof of deletion. If a removed path had no valid prior measurement, report its size as unavailable. Free-space change can differ because of other disk activity, allocation and rounding. Never claim that total Windows temporary storage was reclaimed.
5. On a nonzero exit, stop applying cleanup, preserve the error, and inspect status without changing ownership metadata. A failure may follow partial removal; report verified outcomes only. Do not retry through manual deletion or relaxed checks.

## Preservation rules

- Active, unknown, linked, other-installation and unverifiable legacy jobs are preserved. Expired terminal jobs still require ownership and process-use checks at apply time. Never kill a process, stop a running Studio or shorten retention just to reclaim space.
- Failed/interrupted jobs retain bulk diagnostics for at least 48 hours. Apply can recover a proven abandoned job, which starts a fresh configured retention period (48 hours by default). Its old folder timestamp does not make it immediately deletable. The first cleanup may correctly remove nothing; explain why and the next eligible time where evidence supports it.
- Successful render jobs and normally stopped Studio sessions clean themselves. A long Studio session can accumulate cache until the owner finishes and closes it normally. Suggest this when relevant; do not interrupt their work.
- Never edit ownership tokens, statuses, timestamps or installation IDs. Never add a force flag, replace the root or use a recursive wildcard sweep to bypass the storage command.
- Raw footage, edited/upload packages, `out`, `public`, custom assets, `.studio/render-logs`, `.studio/tools`, `.studio/downloads`, `node_modules` and the pnpm store are not disposable render cache. Preserve them. Test workspaces use a separate sibling root and are not managed by this command; subsequent test launches apply their own retention rules.

## Excess space outside managed cache

If managed jobs do not explain the reported usage, distinguish the selected render cache from Windows temporary files, installer downloads and dependencies. A `remotion-*` name, age or location under system Temp is insufficient evidence of ownership or inactivity. Inventory relevant legacy folders read-only when asked to investigate; keep unknown/active files and report the separate unmanaged total. Do not delete them through this skill or expand into general drive cleanup.

Recommend a dedicated local render folder on a non-system fixed drive when available, separate from application and media. Use the [installation protocol](../../../INSTALL.md) for changing storage; do not move/delete old cache or change global TEMP/TMP as part of cleanup. Use supported `pnpm dev`, `pnpm broll`, `pnpm cover` and `pnpm render:final` commands so new temporary files stay in owned jobs. Direct Remotion commands bypass these controls.

Finish with the installation/root inspected, preview or apply result, estimated bytes actually removed, observed disk-space change, preserved jobs and any concrete follow-up. Keep private machine paths in the local response only, never in distributable source.
