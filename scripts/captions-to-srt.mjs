// Exports a caption file as SRT using the same grouping and timing as the
// burned-in subtitles. Refuses a transcript whose approval does not match its
// current text and timing unless --unreviewed is passed, in which case the
// output name is marked UNREVIEWED.
//
// Pass the final video with --video so no cue outlasts it.
//
// Usage: pnpm captions:srt <captions.json> <out.srt> [--video <final.mp4>] [--unreviewed] [--force]
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { REVIEW_MESSAGES, reviewState } from "../src/captions/review.ts";
import { ensureSafeOutput } from "./lib/guard.mjs";
import { captionsToSrt } from "./lib/srt.mjs";

const args = process.argv.slice(2);
const video = args.includes("--video") ? args[args.indexOf("--video") + 1] : undefined;
const [input, outArg] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--video");
const allowUnreviewed = args.includes("--unreviewed");
if (!input || !outArg) {
  console.error("Usage: pnpm captions:srt <captions.json> <out.srt> [--video <final.mp4>] [--unreviewed] [--force]");
  process.exit(1);
}

const file = JSON.parse(readFileSync(input, "utf8"));
const state = await reviewState(file);
const reviewed = state === "approved";
if (!reviewed && !allowUnreviewed) {
  console.error(`${input}: ${REVIEW_MESSAGES[state]} Pass --unreviewed for a marked draft.`);
  process.exit(1);
}
const out = reviewed ? outArg : outArg.replace(/\.srt$/i, "-UNREVIEWED.srt");
ensureSafeOutput(out, { sources: [input], force: args.includes("--force") });

const endMs = video
  ? parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", video], { encoding: "utf8" }).stdout) * 1000
  : Infinity;
const { srt, count } = captionsToSrt(file.captions, { endMs });
writeFileSync(out, srt);
console.log(`${count} captions -> ${out}`);
