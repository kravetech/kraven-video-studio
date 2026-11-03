# Timed B-roll, zooms and sound effects

Part of **Kraven Video Studio** — You shoot. AI edits. You approve.

Choose placement manually, using the spoken content as the guide. These optional cues composite directly in `CaptionedClip`; exporting standalone B-roll for external placement remains supported. Avoid adding effects merely because the feature exists.

All times are milliseconds on the edited master, after cuts. Pass the edit JSON using `--edit` in `render:final` or the existing `calloutsSrc` property in a preview. See `examples/enhancements.example.json` for a complete cue-only example; its timeline requires at least seven seconds of video.

```json
{
  "broll": [
    {"atMs": 2241, "variant": "keyword", "primary": "ONE CLEAR IDEA", "holdMs": 1400}
  ],
  "zooms": [
    {"atMs": 200, "durationMs": 1600, "scale": 1.15}
  ],
  "sfx": [
    {"atMs": 700, "sound": "tick"},
    {"atMs": 2241, "sound": "whoosh"},
    {"atMs": 5000, "sound": "hit"}
  ]
}
```

- **B-roll:** existing twelve card variants; optional `secondary`, `beforeLabel`, `afterLabel`, `holdMs` and `spoken` fields. The card uses the video's orientation. Its duration includes the preset's entrance, hold and exit. Captions and technical callouts are suppressed on those exact frames; SRT keeps all approved words. The source video's audio continues.
- **Zooms:** scales from 1 to at most 1.25, toward the existing face-biased anchor. Entry and exit use the preset easing. Short cues shorten their ramps so they can reach the requested scale.
- **Sounds:** `whoosh`, `hit` or `tick`; optional linear `volume` from 0 to 4. Defaults are 3, 1 and 1 respectively, calibrated to the included assets. Preview the actual mix and keep effects below the spoken content. Final validation checks integrated loudness and true peak after mixing.
- Cues must fit within the video. B-roll cards and zoom cues cannot overlap others of the same kind. Multiple sound cues may overlap, subject to final-mix checks.

## Sound preparation

Guided setup generates effects automatically, even with `-SkipSmokeTest`. Doctor verifies the files. Manual development setup uses:

```powershell
pnpm sfx
pnpm sfx --check
```

Generation uses seeded synthesis through FFmpeg and creates 48 kHz mono PCM WAVs under ignored `public/sfx/`. The source ZIP ships the generator, without WAV binaries or production-machine paths. Existing valid assets are preserved on rerun. Corrupt files fail verification; back up any custom assets before explicitly regenerating with `pnpm sfx --force`.

Every used sound's hash is captured before rendering and checked again afterwards. Changing the sound, cue file or rendering code requires a new render and validation. A previously approved caption transcript does not approve a new visual or audio mix; human review of the final package is still required.

## Checks

`pnpm check` runs TypeScript and regression tests. With FFmpeg and the render browser available, `pnpm test:media` renders both orientations with cutaways, zooms and every sound. It measures card boundaries, expected zoom crop, continuous source audio and effect frequencies, then validates and releases only the synthetic fixtures. It also checks failed release attempts after captions or sound assets change. These checks do not establish editorial approval of real recordings.

## B-roll validation and replacement

Standalone `pnpm broll <cues.json> [outDir] [--force]` checks all cues and destinations before writing. IDs use 1–80 letters/numbers/underscores/hyphens, begin with a letter or number, are unique ignoring case, and cannot be Windows device names. Path traversal, protected destinations, aliases escaping the selected folder and source collisions are refused. Existing clips and manifests require explicit `--force` approval, including in working folders; use a fresh output folder to retain an earlier batch.

Both standalone and embedded cards use the same content/timing rules. Use 1–5 primary words per part and at most 8 secondary words. Comparisons require exactly two nonempty parts; steps allow 1–3; AI workflows require 2–3 explicit nodes. Numeric cards require an explicit finite number. Stat cards require 0–100%; use `number` for other amounts. No missing content is supplied automatically.

Every card needs 900 ms of reading time after its final reveal, including delayed steps and supporting text. The minimum is calculated from the actual variant, text and motion clock; a short `holdMs` fails with the required value. No cue is extended or moved automatically. Existing default examples remain valid. Older short cues may need a manually reviewed longer hold and a fresh render/validation.

Audio targets and gain defaults come from the shared [audio standard](AUDIO-STANDARD.md); validate the final mix after adding effects.
