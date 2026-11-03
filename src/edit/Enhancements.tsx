// Edit-file cues layered onto the captioned video, each timed to a spoken word:
// - broll: keynote cutaways placed over the picture (the voice keeps playing)
// - zooms: a slow push-in on the speaker for an emphasized phrase
// - sfx:   restrained sound effects under the voice (public/sfx/, pnpm sfx)
import { AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { brollDefaults, BrollScene, brollSchema } from "../broll/BrollScene";
import { broll } from "../design-system";
import { cutawayActive, cutawayFrames, zoomScaleAt } from "./timing";
import { AUDIO_STANDARD, sfxGain } from "../audio/standard";

export const brollCueSchema = brollSchema
  .pick({ variant: true, primary: true })
  .extend({
    atMs: z.number().nonnegative(),
    secondary: z.string().optional(),
    beforeLabel: z.string().optional(),
    afterLabel: z.string().optional(),
    holdMs: z.number().positive().optional(),
    startAt: z.number().int().min(1).max(99).optional(),
    // Why this cutaway exists: the words spoken while it shows.
    spoken: z.string().optional(),
  });

export const zoomSchema = z.object({
  atMs: z.number().nonnegative(),
  durationMs: z.number().positive(),
  scale: z.number().min(1).max(1.25),
  spoken: z.string().optional(),
});

export const sfxSchema = z.object({
  atMs: z.number().nonnegative(),
  sound: z.enum(["whoosh", "hit", "tick"]),
  volume: z.number().min(0).max(AUDIO_STANDARD.maxCueGain).optional(),
  spoken: z.string().optional(),
});

export type BrollCue = z.infer<typeof brollCueSchema>;
export type Zoom = z.infer<typeof zoomSchema>;
export type Sfx = z.infer<typeof sfxSchema>;

const ease = Easing.bezier(...broll.motion.ease);
const exitEase = Easing.bezier(...broll.motion.exitEase);

// The speaker's video, pushed in slowly during each zoom cue and eased back out.
export const ZoomedVideo: React.FC<{ src: string; zooms: Zoom[] }> = ({ src, zooms }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / fps) * 1000;
  const scale = zoomScaleAt(t, zooms, ease, exitEase);
  // Push toward the face: centered, a little above the middle.
  return (
    <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: "50% 40%" }}>
      <OffthreadVideo src={staticFile(src)} />
    </AbsoluteFill>
  );
};

// True while a cutaway covers the picture. Captions step aside then: the card
// already carries the spoken idea, and white captions on its white canvas
// would collide with it. The SRT keeps every word.
export const useCutawayActive = (cues: BrollCue[]) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return cutawayActive(frame, cues, fps, broll.timing);
};

export const BrollCutaways: React.FC<{ cues: BrollCue[] }> = ({ cues }) => {
  const { fps, width, height } = useVideoConfig();
  const ratio = width > height ? "16:9" : "9:16";
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={i} from={cutawayFrames(c, fps, broll.timing).from} durationInFrames={cutawayFrames(c, fps, broll.timing).duration} layout="none">
          <BrollScene {...brollDefaults} {...c} ratio={ratio} secondary={c.secondary ?? ""} beforeLabel={c.beforeLabel ?? brollDefaults.beforeLabel} afterLabel={c.afterLabel ?? brollDefaults.afterLabel} />
        </Sequence>
      ))}
    </>
  );
};

export const SoundEffects: React.FC<{ cues: Sfx[] }> = ({ cues }) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {cues.map((c, i) => (
        <Sequence key={i} from={Math.round((c.atMs / 1000) * fps)} layout="none">
          <Audio src={staticFile(`sfx/${c.sound}.wav`)} volume={sfxGain(c.sound, c.volume)} />
        </Sequence>
      ))}
    </>
  );
};
