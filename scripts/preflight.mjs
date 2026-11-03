// Checks an edit job before rendering anything: tools, source media, cut
// ranges and output paths. assemble-cut runs the same checks automatically.
//
// Usage: pnpm preflight <edit.json> [out.mp4] [--force]
import { readFileSync } from "node:fs";
import { preflight, report } from "./lib/preflight.mjs";

const args = process.argv.slice(2);
const [editPath, outPath] = args.filter((a) => !a.startsWith("--"));
if (!editPath) {
  console.error("Usage: pnpm preflight <edit.json> [out.mp4] [--force]");
  process.exit(2);
}
const edit = JSON.parse(readFileSync(editPath, "utf8"));
console.log(`Preflight: ${editPath}`);
process.exit(report(preflight(edit, { editPath, outPath, force: args.includes("--force") })) ? 0 : 1);
