// House delivery profile for speech-led videos. Values apply equally to both
// orientations; effect gains are calibrated to the included sound assets.
export const AUDIO_STANDARD = Object.freeze({
  id: "speech-soft-v3",
  targetLufs: -16,
  toleranceLu: 1,
  masteringTruePeakDb: -1.5,
  maximumTruePeakDb: -1,
  loudnessRangeLu: 11,
  sampleRate: 48000,
  // Reviewed asset-specific amplitude defaults; final mix validation remains mandatory.
  sfx: Object.freeze({ whoosh: 3, hit: 1, tick: 1 }),
  // Per-cue amplitude ceiling; it is not a universal sound loudness target.
  maxCueGain: 4,
});

type Sound = keyof typeof AUDIO_STANDARD.sfx;
export function sfxGain(sound: Sound, override?: number): number {
  if (!Object.hasOwn(AUDIO_STANDARD.sfx, sound)) throw new Error(`Unknown sound: ${sound}`);
  const value = override ?? AUDIO_STANDARD.sfx[sound];
  if (!Number.isFinite(value) || value < 0 || value > AUDIO_STANDARD.maxCueGain) throw new Error(`Sound gain must be a finite value from 0 to ${AUDIO_STANDARD.maxCueGain}.`);
  return value;
}

type Measurement = { input_i: string; input_tp: string; input_lra: string; input_thresh: string; target_offset: string };
export function loudnormFilter(measured?: Measurement): string {
  const standard = AUDIO_STANDARD;
  const base = `loudnorm=I=${standard.targetLufs}:TP=${standard.masteringTruePeakDb}:LRA=${standard.loudnessRangeLu}`;
  if (!measured) return `${base}:print_format=json`;
  for (const key of ["input_i", "input_tp", "input_lra", "input_thresh", "target_offset"] as const) {
    if (!Number.isFinite(Number(measured[key]))) throw new Error(`Invalid loudness measurement: ${key}. Check the source audio.`);
  }
  return `${base}:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`;
}

export function audioChecks(integratedLufs: number, truePeakDb: number) {
  const standard = AUDIO_STANDARD;
  return {
    loudness: Number.isFinite(integratedLufs) && Math.abs(integratedLufs - standard.targetLufs) <= standard.toleranceLu,
    peak: Number.isFinite(truePeakDb) && truePeakDb <= standard.maximumTruePeakDb,
  };
}
