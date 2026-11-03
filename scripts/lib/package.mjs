// A video's delivery package is its folder under Edited/, named after the
// video, holding files named after it. Shared by validate-package and release.
import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { profileFor } from "../../src/profiles.ts";

export { communityLine as DISCORD } from './brand.mjs';

// The project file: the cut file for a cut video, or a job record for a
// full-length edit ({ title, source, master, profile, fps, masterDurationSec }).
export function packageProject(dir) {
  const name = path.basename(path.resolve(dir));
  const project = path.join(dir, `${name} - project.json`);
  return existsSync(project) ? JSON.parse(readFileSync(project, "utf8")) : {};
}

export const packageProfile = (dir) => profileFor(packageProject(dir).profile);

export function packageFiles(dir, profile = packageProfile(dir)) {
  const name = path.basename(path.resolve(dir));
  // A cut video also keeps its cut list and EDL; a full-length edit has none.
  const cut = Boolean(packageProject(dir).segments);
  const f = (suffix) => path.join(dir, `${name}${suffix}`);
  return {
    name,
    profile,
    // Uploaded to the platforms: video, subtitles, the profile's cover image,
    // and the Facebook/Instagram post where the profile has one.
    upload: { video: f(".mp4"), srt: f(".srt"), cover: f(profile.cover.suffix), ...(profile.post ? { post: f(" - post.txt") } : {}) },
    // Production records, kept with the package.
    records: { ...(cut ? { cuts: f(".cuts.json"), edl: f(".edl") } : {}), project: f(" - project.json"), summary: f(" - editing summary.md"), render: f(" - render.json") },
    validation: path.join(dir, "validation.json"),
    manifest: path.join(dir, "manifest.json"),
  };
}

// Bounded memory even for long recordings.
export const sha256File = (file) => {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = openSync(file, 'r');
  try {
    let bytes;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
    return hash.digest('hex');
  } finally { closeSync(fd); }
};

// { "<file name>": { sha256, bytes } } for every existing file in the set.
export function fingerprint(files) {
  const out = {};
  for (const file of Object.values(files)) {
    if (existsSync(file)) out[path.basename(file)] = { sha256: sha256File(file), bytes: statSync(file).size };
  }
  return out;
}
