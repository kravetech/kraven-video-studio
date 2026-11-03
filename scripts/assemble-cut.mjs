import { frameRate } from './lib/frame-rate.mjs';
import { AUDIO_STANDARD, loudnormFilter } from '../src/audio/standard.ts';
import { analyzeCuts } from './lib/cut-qc.mjs';
import { ensureSafeOutput } from './lib/guard.mjs';
import { takeForEdit, assertCurrent } from './lib/editorial-review.mjs';
// Assembles a profile-sized master from a raw recording and an edit file:
// cuts snapped to the quietest nearby audio, internal pauses tightened into
// natural jump cuts (alternating a subtle punch-in to hide them), global color
// correction, and a gentle voice chain. Writes the master, the refined cut
// list, and a CMX3600 EDL. The raw file is only read, never modified.
//
// Usage: node scripts/assemble-cut.mjs <edit.json> <out.mp4> [--force]
// Edit file: see docs/WORKFLOW.md.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { profileFor } from "../src/profiles.ts";
import { framingFilter, preflight, report } from "./lib/preflight.mjs";

const args = process.argv.slice(2);
const [editPath, outPath] = args.filter((a) => !a.startsWith("--"));
if (!editPath || !outPath) {
  console.error("Usage: node scripts/assemble-cut.mjs <edit.json> <out.mp4> [--force]");
  process.exit(1);
}
const edit = JSON.parse(readFileSync(editPath, "utf8"));
const src = edit.source;
// Preflight: tools, readable source with picture and sound, valid cut ranges,
// and outputs that never land on raw footage, an input or a delivered file.
console.log("Preflight:");
const inspected = preflight(edit, { editPath, outPath, force: args.includes("--force") });
if (!report(inspected)) process.exit(1);
const takeResult=takeForEdit(edit);
// Output size comes from the edit's profile (default vertical-1080).
const profile = profileFor(edit.profile);
const W = profile.width;
const H = profile.height;
const FPS = inspected.fps;
const fpsNum = frameRate(FPS);
const pause = { minMs: 350, keepMs: 120, ...edit.pauses };

