# Cut-risk QC and listening review

`pnpm check:cuts <master.cuts.json> [captions.json]` checks the first and last edge of every kept clip. It records analyzed edges, contiguous joins, source-file boundaries and insufficient context separately. This is a conservative energy-risk detector, not phoneme recognition or certification that all words are whole.

Both assembly and final rendering check available cut lists automatically. Package validation always reruns cut QC for a cut package, using the current source/cuts. Release requires the current successful QC result and unchanged source/cut/review fingerprints. Full-length packages without a cut list retain their separate duration/render/SRT validation.

The default compares 40 ms of discarded audio with up to 400 ms of nearby context using 10 ms RMS windows. It flags strong absolute energy (at least −45 dBFS) or contrast of at least 8 dB above the local 20th-percentile floor. This catches the former continuous-energy blind spot but can flag breaths/background noise. Quiet sounds can still escape any simple energy heuristic; listen to every cut. Source-file boundaries have no discarded outside audio to test, and contiguous joins remove none: their counts are explicit rather than called acoustically analyzed. Less than 40 ms of discarded context requires listening review.

Missing/unreadable audio, failed FFmpeg/FFprobe execution, invalid ranges or non-finite margins fail. CLI exit 0 means no unresolved reported risks, 1 means risks/inconclusive edges need attention, and 2 means analysis/usage failed. A QC JSON sidecar is written beside the cuts (or use `--out`). Existing delivered sidecars require approved `--force` replacement; raw/source paths remain protected.

Fix a suspicious edge by retaining more source audio, reviewing snap windows, or disabling tightening on the affected segment. Wider snap windows alone are not a guarantee of a better cut. For noisy takes, a conservative starting point is `pauses: { minMs: 800, keepMs: 250 }`; audition rather than applying it indiscriminately.

If a flagged edge is intentionally retained after the owner listens, create a listening-review JSON. Copy `source.sha256`, `cuts.sha256` and the complete `settings` object from the QC output. Each decision names a current risk/inconclusive edge ID and explains the listening decision:

```json
{
  "schemaVersion": 1,
  "sourceSha256": "COPY_FROM_QC_SOURCE",
  "cutsSha256": "COPY_FROM_QC_CUTS",
  "settings": {"marginDb":8,"windowMs":10,"edgeMs":40,"contextMs":400,"absoluteThresholdDb":-45},
  "reviewedBy": "Owner",
  "reviewedAt": "COPY_ACTUAL_REVIEW_TIME",
  "decisions": [{"edgeId":"clip-1-in","reason":"Record what was actually heard and why this boundary is acceptable."}]
}
```

These placeholders deliberately cannot constitute a valid review. Never create owner approvals on the agent's own judgment. Review fields record a human decision; they do not cryptographically authenticate identity.

Set `cutReview` in the edit/project JSON to the review file path, pass `--review` to `check:cuts`, and pass `--cut-review` to `render:final` when needed. Settings/source/cut changes invalidate the review; failed decoding cannot be overridden. CLI `--margin` is available for diagnostics, while automated production gates use the documented default settings.

Assembly retains a master for preview even when QC returns needs-review, but exits nonzero. Resolve the reported edges before final rendering/delivery. The same caption text and timing approval gates continue to apply independently.
