# Take review and final pacing review

Part of **Kraven Video Studio** — You shoot. AI edits. You approve.

Two local review stages protect natural delivery. They generate evidence, not cuts or an AI verdict about intent. Claude, another assistant or a person proposes decisions from the surrounding words, audio and preview. Human transcript, sync, cut-listening and final-release approvals remain separate.

## 1. Selected takes, before assembly

Use the original word-level Whisper JSON and the **16 kHz, mono, PCM signed 16-bit WAV** used for transcription. Supply the original video with matching time coordinates. Review ranges must include every selected segment and the allowed snap margins. Omit ranges to review the entire source timeline.

```powershell
pnpm takes:review transcript.json speech.wav --source raw.mp4 --ranges "10-20,30-45" --out take-review.json
pnpm takes:review --check take-review.json take-decisions.json --report take-decisions.md
```

The default candidate threshold is 700 ms; `--min-pause-ms 400` can expose shorter hesitations for review without changing the cut threshold. It detects acoustic pauses, wordless intervals even over background noise, repeated phrases and adjacent single-word repetitions. Taglish expressions, emphasis, repeated list introductions and breaths may be deliberate. Never delete solely because a candidate exists.

Decisions use the exact hash of the current review:

```json
{
  "reviewSha256": "COPY_ACTUAL_REVIEW_SHA256",
  "decidedBy": "Actual editorial reviewer",
  "decisions": [
    {"id":"t-001","decision":"keep","reason":"Describe the actual contextual reason."}
  ]
}
```

Use `keep`, `shorten`, `remove-restart` or `review`. Every candidate needs one unique decision and a reason. A decision is a proposal, not a human approval. Overlapping candidates can describe the same restart: report candidate decisions separately from unique edited intervals. Do not count them as distinct removals.

Set `takeReview` and `takeDecisions` in the edit JSON. Assembly requires current reviews and complete range coverage before writing a master. Cases marked `review` may remain in a preview master; final rendering and validation reject unresolved cases. Apply accepted changes explicitly to segments; the tool never rewrites an edit or chooses cut boundaries. Whisper offsets can drift or be repaired estimates. Listen and choose acoustic boundaries, then retranscribe the assembled master and run word, cut and sync checks.

## 2. Final pacing, after rendering

Run this on the actual encoded output after captions, cards, zooms and sounds are present:

```powershell
pnpm pacing:review final.mp4 captions.json --edit cues.json --out pacing-review.json
pnpm pacing:review --check pacing-review.json pacing-decisions.json --report pacing-decisions.md
```

The default finds wordless intervals of at least 500 ms, regardless of background sound, and sustained large visual differences sampled at 2 fps. Motion is a candidate signal: a camera swing, a screen change and an intentional card can look similar. It is not a camera-shake classifier and can miss subtle or short movements. Inspect the complete preview even if zero candidates are reported. Review monitor repositioning, text readability, repeated explanations, intentional pauses, the tail hold and dialogue/effect balance on a phone and headphones.

Pacing decisions have the same format, plus a truthful visual-inspection record:

```json
{
  "reviewSha256": "COPY_ACTUAL_REVIEW_SHA256",
  "decidedBy": "Actual editorial reviewer",
  "visualReview": {"status":"complete","notes":"Record the actual complete-preview inspection and any limitations."},
  "decisions": [{"id":"p-001","decision":"keep","reason":"Explain the observed beat or transition."}]
}
```

Set `pacingReview` and `pacingDecisions` in the package's project JSON. Validation requires the current final video, current captions, the rendered cue file if one exists, resolved candidates and complete visual review. Release requires this validated record and unchanged fingerprints. If pacing needs a cut, edit the source plan, rebuild/retranscribe, review synchronization, retime enhancements, render and review again. Never cut the final file without rebuilding provenance.

## Safety and compatibility

Reviews bind source video, WAV, transcript, selected ranges and current review/decisions. Input changes invalidate decisions. Invalid options/numbers/ranges, unsupported or corrupt WAVs, missing inputs and failed analysis stop the command. Source/raw paths, hard-link and directory aliases remain protected even with `--force`. Existing review/report outputs require explicit replacement; prefer new revision filenames.

Earlier review files and delivered videos remain unchanged historical records. Regenerate review evidence for a new render/release; do not fabricate records or approvals for an old video. No cloud model, paid API or automatic publication is required or invoked by these scripts.
