// Converts whisper.cpp word-level JSON into @remotion/captions Caption[].
// Transcribe WITHOUT VAD (VAD remaps segment times and drifts word timing):
//   whisper-cli ... -l tl -mc 0 -nfa -dtw large.v3 -ml 1 -sow -oj -of <name>
//
// With --audio, word starts that fall inside a measured pause are moved to
// where speech resumes. Pauses are detected relative to the clip's own
// loudness (integrated LUFS - 12 dB, at least 0.6 s), so quiet and loud
// recordings behave the same.
//
// Usage: node scripts/whisper-to-captions.mjs <whisper.json> <captions.json> [--audio <file>]
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from 'node:path';
import { normalizeCaptionTimings } from '../src/captions/timing.ts';
import { ensureSafeOutput } from './lib/guard.mjs';

const args = process.argv.slice(2);
const positional=[],options={};let force=false;
for(let i=0;i<args.length;i++) {
  if(args[i]==='--force'){force=true;continue;}
  if(['--audio','--duration-ms'].includes(args[i])) {
    const flag=args[i];if(options[flag]!==undefined||!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing/duplicate value: ${flag}`);
    options[flag]=args[++i];continue;
  }
  if(args[i].startsWith('--'))throw new Error(`Unknown option: ${args[i]}`);
  positional.push(args[i]);
}
const [input, output]=positional,audio=options['--audio'];
if (!input || !output || positional.length!==2) {
  console.error("Usage: pnpm captions:from-whisper <whisper.json> <captions.json> [--audio file] [--duration-ms N] [--force]");
  process.exit(1);
}

// ffmpeg reports analysis filters on stderr.
const ffmpegStderr = (filter) => {
  const result=spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", audio, "-vn", "-af", filter, "-f", "null", "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if(result.error||result.status!==0)throw new Error(`Audio analysis failed: ${result.error?.message??result.stderr?.slice(-1000)}`);
  return result.stderr;
};

function detectPauses() {
  // The summary's integrated loudness is the last "I: ... LUFS" line.
  const match=[...ffmpegStderr("ebur128").matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  const integrated = Number(match?.[1]);
  if(!Number.isFinite(integrated))throw new Error('No finite audio loudness measurement; check the source.');
  const noise = (integrated - 12).toFixed(1);
  const sil = ffmpegStderr(`silencedetect=noise=${noise}dB:d=0.6`);
  const starts = [...sil.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  const ends = [...sil.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]) * 1000);
  return { integrated, noise, pauses: starts.map((s, i) => [s, Math.min(durationMs,ends[i]??durationMs)]) };
}

const { transcription } = JSON.parse(readFileSync(input, "utf8"));
if(!Array.isArray(transcription))throw new Error('Whisper transcription must be an array.');
ensureSafeOutput(output,{sources:[input,audio].filter(Boolean),force});
let captions = transcription
  .filter((seg) => seg.text.trim().length > 0)
  .map((seg) => ({
    // Leading space is how createTikTokStyleCaptions separates words.
    text: ` ${seg.text.trim()}`,
    startMs: seg.offsets.from,
    endMs: seg.offsets.to,
    timestampMs: Math.round((seg.offsets.from + seg.offsets.to) / 2),
    confidence: null,
  }));

const original=captions.map(word=>({...word}));
const supplied=options['--duration-ms']===undefined?undefined:Number(options['--duration-ms']);
if(supplied!==undefined&&(!Number.isFinite(supplied)||supplied<=0))throw new Error('duration-ms must be a positive finite number.');
let durationMs=supplied??transcription.reduce((maximum,segment)=>Number.isFinite(Number(segment.offsets?.to))?Math.max(maximum,Number(segment.offsets.to)):maximum,0);
let durationSource=supplied===undefined?'transcript-max-offset':'explicit';
if(audio) {
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','stream=codec_type,duration:format=duration','-of','json',audio],{encoding:'utf8'});
  if(probe.error||probe.status!==0)throw new Error(`Cannot measure transcript audio: ${probe.error?.message??probe.stderr}`);
  const meta=JSON.parse(probe.stdout),stream=meta.streams?.find(item=>item.codec_type==='audio');
  const measured=[stream?.duration,meta.format?.duration].map(Number).find(value=>Number.isFinite(value)&&value>0)*1000;
  if(!stream||!Number.isFinite(measured)||measured<=0)throw new Error('Transcript source needs readable audio with a positive duration.');
  if(supplied!==undefined&&Math.abs(supplied-measured)>1)throw new Error('Explicit duration differs from the measured audio duration.');
  durationMs=measured;durationSource='audio-probe';
}

let snapped = 0;
if (audio) {
  const { integrated, noise, pauses } = detectPauses();
  for (const [s, e] of pauses) {
    // Words starting inside the pause move to its end, keeping their order.
    const inside = captions.filter((c) => c.startMs > s + 40 && c.startMs < e - 100);
    inside.forEach((c, i) => {
      const shift = e + i * 60 - c.startMs;
      c.startMs += shift;
      c.endMs = Math.max(c.endMs, c.startMs + 120);
      c.timestampMs = Math.round((c.startMs + c.endMs) / 2);
      snapped++;
    });
  }
  console.log(`Audio ${integrated} LUFS; pauses below ${noise} dB: ${pauses.length}; words moved out of pauses: ${snapped}`);
}
captions=normalizeCaptionTimings(captions,durationMs).captions;
const timingRepairs=captions.flatMap((word,index)=>word.startMs===original[index].startMs&&word.endMs===original[index].endMs?[]:[{index,text:word.text,before:{startMs:original[index].startMs,endMs:original[index].endMs},after:{startMs:word.startMs,endMs:word.endMs},reason:'Bounded timing/pause repair; human synchronization review required.'}]);

// Machine transcripts always start unreviewed; rendering refuses them until
// the owner confirms the corrected text (scripts/mark-transcript-reviewed.mjs).
const file = {
  review: { status: "needs-review", reviewedBy: null, reviewedAt: null, timingRepairs },
  timingBounds: { durationMs:Math.floor(durationMs), source:durationSource },
  source: input,
  captions,
};
mkdirSync(path.dirname(path.resolve(output)),{recursive:true});
writeFileSync(output, JSON.stringify(file, null, 2));
console.log(`${captions.length} words -> ${output} (needs-review)`);
