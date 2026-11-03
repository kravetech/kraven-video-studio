// Checks an assembled master against the edit file's planned words: every
// planned word must appear in the master's transcript, in order. Catches
// clipped or dropped words after automatic pause tightening.
//
// A missing word fails the check (exit code 1). Meaning-critical words
// (negations, numbers, product names) only match exactly, never by fuzzy
// spelling, so "hindi" can never pass as something else. Exceptions are
// explicit, in the edit file:
//   "verify": {
//     "variants": { "eto": "ito" },        // planned spelling -> heard spelling
//     "allowMissing": ["talaga [Hook]"]    // word [segment] the owner agreed to drop
//   }
//
// Usage: node scripts/verify-cut.mjs <edit.json> <master-captions.json>
import { readFileSync } from "node:fs";

const [editPath, capPath] = process.argv.slice(2);
if (!editPath || !capPath) {
  console.error("Usage: node scripts/verify-cut.mjs <edit.json> <master-captions.json>");
  process.exit(2);
}
const norm = (w) => w.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
const edit = JSON.parse(readFileSync(editPath, "utf8"));
const variants = Object.fromEntries(Object.entries(edit.verify?.variants ?? {}).map(([a, b]) => [norm(a), norm(b)]));
const allowMissing = new Set(edit.verify?.allowMissing ?? []);
const planned = edit.segments
  .flatMap((s) => s.words.split(/\s+/).map((w) => ({ w: norm(w), seg: s.label })))
  .filter((x) => x.w);
const heard = JSON.parse(readFileSync(capPath, "utf8")).captions.map((c) => norm(c.text)).filter(Boolean);

// Words whose loss or swap changes the meaning: Taglish and English negations,
// numbers, and public tool names and explicitly configured exact-match words.
const NEGATIONS = ["hindi", "di", "wala", "walang", "huwag", "wag", "ayaw", "not", "no", "never", "dont", "cant", "wont", "isnt", "arent", "didnt", "doesnt"];
const NUMBER_WORDS = ["isa", "dalawa", "tatlo", "apat", "lima", "anim", "pito", "walo", "siyam", "sampu", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "hundred", "thousand", "million"];
const PRODUCTS = ["claude", "codex", "obsidian", "gemini", "chatgpt", "gpt", "openai", "anthropic", "cursor", "notion"];
const exactWords = edit.verify?.exactWords ?? [];
if (!Array.isArray(exactWords) || exactWords.some(w => typeof w !== "string" || !norm(w) || /\s/.test(w))) throw new Error("verify.exactWords must be an array of nonempty single words.");
const CRITICAL = new Set([...NEGATIONS, ...NUMBER_WORDS, ...PRODUCTS, ...exactWords.map(norm)]);
const critical = (w) => CRITICAL.has(w) || /\d/.test(w);

// Speech recognition spells Taglish inconsistently ("eto"/"ito", "nung"/"ng"),
// so ordinary words within a small edit distance count as the same word.
const distance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};
const same = (a, b) => {
  if (a === b || variants[a] === b) return true;
  if (critical(a) || critical(b)) return false;
  return distance(a, b) <= (Math.max(a.length, b.length) >= 6 ? 2 : 1) || (a.length > 2 && (a.startsWith(b) || b.startsWith(a)));
};

// Longest common subsequence: planned words that the master is missing.
const n = planned.length;
const m = heard.length;
const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
for (let i = n - 1; i >= 0; i--)
  for (let j = m - 1; j >= 0; j--)
    L[i][j] = same(planned[i].w, heard[j]) ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
const missing = [];
let i = 0;
let j = 0;
while (i < n && j < m) {
  if (same(planned[i].w, heard[j])) { i++; j++; }
  else if (L[i + 1][j] >= L[i][j + 1]) { missing.push(planned[i]); i++; }
  else j++;
}
while (i < n) missing.push(planned[i++]);

const label = (x) => `${x.w} [${x.seg}]`;
const allowed = missing.filter((x) => allowMissing.has(label(x)));
const failing = missing.filter((x) => !allowMissing.has(label(x)));
console.log(`Planned words found in master: ${n - missing.length}/${n} (${(((n - missing.length) / n) * 100).toFixed(1)}%)`);
if (allowed.length) console.log("Allowed to be missing (edit file verify.allowMissing):", allowed.map(label).join(", "));
if (failing.length) {
  console.log("FAIL. Not heard:");
  for (const x of failing) console.log(`  ${critical(x.w) ? "CRITICAL " : ""}${label(x)}`);
  console.log("Fix the cut, or, for a real spelling variant, add it to verify.variants; a word the owner agreed to drop goes in verify.allowMissing.");
  process.exit(1);
}
console.log("PASS");
