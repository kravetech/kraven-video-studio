import { zColor } from "@remotion/zod-types";
import type { CalculateMetadataFunction } from "remotion";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { broll, font, formats } from "../design-system";
import { phase, type Timeline } from "./engine";
import { SCENES } from "./scenes";
import type { SceneContext } from "./types";
import { assertCardTiming } from "./validation";

export const brollSchema = z.object({
  variant: z.enum([
    "keyword",
    "phrase",
    "number",
    "beforeAfter",
    "problemSolution",
    "mythReality",
    "steps",
    "stat",
    "quote",
    "warning",
    "aiWorkflow",
    "humanReview",
  ]),
  ratio: z.enum(["9:16", "16:9"]),
  // Wording rule: primary 1-5 words, supporting 0-8 words.
  primary: z.string().min(1),
  secondary: z.string(),
  beforeLabel: z.string(),
  afterLabel: z.string(),
  accent: zColor(),
  bg: zColor(),
  // Overrides the design-system hold so a cutaway can match the spoken beat.
  holdMs: z.number().positive().optional(),
  // Steps cards: number of the first step, so a list split over several
  // cards keeps counting (1-3, 4-6, ...). Defaults to 1.
  startAt: z.number().int().min(1).max(99).optional(),
  // Match the edited video's frame rate so cutaways move as smoothly as the
  // footage around them. Defaults to the 59.94 fps masters.
  fps: z.number().min(1).max(240).optional(),
  showSafeArea: z.boolean(),
});

export type BrollProps = z.infer<typeof brollSchema>;

export const brollDefaults: BrollProps = {
  variant: "keyword",
  ratio: "9:16",
  primary: "OVERENGINEERING",
  secondary: "",
  beforeLabel: "Before",
  afterLabel: "After",
  accent: broll.color.accent,
  bg: broll.color.bg,
  showSafeArea: false,
};

const timelineFor = (props: BrollProps): Timeline => ({
  inMs: broll.timing.inMs,
  holdMs: props.holdMs ?? broll.timing.holdMs,
  outMs: broll.timing.outMs,
});

const BROLL_FPS = 60000 / 1001;

// One pass of entrance -> hold -> exit (the design-system preview loops).
export const calculateBrollMetadata: CalculateMetadataFunction<BrollProps> = ({ props }) => {
  assertCardTiming(props, broll.timing, broll.motion.clock);
  const f = props.ratio === "9:16" ? formats.vertical : formats.landscape;
  const tl = timelineFor(props);
  const fps = props.fps ?? BROLL_FPS;
  return {
    width: f.width,
    height: f.height,
    fps,
    durationInFrames: Math.ceil(((tl.inMs + tl.holdMs + tl.outMs) / 1000) * fps),
  };
};

export const BrollScene: React.FC<BrollProps> = (props) => {
  assertCardTiming(props, broll.timing, broll.motion.clock);
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const is916 = props.ratio === "9:16";
  const layout = is916 ? broll.layout.vertical : broll.layout.landscape;
  const u = (H / 100) * layout.scale;
  const t = (frame / fps) * 1000;
  const tl = timelineFor(props);
  const ph = phase(t, tl);
  // Keynote motion: slow push-in across the whole card (--broll-push).
  const total = tl.inMs + tl.holdMs + tl.outMs;
  const push = 1 + broll.motion.push * Math.min(1, t / total);
  const safe = is916 ? broll.safe.vertical : broll.safe.landscape;
  const safeX = safe.x * W;
  const safeY = safe.y * H;

  const ctx: SceneContext = {
    p: props.primary,
    s: props.secondary,
    beforeLabel: props.beforeLabel,
    afterLabel: props.afterLabel,
    startAt: props.startAt ?? 1,
    accent: props.accent,
    accentSoft: broll.color.accentSoft,
    is916,
    center: layout.center,
    W,
    H,
    u,
    // Scene clock runs slower (--broll-clock) so every inner reveal, line draw
    // and count-up stretches in proportion. Scene timings were authored against
    // a 320 ms entrance, so inMs is expressed on that clock.
    t: t / broll.motion.clock,
    availW: W - safeX * 2,
    inMs: tl.inMs / broll.motion.clock,
  };

  return (
    <AbsoluteFill style={{ background: props.bg, overflow: "hidden", fontFamily: font.sans }}>
      {props.showSafeArea ? (
        <div style={{ position: "absolute", left: safeX, top: safeY, right: safeX, bottom: safeY, border: `2px dashed ${props.accent}55`, borderRadius: 8 }} />
      ) : null}
      <div
        style={{
          position: "absolute",
          left: safeX,
          top: safeY,
          width: W - safeX * 2,
          height: H - safeY * 2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: layout.center ? "center" : "flex-start",
          opacity: ph.exit,
          // Exit fades, softens (--broll-exit-blur) and drifts up.
          filter: `blur(${(1 - ph.exit) * H * broll.motion.exitBlur}px)`,
          transform: `translateY(${(1 - ph.enter) * H * broll.motion.rise - (1 - ph.exit) * H * broll.motion.rise * 0.6}px) scale(${push})`,
          transformOrigin: layout.center ? "center" : "left center",
        }}
      >
        {SCENES[props.variant](ctx)}
      </div>
    </AbsoluteFill>
  );
};
