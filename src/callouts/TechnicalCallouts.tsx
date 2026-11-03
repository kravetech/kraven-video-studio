// Technical callouts (callouts.css): a visual definition shown when a concept
// is introduced, separate from the subtitles. Black and white; top-left above
// the speaker's head over a subtle top gradient.
import { fitText } from "@remotion/layout-utils";
import { useEffect, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { z } from "zod";
import { callout as co, font, fontsReady, VIDEO_DENSITY as D } from "../design-system";

export const calloutSchema = z.object({
  atMs: z.number().nonnegative(),
  // Optional longer hold; never shorter than --callout-hold-min.
  durationMs: z.number().positive().optional(),
  label: z.string().min(1),
  term: z.string().optional(),
  items: z.array(z.string()).max(4).optional(),
  // When each item is spoken; items appear in step with the speaker.
  itemsAtMs: z.array(z.number().nonnegative()).max(4).optional(),
  // Why this callout exists: the words that are spoken at atMs.
  spoken: z.string().optional(),
});

export type Callout = z.infer<typeof calloutSchema>;

const ease = Easing.bezier(...co.ease);

// On 16:9 the callout is a column beside the speaker, vertically centered over
// a left-side scrim; on 9:16 it sits top-left over a top scrim.
const CalloutBlock: React.FC<{ c: Callout; t: number; W: number; termSize: number; wide: boolean }> = ({ c, t, W, termSize, wide }) => {
  const until = c.atMs + Math.max(co.holdMinMs, c.durationMs ?? 0);
  const local = t - c.atMs;
  const enter = interpolate(local, [0, co.enterMs], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const exit = interpolate(t, [until - co.exitMs, until], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rule = interpolate(local, [co.enterMs * 0.4, co.enterMs * 0.4 + co.ruleDrawMs], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const opacity = enter * exit;

  return (
    <>
      {wide ? (
        <AbsoluteFill style={{ width: `${co.scrimWidth169 * 100}%`, background: co.scrim169, opacity }} />
      ) : (
        <AbsoluteFill style={{ height: `${co.scrimHeight * 100}%`, background: co.scrim, opacity }} />
      )}
      <div
        style={{
          position: "absolute",
          left: W * (wide ? co.marginX169 : co.marginX),
          top: wide ? "50%" : `${co.top * 100}%`,
          maxWidth: W * (wide ? co.maxWidth169 : co.maxWidth),
          opacity,
          transform: `translateY(calc(${wide ? "-50% + " : ""}${(1 - enter) * co.rise * D}px))`,
          color: co.fg,
          textShadow: co.textShadow,
        }}
      >
        <div style={{ fontFamily: font.mono, fontSize: co.labelSize * D, fontWeight: 500, letterSpacing: co.labelTracking, textTransform: "uppercase", color: co.labelFg }}>
          {c.label}
        </div>
        <div style={{ width: co.ruleWidth * D, height: D, background: co.ruleFg, margin: `${10 * D}px 0 ${12 * D}px`, transform: `scaleX(${rule})`, transformOrigin: "left" }} />
        {c.term ? (
          <div style={{ fontFamily: font.sans, fontSize: termSize, fontWeight: co.termWeight, letterSpacing: co.termTracking, lineHeight: 1.05, whiteSpace: "nowrap" }}>{c.term}</div>
        ) : null}
        {c.items ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 * D, fontFamily: font.sans, fontSize: co.itemSize * D, fontWeight: co.itemWeight, lineHeight: 1.1 }}>
            {c.items.map((item, i) => {
              // Items appear when spoken, or follow the divider in sequence.
              const appear = c.itemsAtMs?.[i] !== undefined ? c.itemsAtMs[i] - c.atMs : co.enterMs + i * 140;
              const k = interpolate(local, [appear, appear + co.enterMs], [0, 1], { easing: ease, extrapolateLeft: "clamp", extrapolateRight: "clamp" });
              return (
                <div key={i} style={{ opacity: k, transform: `translateY(${(1 - k) * co.rise * D}px)` }}>
                  {item}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );
};

export const TechnicalCallouts: React.FC<{ callouts: Callout[] }> = ({ callouts }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const wide = W > H;
  const t = (frame / fps) * 1000;
  const [sizes, setSizes] = useState<number[] | null>(null);
  const [handle] = useState(() => delayRender("Measuring callout terms"));

  // Terms shrink only when needed to fit the callout width.
  useEffect(() => {
    fontsReady.then(() => {
      setSizes(
        callouts.map((c) =>
          c.term
            ? Math.min(
                co.termSize * D,
                fitText({ text: c.term, withinWidth: W * (wide ? co.maxWidth169 : co.maxWidth), fontFamily: font.family, fontWeight: co.termWeight, letterSpacing: co.termTracking }).fontSize,
              )
            : co.termSize * D,
        ),
      );
      continueRender(handle);
    });
  }, [callouts, handle, W, wide]);

  if (!sizes) return null;
  return (
    <AbsoluteFill>
      {callouts.map((c, i) => {
        const until = c.atMs + Math.max(co.holdMinMs, c.durationMs ?? 0);
        return t >= c.atMs && t < until ? <CalloutBlock key={i} c={c} t={t} W={W} termSize={sizes[i]} wide={wide} /> : null;
      })}
    </AbsoluteFill>
  );
};
