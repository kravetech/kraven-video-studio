# Known issues — 1.0.0

This baseline retains the reviewed stable runtime and pinned Zod 4.6.6. Prior implementation acceptance is scoped in [validation](VALIDATION.md); a fresh repository does not expand platform or hardware support. The schema-utils 4.8.1 / webpack 5.105.0 peer-range warning remains unchanged. Do not upgrade unrelated dependencies merely to suppress it.

## Storage acceptance limitations

- Test launchers isolate temporary files, caches and diagnostics. Process containment and proven abandoned-job recovery protect normal rendering and cleanup. See [render storage](RENDER-STORAGE.md) for retention and cleanup rules.
- Legacy records, including old failures, cannot be safely reclaimed from age or parent PID alone; they remain intact for investigation. Cleanup affects only the current installation and selected cache.
- Native Job Object containment must be available; startup fails if containment cannot be established. Direct Remotion invocation bypasses these storage controls. Automated synthetic tests do not approve real recordings or certify every server configuration.

## Prior implementation acceptance observations

- One cold installation smoke logged two browser media `ERR_CONNECTION_REFUSED` messages, while its checks and outputs completed successfully. The two subsequent smoke runs and full portrait/landscape/Studio acceptance passed without that warning. Cause is unknown; do not ignore failed checks or missing output because of this observation. Preserve sanitized evidence if it recurs.
- After a real Studio Ctrl+C, the pnpm wrapper can return exit code 1 even when the owned job records `cancelled` with exit 0, workers stop and session cache is removed. Automation must preserve the wrapper result and inspect lifecycle evidence; do not treat every nonzero exit as a successful cancellation.
- Automatic cleanup runs on supported launches, not on a background schedule. The size threshold warns only. Active sessions and retained diagnostic jobs may exceed it; `out` test/render results are durable outputs and are not managed cache.

## Observed initial installation-smoke failure

One initial setup attempt on the tested Windows x64 machine ended with `Command failed (-1073740791): node.exe` (`0xC0000409`) during synthetic smoke rendering. The cause is unknown and no fix is claimed. A subsequent investigation reported 35 successful attempts (32 cold and three warm); this does not establish a general failure rate or prove the problem cannot recur, including in a real render.

Setup reported itself incomplete. The observed incident affected synthetic test files, with no observed user-media changes; this is not a guarantee about every future failure. Normal manual rerun completed using verified downloads. This residual risk was accepted by the owner for the stable release.

If it happens:

1. Preserve the console log, failure time, `.studio/installation.json` and the newest uniquely named installation-check folders under `out/` and `public/samples/` before retrying. Retain relevant temporary Remotion/Chrome folders if available.
2. Rerun `Install.cmd` normally. Do not skip smoke, bypass checksums, disable security controls or update pinned tools to force a pass.
3. If it recurs, stop repeated blind retries and report the sanitized error and tool/version details. Keep raw logs, reports and memory dumps private; they may contain local paths or sensitive data. See [SECURITY.md](../SECURITY.md) for private contact.

The Studio loopback preload is not loaded by the normal installer smoke process; no causal link between it and the observed crash was established.

## Studio limitations

- Use a short local application path. Deeply nested folders can exceed Windows path limits in Git, PowerShell or generated test workspaces; move a fresh source copy to a shorter folder and retain failure evidence before retrying.
- Remotion may print a Network URL even though `pnpm dev` keeps the observed Studio and lazy-compilation listeners on loopback. Open Studio on the same computer. Direct `remotion studio` bypasses the guard. The guard relies on pinned Node internals; repeat its tests and the complete listener audit after runtime/dependency upgrades. See [security boundaries](../SECURITY.md).
- The tested Studio reports that it cannot extract/update default props, so saving composition default props through that UI is unavailable. Preview and UI renders passed; retain settings and edit-file inputs through the documented file-based workflow rather than assuming in-memory overrides were saved.
- Deliberately rejected-composition cases in the media regression suite may log Puppeteer page-cleanup warnings. Assertions and subsequent valid renders must still pass. Investigate unexpected failures instead of dismissing them as this warning.

## Validation scope

The supported installer target is native Windows x64. Production-machine acceptance covered Windows 11 x64 with a compatible NVIDIA/CUDA backend, clean application setup on an in-use OS, reruns and both Studio UI render orientations. It did not certify every fresh Windows image, CPU-only configuration, GPU or Windows Server SKU. Each operator must supply their own account, satisfy third-party terms and accept their own recordings. See [validation evidence](VALIDATION.md).
