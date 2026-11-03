// Promotes a validated, human-approved package to For Upload without
// re-rendering: the exact files that passed validation are copied and their
// hashes verified. Refuses when validation failed or any file changed since,
// and never replaces a different upload silently: --replace moves the old
// files aside (never deletes them). Writes manifest.json to both folders.
//
// Run only after the owner has reviewed the package and approved it in chat.
//
// Usage: pnpm release "<Edited/Video name>" --approved-by "<reviewer>" [--replace] [--upload-dir <For Upload folder>]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promoteRelease } from './lib/promote.mjs';
import { fingerprint, packageFiles, sha256File } from "./lib/package.mjs";
import { assertInputsCurrent } from './lib/render-record.mjs';
import { CUT_QC_VERSION } from './lib/cut-qc.mjs';
import { EDITORIAL_VERSION } from './lib/editorial-review.mjs';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const approvedBy = opt("--approved-by");
const fail = (msg) => {
  console.error(`Release refused: ${msg}`);
  process.exit(1);
};
if (!dir) fail('usage: pnpm release "<Edited/Video name>" --approved-by "<reviewer>" [--replace] [--upload-dir <folder>]');
if (!approvedBy) fail("--approved-by is required, and only after the owner has approved the package in chat.");

const pkg = packageFiles(dir);
// Upload folder: For Upload/<Video name>, beside the Edited folder.
const uploadRoot = opt("--upload-dir") ?? path.join(path.dirname(path.dirname(path.resolve(dir))), "For Upload");
const dest = path.join(uploadRoot, pkg.name);

// 1. Validation passed, and nothing changed since.
if (!existsSync(pkg.validation)) fail(`no validation.json; run pnpm validate first.`);
const validation = JSON.parse(readFileSync(pkg.validation, "utf8"));
if (validation.result !== "pass") fail(`validation failed (${validation.checks.filter((c) => !c.ok).map((c) => c.name).join("; ")}).`);
if(pkg.records.cuts&&(validation.cutQc?.algorithmVersion!==CUT_QC_VERSION||validation.cutQc?.status!=='pass'||!validation.inputs?.cutList||!validation.inputs?.cutSource))fail('Current cut QC is required. Validate this cut package again.');
if(pkg.records.cuts&&(validation.takeReview?.algorithmVersion!==EDITORIAL_VERSION||validation.takeReview?.status!=='pass'||!validation.inputs?.['take:review']||!validation.inputs?.['take:decisions']))fail('Current take review is required. Validate this cut package again.');
if(validation.pacingReview?.algorithmVersion!==EDITORIAL_VERSION||validation.pacingReview?.status!=='pass'||!validation.inputs?.['pacing:review']||!validation.inputs?.['pacing:decisions'])fail('Current final pacing review is required. Validate this package again.');
try { assertInputsCurrent(validation.inputs); }
catch (error) { fail(error.message); }
const now = fingerprint({ ...pkg.upload, ...pkg.records });
const changed = Object.keys({ ...now, ...validation.files }).filter((f) => now[f]?.sha256 !== validation.files[f]?.sha256);
if (changed.length) fail(`changed since validation: ${changed.join(", ")}. Validate again.`);

// 2. The release manifest.
const uploadNames = Object.values(pkg.upload).map((f) => path.basename(f));
const manifest = {
  video: pkg.name,
  releasedAt: new Date().toISOString(),
  approvedBy,
  validatedAt: validation.checkedAt,
  inputHashes: Object.fromEntries(Object.entries(validation.inputs).map(([role, value]) => [role, { sha256: value.sha256, bytes: value.bytes }])),
  upload: Object.fromEntries(uploadNames.map((n) => [n, now[n]])),
  records: Object.fromEntries(Object.keys(now).filter((n) => !uploadNames.includes(n)).map((n) => [n, now[n]])),
};

// 3. Stage and verify a complete package before promoting the directory.
try {
  const result = promoteRelease({
    dest, files: Object.values(pkg.upload), manifest,
    replace: args.includes('--replace'),
    sources: Object.values(validation.inputs).map(input => input.path),
    verify: () => {
      assertInputsCurrent(validation.inputs);
      const current = fingerprint({ ...pkg.upload, ...pkg.records });
      if (JSON.stringify(current) !== JSON.stringify(now)) throw new Error('Package changed during release. Validate again.');
    },
  });
  writeFileSync(pkg.manifest, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Released ${pkg.name}: ${uploadNames.length} files -> ${result.dest}, hashes verified.`);
  if (result.previous) console.log(`Previous package preserved: ${result.previous}`);
} catch (error) { fail(error.message); }
