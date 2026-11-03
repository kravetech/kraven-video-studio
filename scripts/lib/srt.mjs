// SRT text for a caption file, with the same grouping and timing as the
// burned-in subtitles. Shared by the SRT export and package validation, so a
// delivered SRT can be checked against the approved transcript byte for byte.
import { groupCaptions } from "../../src/captions/grouping.ts";
import { cssVars as v } from "../../src/design-system/tokens.generated.ts";

const rules = {
  wordsMin: parseFloat(v["caption-words-min"]),
  wordsMax: parseFloat(v["caption-words-max"]),
  gapBreakMs: parseFloat(v["caption-gap-break"]),
};
const lingerMs = parseFloat(v["caption-linger"]);

const stamp = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const h = String(Math.floor(t / 3600000)).padStart(2, "0");
  const m = String(Math.floor((t % 3600000) / 60000)).padStart(2, "0");
  const s = String(Math.floor((t % 60000) / 1000)).padStart(2, "0");
  return `${h}:${m}:${s},${String(t % 1000).padStart(3, "0")}`;
};

// Returns { srt, count, lastEndMs }. endMs (the final video's length) clamps
// every cue so none outlasts the video; the last page's linger can otherwise
// run past the end, where the burned-in captions simply stop.
export function captionsToSrt(captions, { endMs = Infinity } = {}) {
  if (!(endMs > 0) || (!Number.isFinite(endMs) && endMs !== Infinity)) throw new Error('Invalid video duration for captions.');
  if (!Array.isArray(captions) || !captions.length) throw new Error('Captions must contain at least one word.');
  let previousStart = -1;
  for (const word of captions) {
    if (!Number.isFinite(word.startMs) || !Number.isFinite(word.endMs) || word.startMs < 0 || word.endMs <= word.startMs || word.startMs < previousStart || word.startMs >= endMs) throw new Error('Caption timing is invalid, unsorted or outside the video.');
    previousStart = word.startMs;
  }
  const groups = groupCaptions(captions, rules);
  let lastEndMs = 0;
  const srt = groups
    .map((g, i) => {
      const end = Math.min(groups[i + 1]?.startMs ?? Infinity, g.endMs + lingerMs, endMs);
      lastEndMs = end;
      return `${i + 1}\n${stamp(g.startMs)} --> ${stamp(end)}\n${g.text}\n`;
    })
    .join("\n");
  return { srt, count: groups.length, lastEndMs };
}
