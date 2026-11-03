# Voice and sound-effect standard

Part of **Kraven Video Studio** — You shoot. AI edits. You approve.

The `speech-soft-v3` house profile lives in `src/audio/standard.ts`. Master assembly, effect playback and finished-package validation import that same source. Both video orientations use it.

| Setting | House value |
| --- | --- |
| Voice-master normalization | −16 LUFS integrated, two-pass analysis |
| Finished mix acceptance | −16 LUFS ±1 LU, measured after effects and AAC encoding |
| Voice mastering true-peak ceiling | −1.5 dBTP |
| Finished-file maximum true peak | −1 dBTP |
| Working audio rate | 48 kHz |
| Included whoosh gain | 3 |
| Included hit gain | 1 |
| Included tick gain | 1 |

The gain values multiply each included asset's amplitude; they are not LUFS values or universal effects standards. Different replacement sound files can have different loudness at the same gain. Preserve valid assets, audition replacements with dialogue and revalidate the complete mix. A deliberate per-cue volume overrides the default; zero remains a mute. Existing cue files are not rewritten. The default gain applies to cues that omit volume.

Normalize the voice master first. Add the restrained effects, then validate the finished mix. If a mix exceeds the delivery window or peak ceiling, adjust the mix and render again. Do not normalize every effect to the speech loudness, blanket-compress the final mix or rely on platform playback normalization. The validator measures the combined output; a compliant voice track alone does not establish a compliant finished file. Existing EQ/compression choices, cut timing, captions and B-roll placement remain independent of this profile.

This is a speech-led house choice, not a claim that all platforms use −16 LUFS. [Apple's audio guidance](https://podcasters.apple.com/support/893-audio-requirements) recommends approximately −16 LKFS ±1 and a maximum true peak of −1 dBFS for podcast delivery. [AES guidance](https://aes.org/resources/audio-topics/loudness-project/loudness-normalization/) distinguishes content types and describes −18 LUFS for speech/assorted streams. Distribution specifications differ. The house profile uses the Apple-style level as a practical baseline for restrained spoken-content videos; it is not a music, broadcast or theatrical delivery preset.

Integrated loudness and peak checks do not establish intelligibility or subjective balance. Audition dialogue and effects on headphones and a phone speaker. Keep effects below the explanation in perceived prominence, and reduce or omit an effect if it masks speech.

Earlier −14 LUFS renders and approved packages are retained unchanged. A new release under this profile requires a new render and validation; audio-source/profile hashes participate in render provenance. Never fabricate a historical render record or reuse an approval for a changed mix.

The asset-specific profile uses whoosh 3, hit 1 and tick 1, with explicit per-cue gains allowed from 0 to 4. These reviewed defaults do not establish subjective balance on replacement assets; listen and validate the final encoded mix. Older gains and delivered files are not rewritten.
