import { outputFrameRate } from './frame-rate.mjs';
// Checks an edit job before any rendering: tools present, source readable
// with picture and sound, cut ranges valid, and outputs safe to write.
// Returns { errors, warnings, info }; any error stops the job.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { profileFor } from "../../src/profiles.ts";
import { assertSafeOutput } from "./guard.mjs";

// Scales a source into the profile's frame without distortion. "fill" covers
// the frame and crops at anchor x/y (0-1, default centered); "fit" shows the
// whole picture with black bars.
export function framingFilter(W, H, framing = {}) {
  if (framing.mode === "fit") return `scale=${W}:${H}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`;
  const x = framing.x ?? 0.5;
  const y = framing.y ?? 0.5;
  return `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${W}:${H}:(iw-${W})*${x}:(ih-${H})*${y}`;
}

const WHISPER = {
  'whisper-cli': process.env.WHISPER_CLI ?? '',
  'large-v3 model': process.env.WHISPER_MODEL ?? '',
};

const runs = (cmd) => spawnSync(cmd, ["-version"], { encoding: "utf8" }).status === 0;

export function preflight(edit, { editPath, outPath, force = false } = {}) {
  const errors = [];
  const warnings = [];
  const info = [];
  let fps;

  // Node 24 is the tested runtime for direct TypeScript imports.
  for (const tool of ["ffmpeg", "ffprobe"]) if (!runs(tool)) errors.push(`${tool} not found on PATH`);
  const [major] = process.versions.node.split(".").map(Number);
  if (major !== 24) errors.push(`Node ${process.versions.node} is unsupported; use the tested Node 24 runtime`);
  // Transcription tools are needed for the verify step, not for assembly.
  for (const [name, file] of Object.entries(WHISPER)) if (!existsSync(file)) warnings.push(`${name} missing (${file}); transcription and verify-cut will not run`);

  // Output profile and framing.
  let profile;
  try {
    profile = profileFor(edit.profile);
    info.push(`profile ${profile.id} (${profile.width}x${profile.height})`);
  } catch (e) {
    errors.push(e.message);
    return { errors, warnings, info };
  }
  const framing = edit.framing;
  if (framing && !["fill", "fit"].includes(framing.mode)) errors.push(`framing.mode must be "fill" or "fit", not "${framing.mode}"`);
  for (const k of ["x", "y"]) if (framing?.[k] !== undefined && !(framing[k] >= 0 && framing[k] <= 1)) errors.push(`framing.${k} must be between 0 and 1`);
  if (!profile.graphicsApproved) warnings.push(`${profile.id} captions, callouts and the ${profile.cover.label} are not designed yet; final renders stay labeled previews`);

  // Source media.
  const src = edit.source;
  if (!src || !existsSync(src)) {
    errors.push(`source not found: ${src}`);
    return { errors, warnings, info };
  }
  const probe = spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height,r_frame_rate:stream_side_data=rotation:stream_tags=rotate", "-of", "json", src], { encoding: "utf8" });
  if (probe.status !== 0) {
    errors.push(`source unreadable: ${probe.stderr.trim()}`);
    return { errors, warnings, info };
  }
  const meta = JSON.parse(probe.stdout);
  const video = meta.streams.find((s) => s.codec_type === "video");
  const audio = meta.streams.find((s) => s.codec_type === "audio");
  const duration = parseFloat(meta.format.duration);
  if (!video) errors.push("source has no video stream");
  if (!audio) errors.push("source has no audio stream");
  if (video) {
    // Phone footage is often stored landscape with a rotation flag; ffmpeg
    // applies it on decode, so judge orientation as displayed.
    const rotation = Math.abs(Number(video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0)) % 180;
    const [w, h] = rotation === 90 ? [video.height, video.width] : [video.width, video.height];
    info.push(`source ${w}x${h} as displayed${rotation === 90 ? ` (stored ${video.width}x${video.height}, rotated)` : ""}, ${video.r_frame_rate} fps, ${duration.toFixed(1)} s`);
    // A source in the other orientation needs an explicit, reviewed framing:
    // fill crops most of the picture away, fit adds bars.
    const orientation = w > h ? "horizontal" : "vertical";
    if (orientation !== profile.orientation) {
      if (!framing?.mode) errors.push(`source is ${orientation} (${w}x${h}) but the profile is ${profile.id}; set "framing": { "mode": "fill", "x": 0.5 } (crop, review the anchor) or { "mode": "fit" } (bars)`);
      else warnings.push(`${orientation} source into ${profile.id} with framing "${framing.mode}"; review the framing on a preview`);
    } else if (Math.abs(w / h - profile.width / profile.height) > 0.01) {
      warnings.push(`source aspect ${(w / h).toFixed(3)} differs from ${profile.id} (${(profile.width / profile.height).toFixed(3)}); ${framing?.mode === "fit" ? "bars will be added" : "edges will be cropped"}`);
    }
    try { fps = outputFrameRate(video.r_frame_rate, edit); }
    catch (error) { errors.push(error.message); }
  }

  // Cut ranges.
  const segs = edit.segments ?? [];
  if (!segs.length) errors.push("edit has no segments");
  segs.forEach((s, i) => {
    const name = `segment ${i + 1} (${s.label ?? "unlabeled"})`;
    if (!(s.in >= 0) || !(s.out > s.in)) errors.push(`${name}: in ${s.in} / out ${s.out} is not a valid range`);
    else if (s.out > duration) errors.push(`${name}: out ${s.out} is past the end of the source (${duration.toFixed(2)} s)`);
    else if (s.out - s.in < 0.25) errors.push(`${name}: shorter than 0.25 s`);
    if (!s.words?.trim()) errors.push(`${name}: planned words are empty, so the cut cannot be verified`);
  });
  // The same source range used twice repeats speech; usually a typo.
  segs.forEach((a, i) =>
    segs.slice(i + 1).forEach((b, k) => {
      if (a.in < b.out && b.in < a.out) warnings.push(`segments ${i + 1} and ${i + k + 2} overlap in the source; confirm the repeat is intended`);
    }),
  );

  // Outputs.
  if (outPath) {
    const base = outPath.replace(/[.]mp4$/i, "");
    for (const out of [outPath, `${base}.edl`, `${base}.cuts.json`]) {
      try {
        assertSafeOutput(out, { sources: [src, editPath].filter(Boolean), force });
      } catch (e) {
        errors.push(e.message);
      }
    }
  }
  return { errors, warnings, info, fps };
}

export function report({ errors, warnings, info }) {
  for (const line of info) console.log(`  ${line}`);
  for (const line of warnings) console.log(`  WARN  ${line}`);
  for (const line of errors) console.log(`  FAIL  ${line}`);
  console.log(errors.length ? `Preflight failed: ${errors.length} error(s).` : "Preflight passed.");
  return errors.length === 0;
}
