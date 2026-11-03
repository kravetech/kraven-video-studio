import { frameRate } from './lib/frame-rate.mjs';
import { primaryHashtag } from './lib/brand.mjs';
import { AUDIO_STANDARD, audioChecks } from '../src/audio/standard.ts';
import { analyzeCuts, requireCutQc } from './lib/cut-qc.mjs';
import { takeForEdit, checkEditorial } from './lib/editorial-review.mjs';
// Validates a finished delivery package without changing any delivered file:
// required files present; the video fully decodes at 1080x1920 with the
// master's frame rate and duration, final mixed sound against the house profile;
// the transcript's approval is current; the SRT matches the approved
// transcript byte for byte and ends inside the video; the cover and post are
// well formed. Writes validation.json (results and file hashes) for release.
//
// Usage: pnpm validate "<Edited/Video name>" --captions <captions.json>
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { REVIEW_MESSAGES, reviewState } from "../src/captions/review.ts";
import { DISCORD, fingerprint, packageFiles, packageProject } from "./lib/package.mjs";
import { captionsToSrt } from "./lib/srt.mjs";
import { snapshotFile, verifyRenderRecord } from './lib/render-record.mjs';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const capPath = opt("--captions");
if (!dir || !capPath) {
  console.error('Usage: pnpm validate "<Edited/Video name>" --captions <captions.json>');
  process.exit(2);
}

