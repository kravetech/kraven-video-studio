// Moves an approved caption file onto a re-assembled master after cut points
// change, keeping the approved text exactly. Each word is traced back to its
// source time through the old cut list, then forward through the new one
// (clips must correspond one to one). A clip's first word starts with its clip
// and its last word ends with it, so widened cuts show the restored audio.
//
// Usage: node scripts/remap-captions.mjs <old.cuts.json> <new.cuts.json> <captions.json>
import { readFileSync, writeFileSync } from "node:fs";

const [oldPath, newPath, capPath] = process.argv.slice(2);
const oldCuts = JSON.parse(readFileSync(oldPath, "utf8"));
const newCuts = JSON.parse(readFileSync(newPath, "utf8"));
const oldClips = oldCuts.clips;
const newClips = newCuts.clips;
// Only a re-cut of the same edit may keep the approved text: same source, the
// same clips in the same order, each new clip overlapping its old source range
// (cut points moved, not different footage). Anything else needs a fresh
// transcription and review.
const refuse = (why) => {
  console.error(`Not a re-cut of the same edit: ${why}. Re-transcribe and review instead.`);
  process.exit(1);
};
if (oldCuts.source !== newCuts.source) refuse(`source changed (${oldCuts.source} -> ${newCuts.source})`);
if (oldClips.length !== newClips.length) refuse(`clip count changed (${oldClips.length} -> ${newClips.length})`);
oldClips.forEach((o, i) => {
  const n = newClips[i];
  if (o.label !== n.label) refuse(`clip ${i + 1} is "${n.label}", was "${o.label}"`);
  if (!(n.in < o.out && o.in < n.out)) refuse(`clip ${i + 1} (${o.label}) moved to an unrelated source range (${o.in}-${o.out} -> ${n.in}-${n.out})`);
});

const starts = (clips) => {
  let t = 0;
  return clips.map((c) => {
    const s = t;
    t += c.out - c.in;
    return s * 1000;
  });
};
const oldStart = starts(oldClips);
const newStart = starts(newClips);
const clipOf = (ms) => {
  for (let i = oldClips.length - 1; i >= 0; i--) if (ms >= oldStart[i] - 1) return i;
  return 0;
};

const file = JSON.parse(readFileSync(capPath, "utf8"));
const words = file.captions;
const toNew = (ms, i) => {
  const src = oldClips[i].in * 1000 + (ms - oldStart[i]);
  const end = newStart[i] + (newClips[i].out - newClips[i].in) * 1000;
  return Math.min(end, Math.max(newStart[i], newStart[i] + (src - newClips[i].in * 1000)));
};

// A word belongs to the clip holding its midpoint; starts can sit a hair before a
// boundary. A zero-length word at a boundary belongs to the clip that follows.
const clipIndex = words.map((w) => clipOf(w.endMs - w.startMs < 30 ? w.startMs + 30 : (w.startMs + w.endMs) / 2));
words.forEach((w, k) => {
  const i = clipIndex[k];
  const first = clipIndex[k - 1] !== i;
  const last = clipIndex[k + 1] !== i;
  w.startMs = Math.round(first ? newStart[i] + 10 : toNew(w.startMs, i));
  w.endMs = Math.round(last ? newStart[i] + (newClips[i].out - newClips[i].in) * 1000 : toNew(w.endMs, i));
  w.timestampMs = Math.round((w.startMs + w.endMs) / 2);
});
writeFileSync(capPath, JSON.stringify(file, null, 2));
console.log(`${words.length} words remapped onto the new cut list; text unchanged. Timing moved, so final renders wait for a sync check: render a preview, then pnpm captions:approve-sync after the owner confirms.`);
