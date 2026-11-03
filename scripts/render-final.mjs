import {renderOptions} from './lib/render-options.mjs';
// Renders the final captioned video through every guard: the output may not
// land in raw footage, overwrite an input, or replace a delivered file without
// --force; the frame rate is read from the master itself (never the 30 fps
// default); and the composition refuses a transcript whose approval does not
// match. Checks the result's size, frame rate and duration afterwards.
//
// Usage: pnpm render:final <master.mp4> <captions.json> --out "<Edited/Video name>/<Video name>.mp4" [--edit <edit.json>] [--force]
// Inputs may live in out/sources/ or legacy public/samples/. --frames 0-59 renders a
// test range only.
import {launchRenderJob, renderWorkspace} from './lib/render-workspace.mjs';
if (await launchRenderJob(import.meta.url, 'final')) process.exit(process.exitCode ?? 0);
const workspace = renderWorkspace();
workspace.stageShared();
import { renderMedia, selectComposition } from "@remotion/renderer";
import { enableTailwind } from "@remotion/tailwind-v4";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { ensureSafeOutput } from "./lib/guard.mjs";
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { analyzeCuts, requireCutQc } from './lib/cut-qc.mjs';
import { takeForEdit } from './lib/editorial-review.mjs';
import { frameRate } from './lib/frame-rate.mjs';
import { assertInputsCurrent, renderInputs, renderRecordPath, snapshotFile } from './lib/render-record.mjs';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const [master, captions] = args.filter((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const out = opt("--out");
if (!master || !captions || !out) {
  console.error('Usage: pnpm render:final <master.mp4> <captions.json> --out "<Edited/Video name>/<Video name>.mp4" [--edit <edit.json>] [--force]');
  process.exit(2);
}
const edit = opt("--edit");
ensureSafeOutput(out, { sources: [master, captions, edit].filter(Boolean), force: args.includes("--force") });
ensureSafeOutput(renderRecordPath(out), { sources: [master, captions, edit].filter(Boolean), force: args.includes('--force') });

// Provenance binds durable originals; only selected assets are staged.

const probe = (file) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,r_frame_rate:format=duration", "-of", "json", file], { encoding: "utf8" });
  const j = JSON.parse(r.stdout);
  return { ...j.streams[0], duration: parseFloat(j.format.duration) };
};
const src = probe(master);
const cutsPath=master.replace(/\.mp4$/i,'.cuts.json');
let cutQc,takeResult;
if(existsSync(cutsPath)) {
  cutQc=analyzeCuts(cutsPath,{reviewPath:opt('--cut-review')});
  requireCutQc(cutQc);
  const cuts=JSON.parse(readFileSync(cutsPath,'utf8'));
  takeResult=takeForEdit({...cuts,segments:cuts.clips},{final:true});
}
const fps = frameRate(src.r_frame_rate);
const inputs = renderInputs({ master, captions, edit });
if(takeResult)Object.assign(inputs,takeResult.inputs);
if(cutQc) {
  inputs.cutList=cutQc.cuts;
  inputs.cutSource=cutQc.source;
  if(cutQc.review)inputs.cutReview=cutQc.review;
}

for (const [role,input] of Object.entries(inputs)) {
  if (role.startsWith('sound:')) workspace.stageFile(input.path, `sfx/${role.slice(6)}.wav`);
}
const inputProps = {
  videoSrc: workspace.stageFile(path.resolve(master), 'samples/master.mp4'),
  captionsSrc: workspace.stageFile(path.resolve(captions), 'samples/captions.json'),
  ...(edit ? { calloutsSrc: workspace.stageFile(path.resolve(edit), 'samples/edit.json') } : {}),
  previewUnreviewed: false,
  fps,
};
const concurrency = opt('--concurrency') === undefined ? undefined : Number(opt('--concurrency'));
if (concurrency !== undefined && (!Number.isInteger(concurrency) || concurrency < 1)) throw new Error('Concurrency must be a positive integer.');
const rendererOptions = await renderOptions();
const serveUrl = await workspace.bundle({ entryPoint: path.resolve("src/index.ts"), webpackOverride: enableTailwind });
// selectComposition runs the approval check and throws on any mismatch.
const composition = await selectComposition({ ...rendererOptions,  serveUrl, id: "CaptionedClip", inputProps });
const range = opt("--frames")?.split("-").map(Number);
await renderMedia({ ...rendererOptions,  serveUrl, composition, inputProps, codec: "h264", crf: 16, outputLocation: out, ...(concurrency ? { concurrency } : {}), ...(range ? { frameRange: range } : {}) });

const got = probe(out);
const problems = [];
if (got.width !== src.width || got.height !== src.height) problems.push(`size ${got.width}x${got.height}, master ${src.width}x${src.height}`);
if (got.r_frame_rate !== src.r_frame_rate) problems.push(`frame rate ${got.r_frame_rate}, master ${src.r_frame_rate}`);
if (!range && Math.abs(got.duration - src.duration) > 1 / fps + 0.005) problems.push(`duration ${got.duration} s, master ${src.duration} s`);
if (problems.length) {
  console.error(`Rendered, but the result does not match the master: ${problems.join("; ")}.`);
  process.exit(1);
}
assertInputsCurrent(inputs);
if (!range) {
  const remotionVersion = JSON.parse((await import('node:fs')).readFileSync('package.json', 'utf8')).dependencies.remotion;
  writeFileSync(renderRecordPath(out), JSON.stringify({
    schemaVersion: 1, complete: true, renderedAt: new Date().toISOString(),
    inputs, output: snapshotFile(out), master: src,
    tools: { node: process.versions.node, remotion: remotionVersion,
      ffmpeg: spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).stdout?.split(/\r?\n/)[0] },
  }, null, 2) + '\n');
}
console.log(`Final render -> ${out} (${got.width}x${got.height}, ${got.r_frame_rate} fps, ${got.duration.toFixed(3)} s). Next: pnpm validate on the package.`);
