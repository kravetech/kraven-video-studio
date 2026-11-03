import {renderOptions} from './lib/render-options.mjs';
// Makes the platform image for a video: grabs one frame from the clean source
// and renders it as the Instagram/Facebook cover (1080x1920 JPEG) or, with
// --thumbnail, the YouTube thumbnail (1280x720 JPEG). Refuses to overwrite an
// existing image unless --force.
//
// Usage:
//   pnpm cover <video> --title "ONE CLEAR IDEA" [--at 12.5] [--closeup] [--out <file.jpg>] [--force]
//   pnpm thumbnail <video> --title "ONE CLEAR IDEA" [--at 12.5] [--focus 0.4] [--out <file.jpg>] [--force]
// --closeup: the face fills the frame, so the cover title sits lower (below the chin).
// --focus: vertical focus of the thumbnail photo crop (0 top - 1 bottom).
// Default output: "<video dir>/<video name>-Cover.jpg" or "-Thumbnail.jpg" (the upload-package convention).
import {launchRenderJob, renderWorkspace} from './lib/render-workspace.mjs';
if (await launchRenderJob(import.meta.url, 'cover')) process.exit(process.exitCode ?? 0);
const workspace = renderWorkspace();
workspace.stageShared();
import { renderStill, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { ensureSafeOutput } from "./lib/guard.mjs";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
};
// Only these flags take a value; the video is the first other bare argument.
const VALUE_FLAGS = ["--title", "--at", "--out", "--focus"];
const video = args.find((a, i) => !a.startsWith("--") && !VALUE_FLAGS.includes(args[i - 1]));
const thumb = args.includes("--thumbnail");
const title = flag("title");
const at = flag("at") ?? "1";
const force = args.includes("--force");
if (!video || !title) {
  console.error('Usage: pnpm cover|thumbnail <video> --title "ONE CLEAR IDEA" [--at 12.5] [--closeup | --focus 0.4] [--out file.jpg] [--force]');
  process.exit(1);
}

const parsed = path.parse(path.resolve(video));
const out = path.resolve(flag("out") ?? path.join(parsed.dir, `${parsed.name}${thumb ? "-Thumbnail" : "-Cover"}.jpg`));
ensureSafeOutput(out, { sources: [video], force });
if (existsSync(out) && !force) {
  console.error(`Refusing to overwrite existing cover: ${out}\nPass --out <other.jpg> or --force.`);
  process.exit(1);
}

// Extract only one frame into the owned render job.
mkdirSync(path.join(workspace.publicDir, "samples"), { recursive: true });
const frameRel = `samples/.cover-frame-${randomUUID()}.png`;
const framePath = path.join(workspace.publicDir, frameRel);
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", at, "-i", path.resolve(video), "-frames:v", "1", framePath]);

try {
  const rendererOptions = await renderOptions();
const serveUrl = await workspace.bundle({
    entryPoint: path.resolve("src/index.ts"),
    webpackOverride: (config) => enableTailwind(config),
  });
  const inputProps = thumb
    ? { title, frameSrc: frameRel, focusY: parseFloat(flag("focus") ?? "0.4") }
    : { title, frameSrc: frameRel, framing: args.includes("--closeup") ? "closeup" : "standard" };
  const composition = await selectComposition({ ...rendererOptions,  serveUrl, id: thumb ? "YouTubeThumbnail" : "VideoCover", inputProps });
  await renderStill({ ...rendererOptions,  serveUrl, composition, inputProps, output: out, imageFormat: "jpeg", jpegQuality: 92 });
  console.log(`${thumb ? "Thumbnail" : "Cover"} written: ${out}`);
} finally {
  rmSync(framePath, { force: true });
}
