// Records that the owner checked caption sync after a re-cut moved the timing
// (remap-captions). Only valid while the approved text is unchanged; a text
// change needs a full captions:approve instead. Run only after the owner has
// watched a preview and confirmed the sync in chat.
//
// Usage: pnpm captions:approve-sync <captions.json> "<reviewer name>"
import { readFileSync, writeFileSync } from "node:fs";
import { reviewState, timingHash } from "../src/captions/review.ts";

const [input, reviewer] = process.argv.slice(2);
if (!input || !reviewer) {
  console.error('Usage: pnpm captions:approve-sync <captions.json> "<reviewer name>"');
  process.exit(1);
}

const file = JSON.parse(readFileSync(input, "utf8"));
const state = await reviewState(file);
if (state === "approved") {
  console.log(`${input}: already approved; timing unchanged.`);
  process.exit(0);
}
if (state !== "timing-changed") {
  console.error(`${input}: ${state}. Sync approval only applies when the approved text is unchanged and only timing moved.`);
  process.exit(1);
}
file.review = { ...file.review, timingHash: await timingHash(file.captions), syncReviewedBy: reviewer, syncReviewedAt: new Date().toISOString() };
writeFileSync(input, JSON.stringify(file, null, 2));
console.log(`${input}: sync reviewed by ${reviewer}`);
