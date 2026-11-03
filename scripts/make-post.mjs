// Writes the Facebook and Instagram post for a video from the `post` block of
// its edit file. The copy is written from the approved transcript; this script
// enforces the house format so every post reads the same:
//
//   hook question
//   one idea per line, from the speaker's own words
//   closing line
//   🔗 Join our community: <Discord link, never changed>
//   the configured primary hashtag plus 2-4 topic hashtags
//
// Usage: node scripts/make-post.mjs <edit.json> <captions.json> --out "<package>/<Video name> - post.txt" [--force] [--unreviewed]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { REVIEW_MESSAGES, reviewState } from "../src/captions/review.ts";
import { ensureSafeOutput } from "./lib/guard.mjs";

import { communityLine as DISCORD, primaryHashtag } from './lib/brand.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [editPath, capPath] = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
let out = opt("--out");
if (!editPath || !capPath || !out) {
  console.error('Usage: node scripts/make-post.mjs <edit.json> <captions.json> --out "<package>/<Video name> - post.txt" [--force] [--unreviewed]');
  process.exit(1);
}

// The post quotes the video, so it needs the approved text. Timing does not
// matter here, so a re-cut awaiting a sync check is fine.
const state = await reviewState(JSON.parse(readFileSync(capPath, "utf8")));
if (state !== "approved" && state !== "timing-changed") {
  if (!flag("--unreviewed")) throw new Error(`${capPath}: ${REVIEW_MESSAGES[state]} The post must come from the approved transcript.`);
  out = out.replace(/(\.\w+)$/, "-UNREVIEWED$1");
}

const post = JSON.parse(readFileSync(editPath, "utf8")).post;
if (!post) throw new Error(`${editPath} has no "post" block (hook, lines, closing, hashtags).`);
const { hook, lines = [], closing, hashtags = [] } = post;
const problems = [];
if (!hook?.trim().endsWith("?")) problems.push("hook must be a question");
if (lines.length < 2 || lines.length > 6) problems.push("use 2-6 body lines, one idea each");
if (!closing?.trim()) problems.push("closing line is missing");
if (hashtags[0] !== primaryHashtag) problems.push(`hashtags must start with ${primaryHashtag}`);
if (hashtags.length < 3 || hashtags.length > 5) problems.push("use the configured primary hashtag plus 2-4 topic hashtags");
if (hashtags.some((h) => !/^#[A-Za-z0-9]+$/.test(h))) problems.push("hashtags are one word each, no spaces or symbols");
// The Discord line carries the only emoji, and the link is added here, never typed.
const copy = [hook, ...lines, closing].join("\n");
if (/\p{Extended_Pictographic}/u.test(copy)) problems.push("no emoji in the copy");
if (/discord|https?:\/\//i.test(copy)) problems.push("leave links out of the copy; the Discord line is added automatically");
if (problems.length) throw new Error(`Post not written:\n- ${problems.join("\n- ")}`);

ensureSafeOutput(out, { sources: [editPath, capPath], force: flag("--force") });
if (existsSync(out) && !flag("--force")) throw new Error(`${out} exists; pass --force only with the owner's say-so.`);
const text = [hook, ...lines, closing, DISCORD, hashtags.join(" ")].filter(Boolean).map((s) => s.trim()).join("\n\n") + "\n";
writeFileSync(out, text);
console.log(`Post for Facebook and Instagram -> ${out}\n\n${text}`);
