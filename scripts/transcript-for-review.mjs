// Prints a caption file as numbered phrases with timestamps so Kraven can
// read and correct the transcript. Word indexes let corrections be applied
// to the exact entries in "captions".
//
// Usage: pnpm captions:show <captions.json>
import { readFileSync } from "node:fs";
import { reviewState } from "../src/captions/review.ts";

const [input] = process.argv.slice(2);
if (!input) {
  console.error("Usage: pnpm captions:show <captions.json>");
  process.exit(1);
}

const file = JSON.parse(readFileSync(input, "utf8"));
const { review, captions } = file;
const state = await reviewState(file);
const stamp = (ms) => {
  const s = ms / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${(s % 60).toFixed(1).padStart(4, "0")}`;
};

console.log(`Review state: ${state}${review.reviewedBy ? ` (approved by ${review.reviewedBy}, ${review.reviewedAt})` : ""}\n`);
let line = [];
let first = 0;
captions.forEach((c, i) => {
  if (line.length === 0) first = i;
  line.push(c.text.trim());
  if (/[.,?!]$/.test(c.text.trim()) || i === captions.length - 1) {
    console.log(`${stamp(captions[first].startMs)}  [${first}-${i}]  ${line.join(" ")}`);
    line = [];
  }
});