const pkg = packageFiles(dir);
const { profile } = pkg;
const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });
const probe = (file, entries) => JSON.parse(spawnSync("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "json", file], { encoding: "utf8" }).stdout || "{}");

// 1. Required files.
for (const [role, file] of Object.entries({ ...pkg.upload, ...pkg.records })) check(`file: ${role}`, existsSync(file), path.basename(file));

// 2. Video: format against the master's cut list, then a full decode.
const cuts = pkg.records.cuts && existsSync(pkg.records.cuts) ? JSON.parse(readFileSync(pkg.records.cuts, "utf8")) : null;
// Frame rate and master duration: the cut list for a cut video, the project
// file for a full-length edit.
const project = packageProject(dir);
const masterFps = cuts?.fps ?? project.fps ?? "60000/1001";
const masterSec = cuts?.masterDurationSec ?? project.masterDurationSec;
check('master: measured duration is required', Number.isFinite(masterSec) && masterSec > 0);
let inputs, renderRecord;
try {
  const record = verifyRenderRecord(pkg.upload.video, capPath, project.master);
  renderRecord=record;
  inputs = { ...record.inputs, source: snapshotFile(project.source) };
  check('render: video and current inputs match the render record', true);
} catch (error) { check('render: video and current inputs match the render record', false, error.message); }
let cutQc,takeReview,pacingReview;
if(pkg.records.cuts) {
  try {
    if(cuts?.source!==project.source)throw new Error('Cut list source differs from the project source.');
    cutQc=analyzeCuts(pkg.records.cuts,{reviewPath:project.cutReview});
    requireCutQc(cutQc);
    takeReview=takeForEdit({...cuts,segments:cuts.clips},{final:true});
    for(const [role,current] of Object.entries(takeReview.inputs))if(renderRecord?.inputs?.[role]?.sha256!==current.sha256)throw new Error(`Take review ${role} differs from the render. Render and validate again.`);
    for(const [role,current] of [['cutList',cutQc.cuts],['cutSource',cutQc.source],...(cutQc.review?[['cutReview',cutQc.review]]:[])]) {
      const rendered=renderRecord?.inputs?.[role];
      if(rendered?.sha256!==current.sha256||rendered?.bytes!==current.bytes)throw new Error(`Cut QC ${role} differs from the rendered input; render and validate again.`);
    }
    if(inputs) {inputs.cutList=cutQc.cuts;inputs.cutSource=cutQc.source;if(cutQc.review)inputs.cutReview=cutQc.review;}
    check('cut QC: current source and every declared edge analyzed or explicitly accounted for',true,`${cutQc.coverage.analyzed}/${cutQc.coverage.totalEdges} acoustically analyzed; file/contiguous boundaries reported separately`);
  } catch(error) {check('cut QC: current source and every declared edge analyzed or explicitly accounted for',false,error.message);}
}
try {
  if(!project.pacingReview||!project.pacingDecisions)throw new Error('Final pacing review and decisions are required. Run pnpm pacing:review on the rendered video.');
  pacingReview=checkEditorial(project.pacingReview,project.pacingDecisions,{kind:'pacing',final:true});
  if(pacingReview.inputs['pacing:video'].sha256!==snapshotFile(pkg.upload.video).sha256||pacingReview.inputs['pacing:captions'].sha256!==snapshotFile(capPath).sha256)throw new Error('Pacing review belongs to a different video or transcript.');
  if(renderRecord?.inputs?.edit&&pacingReview.inputs['pacing:edit']?.sha256!==renderRecord.inputs.edit.sha256)throw new Error('Pacing review must use the rendered edit/cue file.');
  if(inputs)Object.assign(inputs,pacingReview.inputs);
  check('pacing: current final video, resolved cases and complete visual review',true);
} catch(error){check('pacing: current final video, resolved cases and complete visual review',false,error.message);}
let videoSec = NaN;
if (existsSync(pkg.upload.video)) {
  const meta = probe(pkg.upload.video, "format=duration:stream=codec_type,width,height,r_frame_rate");
  const v = meta.streams?.find((s) => s.codec_type === "video");
  videoSec = parseFloat(meta.format?.duration);
  check(`video: ${profile.width}x${profile.height} (${profile.id})`, v?.width === profile.width && v?.height === profile.height, `${v?.width}x${v?.height}`);
  const fps = masterFps;
  check("video: frame rate matches the master", Math.abs(frameRate(v?.r_frame_rate) - frameRate(fps)) < 1e-8, `${v?.r_frame_rate} (master ${fps})`);
  // Against the measured master when the cut list records it (renders round
  // down to whole frames, so within one frame); older cut lists only have the
  // arithmetic sum, off by up to one frame per clip.
  const frame = 1 / frameRate(fps);
  if (masterSec) check("video: duration matches the master (within one frame)", Math.abs(videoSec - masterSec) <= frame + 0.005, `${videoSec.toFixed(3)} s (master ${masterSec} s)`);
  else if (cuts?.durationSec) check("video: duration matches the cut list (one frame per clip)", Math.abs(videoSec - cuts.durationSec) <= (cuts.clips.length + 1) * frame, `${videoSec.toFixed(3)} s (cut list ${cuts.durationSec} s, ${cuts.clips.length} clips)`);
  check("video: has sound", Boolean(meta.streams?.some((s) => s.codec_type === "audio")));
  const decode = spawnSync("ffmpeg", ["-v", "error", "-i", pkg.upload.video, "-f", "null", "-"], { encoding: "utf8" });
  check("video: decodes fully without errors", decode.status === 0 && !decode.stderr.trim(), decode.stderr.trim().split("\n")[0] ?? "");
  // Loudness (EBU R128) with true peak.
  const r = spawnSync("ffmpeg", ["-nostats", "-i", pkg.upload.video, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const summary = r.slice(r.lastIndexOf("Summary:"));
  const lufs = parseFloat(summary.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
  const peak = parseFloat(summary.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1]);
  const audio = audioChecks(lufs, peak);
  check(`audio: ${AUDIO_STANDARD.targetLufs} LUFS integrated (±${AUDIO_STANDARD.toleranceLu} LU)`, audio.loudness, `${lufs} LUFS`);
  check(`audio: true peak at or below ${AUDIO_STANDARD.maximumTruePeakDb} dBTP`, audio.peak, `${peak} dBTP`);
}

// 3. Transcript approval and SRT.
const file = JSON.parse(readFileSync(capPath, "utf8"));
const state = await reviewState(file);
check("transcript: approval matches its text and timing", state === "approved", state === "approved" ? `approved by ${file.review.reviewedBy}` : `${state}: ${REVIEW_MESSAGES[state]}`);
if (existsSync(pkg.upload.srt)) {
  // Either the plain export or the export clamped to this video's length.
  const delivered = readFileSync(pkg.upload.srt, "utf8");
  const plain = captionsToSrt(file.captions);
  const clamped = Number.isNaN(videoSec) ? plain : captionsToSrt(file.captions, { endMs: videoSec * 1000 });
  const match = delivered === clamped.srt ? clamped : delivered === plain.srt ? plain : null;
  check("srt: identical to the approved transcript's export", Boolean(match), match === clamped && clamped !== plain ? "clamped to the video's end" : "regenerated with the shared grouping");
  const lastEndMs = (match ?? plain).lastEndMs;
  // SRT times are in milliseconds and renders end on a frame, so allow one frame.
  const frame = 1 / frameRate(masterFps);
  if (!Number.isNaN(videoSec)) check("srt: last caption ends with the video (within one frame)", lastEndMs / 1000 <= videoSec + frame, `${(lastEndMs / 1000).toFixed(3)} s of ${videoSec.toFixed(3)} s`);
}

// 4. Cover and post.
if (existsSync(pkg.upload.cover)) {
  const c = probe(pkg.upload.cover, "stream=codec_name,width,height").streams?.[0];
  check(`cover: ${profile.cover.label}, JPEG ${profile.cover.width}x${profile.cover.height}`, c?.codec_name === "mjpeg" && c?.width === profile.cover.width && c?.height === profile.cover.height, `${c?.codec_name} ${c?.width}x${c?.height}`);
}
if (pkg.upload.post && existsSync(pkg.upload.post)) {
  const post = readFileSync(pkg.upload.post, "utf8");
  const blocks = post.trim().split(/\n\s*\n/);
  check("post: hook question first", blocks[0]?.trim().endsWith("?"));
  if (DISCORD) check("post: configured community line", blocks.includes(DISCORD));
  check("post: configured primary hashtag", blocks.at(-1)?.trim().split(/\s+/)[0] === primaryHashtag);
}

// Orientations without approved graphics never pass: their captions,
// callouts and cover are unapproved drafts.
check(`graphics: ${profile.id} design approved by the owner`, profile.graphicsApproved, profile.graphicsApproved ? "" : "16:9 captions, callouts and thumbnail still need design approval");

const passed = checks.every((c) => c.ok);
const result = {
  package: path.resolve(dir),
  checkedAt: new Date().toISOString(),
  captions: path.resolve(capPath),
  profile: profile.id,
  ...(cutQc?{cutQc}:{}),
  ...(takeReview?{takeReview}:{}),
  ...(pacingReview?{pacingReview}:{}),
  result: passed ? "pass" : "fail",
  checks,
  files: fingerprint({ ...pkg.upload, ...pkg.records }),
  inputs,
};
writeFileSync(pkg.validation, JSON.stringify(result, null, 2) + "\n");
for (const c of checks) console.log(`${c.ok ? "  ok  " : "  FAIL"}  ${c.name}${c.detail ? `  (${c.detail})` : ""}`);
console.log(`${passed ? "PASS" : "FAIL"}: ${checks.filter((c) => !c.ok).length} failed of ${checks.length}. Results -> ${pkg.validation}`);
process.exit(passed ? 0 : 1);