const run = (args, opts = {}) => {
  const r = spawnSync("ffmpeg", args, { encoding: opts.binary ? "buffer" : "utf8", maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg failed:\n${(opts.binary ? r.stderr.toString() : r.stderr).slice(-3000)}`);
  return r;
};

// ---- Audio envelope: RMS per 10 ms of the source -------------------------
const pcm = run(["-v", "error", "-i", src, "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "-"], { binary: true }).stdout;
const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 2));
const env = [];
for (let i = 0; i + 160 <= samples.length; i += 160) {
  let s = 0;
  for (let j = i; j < i + 160; j++) s += samples[j] * samples[j];
  env.push(10 * Math.log10(s / 160 / (32768 * 32768) + 1e-12));
}
// 100 ms smoothed level for pause detection: room tone and breaths keep the
// raw 10 ms level spiky, which would break real pauses into fragments.
const smooth = env.map((_, i) => {
  let p = 0;
  for (let k = -5; k < 5; k++) p += Math.pow(10, (env[i + k] ?? -90) / 10);
  return 10 * Math.log10(p / 10);
});
const sorted = [...smooth].sort((a, b) => a - b);
// Speaking level = 70th percentile of the recording; a pause is 9 dB below it.
const silentDb = sorted[Math.floor(sorted.length * 0.7)] - 9;
const idx = (sec) => Math.max(0, Math.min(env.length - 1, Math.round(sec * 100)));
const at = (sec) => env[idx(sec)];
const level = (sec) => smooth[idx(sec)];

// Snap a cut to the quietest 10 ms inside [sec - before, sec + after].
const snap = (sec, before, after) => {
  let best = sec;
  for (let t = sec - before; t <= sec + after; t += 0.01) if (at(t) < at(best)) best = t;
  return +best.toFixed(3);
};

// ---- Build sub-clips ------------------------------------------------------
const clips = [];
for (const seg of edit.segments) {
  // Snap windows [before, after] in seconds; narrow them where a neighbouring
  // word sits close to the cut so it cannot leak in.
  const [inBefore, inAfter] = seg.snapIn ?? [0.2, 0.12];
  const [outBefore, outAfter] = seg.snapOut ?? [0.12, 0.25];
  const inS = snap(seg.in, inBefore, inAfter);
  const outS = snap(seg.out, outBefore, outAfter);
  // Find silent runs inside the segment. A breath or click under 200 ms
  // between two quiet runs belongs to the same hesitation, so runs are merged
  // across such blips before deciding what to tighten.
  // The threshold also follows this segment's own speaking level, so quietly
  // spoken words are never mistaken for silence.
  const segLevels = [];
  for (let t = inS; t < outS; t += 0.01) segLevels.push(level(t));
  segLevels.sort((a, b) => a - b);
  const segSilentDb = Math.min(silentDb, segLevels[Math.floor(segLevels.length * 0.7)] - 9);
  const runs = [];
  let runStart = null;
  for (let t = inS + 0.15; t < outS - 0.15; t += 0.01) {
    const quiet = level(t) < segSilentDb;
    if (quiet && runStart === null) runStart = t;
    if ((!quiet || t + 0.01 >= outS - 0.15) && runStart !== null) {
      const last = runs[runs.length - 1];
      if (last && runStart - last[1] < 0.2) last[1] = t;
      else runs.push([runStart, t]);
      runStart = null;
    }
  }
  const cuts =
    seg.tighten === false
      ? []
      : runs.filter(([a, b]) => (b - a) * 1000 >= pause.minMs).map(([a, b]) => [a + pause.keepMs / 1000, b - pause.keepMs / 1000]);
  // Keep only cuts that leave every piece at least minPieceSec long (a whole
  // short word); a shorter piece would read as a glitch, so that pause stays in.
  const minPieceSec = 0.25;
  const kept = [];
  let start = inS;
  cuts.forEach(([a, b], i) => {
    const nextStart = cuts[i + 1]?.[0] ?? outS;
    if (a - start >= minPieceSec && nextStart - b >= minPieceSec) {
      kept.push([a, b]);
      start = b;
    }
  });
  // Switch the punch-in only onto pieces long enough to settle (>= 1.2 s);
  // short pieces keep the previous framing so zoom never flickers.
  const base = seg.zoom ?? 1;
  const alt = seg.punch ?? 1.1;
  let zoom = base;
  let from = inS;
  [...kept, [outS, null]].forEach(([a, b], i) => {
    if (i > 0 && seg.alternate && a - from >= 1.2) zoom = zoom === base ? alt : base;
    clips.push({ label: seg.label, in: +from.toFixed(3), out: +a.toFixed(3), zoom });
    from = b;
  });
}

// ---- Render ---------------------------------------------------------------
mkdirSync(path.dirname(outPath), { recursive: true });
const tmpDir = mkdtempSync(path.join(path.dirname(path.resolve(outPath)), ".assemble-"));
try {
const inputs = [];
const parts = [];
clips.forEach((c, i) => {
  inputs.push("-ss", String(c.in), "-t", String(+(c.out - c.in).toFixed(3)), "-i", src);
  const z = c.zoom;
  const cropW = Math.round(W / z / 2) * 2;
  const cropH = Math.round(H / z / 2) * 2;
  // Punch-ins keep the face in frame: centered horizontally, biased upward.
  const crop = z === 1 ? "" : `,crop=${cropW}:${cropH}:${(W - cropW) / 2}:${Math.round((H - cropH) * (edit.punchY ?? 0.38))},scale=${W}:${H}:flags=lanczos`;
  // Aspect ratio is always preserved: fill (crop at the framing anchor) or fit
  // (letterbox). Never a plain scale, which would stretch other shapes.
  parts.push(`[${i}:v]${framingFilter(W, H, edit.framing)}${crop},fps=${FPS},setsar=1,setpts=PTS-STARTPTS[v${i}]`);
  const d = +(c.out - c.in).toFixed(3);
  // The last word fades out softly (tail.fadeMs) instead of a click-proof 12 ms cut.
  const outFade = i === clips.length - 1 && edit.tail?.fadeMs ? edit.tail.fadeMs / 1000 : 0.012;
  parts.push(`[${i}:a]aresample=48000,asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, d - outFade)}:d=${outFade}[a${i}]`);
});
const concatIn = clips.map((_, i) => `[v${i}][a${i}]`).join("");
const color = edit.color ?? "null";
const voice = edit.voice ?? "anull";
// Ending tail: hold the final frame in silence so the video lands instead of
// cutting out the instant the last word ends.
const hold = edit.tail?.holdSec ?? 0;
const tailV = hold ? `,tpad=stop_mode=clone:stop_duration=${hold}` : "";
const tailA = hold ? `,apad=pad_dur=${hold}` : "";
parts.push(`${concatIn}concat=n=${clips.length}:v=1:a=1[vc][ac]`, `[vc]${color}${tailV},format=yuv420p[vout]`, `[ac]${voice}${tailA}[aout]`);
const stage1 = path.join(tmpDir, "stage1.mp4");
run(["-v", "error", "-y", ...inputs, "-filter_complex", parts.join(";"), "-map", "[vout]", "-map", "[aout]",
  "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-c:a", "pcm_s16le", "-movflags", "+faststart", stage1.replace(/\.mp4$/, ".mov")]);

// Two-pass voice normalization uses the same house profile as final validation.
const m = run(["-hide_banner", "-i", stage1.replace(/\.mp4$/, ".mov"), "-af", loudnormFilter(), "-f", "null", "-"]).stderr;
const j = JSON.parse(m.slice(m.lastIndexOf("{"), m.lastIndexOf("}") + 1));
run(["-v", "error", "-y", "-i", stage1.replace(/\.mp4$/, ".mov"), "-c:v", "copy",
  "-af", loudnormFilter(j),
  "-c:a", "aac", "-b:a", "192k", "-ar", String(AUDIO_STANDARD.sampleRate), "-movflags", "+faststart", outPath]);

// ---- Records: refined cut list and CMX3600 EDL -----------------------------
const tc = (sec) => {
  const f = Math.round(sec * fpsNum);
  const base = Math.round(fpsNum);
  const p = (n) => String(n).padStart(2, "0");
  return `${p(Math.floor(f / (base * 3600)))}:${p(Math.floor(f / (base * 60)) % 60)}:${p(Math.floor(f / base) % 60)}:${p(f % base)}`;
};
let rec = 0;
const edl = [`TITLE: ${edit.title ?? path.basename(outPath)}`, "FCM: NON-DROP FRAME", ""];
clips.forEach((c, i) => {
  const d = c.out - c.in;
  edl.push(`${String(i + 1).padStart(3, "0")}  AX       AA/V  C        ${tc(c.in)} ${tc(c.out)} ${tc(rec)} ${tc(rec + d)}`);
  edl.push(`* FROM CLIP NAME: ${path.basename(src)}`, `* ${c.label}${c.zoom !== 1 ? ` (punch-in ${Math.round((c.zoom - 1) * 100)}%)` : ""}`, "");
  rec += d;
});
const base = outPath.replace(/\.mp4$/i, "");
writeFileSync(`${base}.edl`, edl.join("\n"));
// The measured master duration: per-clip frame rounding makes it differ from
// the arithmetic sum, and package validation checks the final against it.
const masterDurationSec = +parseFloat(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", outPath], { encoding: "utf8" }).stdout).toFixed(3);
assertCurrent(takeResult.inputs);
writeFileSync(`${base}.cuts.json`, JSON.stringify({ source: src, takeReview:edit.takeReview, takeDecisions:edit.takeDecisions, fps: FPS, silentDb: +silentDb.toFixed(1), clips, tailHoldSec: hold, durationSec: +(rec + hold).toFixed(3), masterDurationSec }, null, 2));
const qc=analyzeCuts(`${base}.cuts.json`,{reviewPath:edit.cutReview});
ensureSafeOutput(`${base}.cut-qc.json`,{sources:[src,editPath,`${base}.cuts.json`,edit.cutReview].filter(Boolean),force:args.includes('--force')});
writeFileSync(`${base}.cut-qc.json`,JSON.stringify(qc,null,2)+'\n');
console.log(`Cut QC: ${qc.status}; ${qc.coverage.analyzed}/${qc.coverage.totalEdges} edges analyzed, ${qc.coverage.sourceBoundaries} file boundaries, ${qc.coverage.contiguous} contiguous edges.`);
if(qc.status!=='pass') {console.error(`Master retained for preview. Correct/listen to ${qc.unresolved.join(', ')} and rerun cut QC. No automatic listening approval.`);process.exitCode=1;}
console.log(`${clips.length} clips, ${rec.toFixed(1)} s -> ${outPath} (loudness ${j.input_i} -> ${AUDIO_STANDARD.targetLufs} LUFS; pause threshold ${silentDb.toFixed(1)} dB)`);
} finally {
  // Only this invocation's exact mkdtemp directory is removed.
  const parent = path.dirname(path.resolve(outPath));
  if (path.dirname(tmpDir) !== parent || !path.basename(tmpDir).startsWith('.assemble-')) throw new Error('Unsafe temporary cleanup path.');
  rmSync(tmpDir, { recursive: true, force: true });
}
