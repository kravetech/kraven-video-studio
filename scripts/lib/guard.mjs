// Output safety shared by every script that writes a file:
// - nothing is ever written inside raw-footage folders;
// - an output path may never be one of the inputs;
// - a file outside this project's working folders (public/samples/, out/),
//   such as a delivered package, is never overwritten without --force, and
//   --force needs the owner's say-so. Working copies can be rebuilt freely.
import { existsSync, lstatSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Raw footage roots; KRAVEN_PROTECTED_ROOTS (";"-separated) overrides.
const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const PROTECTED_ROOTS = (process.env.KRAVEN_PROTECTED_ROOTS ?? path.join(PROJECT, "workspace/raw"))
  .split(";")
  .filter(Boolean);

const WORK_DIRS = [path.join(PROJECT, "public/samples"), path.join(PROJECT, "out")];

// Canonicalize both sides of every comparison. Windows short names and directory
// junctions can otherwise give a configured raw root a different spelling.
export const physicalPath = (file) => {
  let parent = path.resolve(file);
  const rest = [];
  while (!existsSync(parent)) {
    try { if (lstatSync(parent).isSymbolicLink()) throw new Error(`Unresolved output link: ${parent}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const next = path.dirname(parent);
    if (next === parent) throw new Error(`Cannot resolve output: ${file}`);
    rest.unshift(path.basename(parent)); parent = next;
  }
  return path.join(realpathSync.native(parent), ...rest);
};
const key = (p) => physicalPath(p).replace(/\\/g, "/").toLowerCase();
const inside = (p, dir) => key(p) === key(dir) || key(p).startsWith(`${key(dir)}/`);

export const isWorkingPath = (p) => WORK_DIRS.some((d) => inside(p, d));

export function assertSafeOutput(out, { sources = [], force = false } = {}) {
  const root = PROTECTED_ROOTS.find((r) => inside(out, r));
  if (root) throw new Error(`${out} is inside protected raw footage (${root}). Write working copies to public/samples/ and deliverables to the package folder.`);
  if (sources.some((s) => key(s) === key(out))) throw new Error(`${out} is also an input; refusing to overwrite a source.`);
  if (existsSync(out) && !isWorkingPath(out) && !force) throw new Error(`${out} exists; pass --force only with the owner's say-so.`);
}

// For command-line scripts: print the refusal as one line and stop.
export function ensureSafeOutput(out, options) {
  try {
    assertSafeOutput(out, options);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
