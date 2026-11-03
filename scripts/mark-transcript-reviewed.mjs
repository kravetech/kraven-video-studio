// Marks a caption file's transcript as human-reviewed, which unlocks
// rendering. Run only after the owner has read and confirmed the corrected text;
// an agent must never run this on its own judgment.
//
// Usage: pnpm captions:approve <captions.json> "<reviewer name>"
import { readFileSync, writeFileSync } from "node:fs";
import { textHash, timingHash } from "../src/captions/review.ts";

const [input, reviewer] = process.argv.slice(2);
if (!input || !reviewer) {
  console.error('Usage: pnpm captions:approve <captions.json> "<reviewer name>"');
  process.exit(1);
}

const file = JSON.parse(readFileSync(input, "utf8"));
// Keep the proposed-corrections log as the audit trail of what was approved.
// Approval is bound to this exact text and timing; later edits cancel it.
const { syncReviewedBy, syncReviewedAt, ...rest } = file.review ?? {};
file.review = {
  ...rest,
  status: "reviewed",
  reviewedBy: reviewer,
  reviewedAt: new Date().toISOString(),
  textHash: await textHash(file.captions),
  timingHash: await timingHash(file.captions),
};
writeFileSync(input, JSON.stringify(file, null, 2));
console.log(`${input}: reviewed by ${reviewer}`);
