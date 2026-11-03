// Shared frame arithmetic keeps cutaway visibility and caption suppression
// on exactly the same frames, including fractional frame rates.
type Cutaway = { atMs: number; holdMs?: number };
type ZoomCue = { atMs: number; durationMs: number; scale: number };
type SoundCue = { atMs: number; sound: "whoosh" | "hit" | "tick" };
type CardTiming = { inMs: number; holdMs: number; outMs: number };

export const soundDurationMs = { whoosh: 550, hit: 350, tick: 50 } as const;

export function cutawayFrames(cue: Cutaway, fps: number, timing: CardTiming) {
  return {
    from: Math.round((cue.atMs / 1000) * fps),
    duration: Math.ceil(((timing.inMs + (cue.holdMs ?? timing.holdMs) + timing.outMs) / 1000) * fps),
  };
}

export function cutawayActive(frame: number, cues: Cutaway[], fps: number, timing: CardTiming) {
  return cues.some(cue => {
    const { from, duration } = cutawayFrames(cue, fps, timing);
    return frame >= from && frame < from + duration;
  });
}

export function zoomScaleAt(timeMs: number, cues: ZoomCue[], ease: (value: number) => number, exitEase: (value: number) => number) {
  const cue = cues.find(cue => timeMs >= cue.atMs && timeMs < cue.atMs + cue.durationMs);
  if (!cue) return 1;
  const rampMs = Math.min(450, cue.durationMs / 2);
  const enter = ease(Math.min(1, (timeMs - cue.atMs) / rampMs));
  const exit = 1 - exitEase(Math.max(0, (timeMs - (cue.atMs + cue.durationMs - rampMs)) / rampMs));
  return 1 + (cue.scale - 1) * Math.min(enter, exit);
}

export function assertEnhancementTimeline(
  cues: { broll: Cutaway[]; zooms: ZoomCue[]; sfx: SoundCue[] },
  fps: number,
  durationInFrames: number,
  timing: CardTiming,
) {
  const check = (name: string, ranges: { from: number; duration: number }[], overlaps: boolean) => {
    const sorted = [...ranges].sort((a, b) => a.from - b.from);
    sorted.forEach((range, index) => {
      if (!Number.isFinite(range.from) || !Number.isFinite(range.duration) || range.from < 0 || range.duration < 1 || range.from + range.duration > durationInFrames) {
        throw new Error(`${name} cue ${index + 1} is outside the rendered video. Shorten or move the cue.`);
      }
      if (!overlaps && index > 0 && sorted[index - 1].from + sorted[index - 1].duration > range.from) {
        throw new Error(`${name} cues overlap. Schedule one ${name} at a time.`);
      }
    });
  };
  check("B-roll", cues.broll.map(cue => cutawayFrames(cue, fps, timing)), false);
  check("zoom", cues.zooms.map(cue => ({ from: Math.round(cue.atMs * fps / 1000), duration: Math.ceil(cue.durationMs * fps / 1000) })), false);
  check("sound", cues.sfx.map(cue => ({ from: Math.round(cue.atMs * fps / 1000), duration: Math.ceil(soundDurationMs[cue.sound] * fps / 1000) })), true);
}
