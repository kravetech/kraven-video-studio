// Talking-head captions (captions.css, revision 2, restored): white uppercase
// Geist Bold on the footage with a near-black box behind the spoken word.
// Words not yet highlighted carry a thin dark border and a dark halo.
import type { Caption } from "@remotion/captions";
import { useMemo } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { captions as cap, font, outerStroke, VIDEO_DENSITY as D } from "../design-system";
import { groupCaptions } from "./grouping";
import { profileForSize } from "../profiles";

// Trailing commas and periods dropped; ? and ! kept.
const display = (text: string, last: boolean) => (last ? text.trim().replace(/[.,]+$/, "") : text.trim());

export const TalkingHeadCaptions: React.FC<{ captions: Caption[] }> = ({ captions }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const t = (frame / fps) * 1000;
  const groups = useMemo(() => groupCaptions(captions, cap), [captions]);
  // 16:9 frames use the lower-third layout; 9:16 the vertical one.
  const wide = W > H;
  // Profiles without burned-in captions (YouTube long-form) deliver the SRT only.
  if (profileForSize(W, H)?.burnedCaptions === false) return null;

  const index = groups.findIndex((g, i) => {
    const nextStart = groups[i + 1]?.startMs ?? Infinity;
    return t >= g.startMs && t < Math.min(nextStart, g.endMs + cap.lingerMs);
  });
  if (index === -1) return null;
  const g = groups[index];

  const enter = interpolate(t - g.startMs, [0, cap.enterMs], [0, 1], {
    easing: Easing.bezier(...cap.ease),
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: H * (wide ? cap.bottom169 : cap.bottom916) }}>
      <div
        style={{
          maxWidth: W * (wide ? cap.maxWidth169 : cap.maxWidth916),
          opacity: enter,
          transform: `translateY(${(1 - enter) * cap.rise * D}px)`,
          fontFamily: font.sans,
          fontSize: (wide ? cap.size169 : cap.size) * D,
          fontWeight: cap.weight,
          letterSpacing: cap.tracking,
          lineHeight: cap.leading,
          textTransform: cap.transform as React.CSSProperties["textTransform"],
          textAlign: "center",
          color: cap.fg,
        }}
      >
        {g.words.map((w, i) => {
          const next = g.words[i + 1];
          // The box jumps to the spoken word instantly: no slide, scale, bounce or pop.
          const active = t >= w.startMs && t < (next ? next.startMs : w.endMs + cap.lingerMs);
          return (
            <span key={`${w.startMs}-${i}`}>
              {i > 0 ? " " : ""}
              <span
                style={
                  active
                    ? {
                        // Never break inside a word (Taglish hyphenation like "nag-follow").
                        whiteSpace: "nowrap",
                        background: cap.activeBg,
                        borderRadius: cap.activeRadius * D,
                        // Padding is cancelled by negative margin so words never shift.
                        padding: `${cap.activePadY} ${cap.activePadX}`,
                        margin: `0 calc(-1 * ${cap.activePadX})`,
                        boxDecorationBreak: "clone",
                        WebkitBoxDecorationBreak: "clone",
                      }
                    : { whiteSpace: "nowrap", textShadow: cap.textShadow, ...outerStroke(cap.strokeWidth * D, cap.strokeColor) }
                }
              >
                {display(w.text, i === g.words.length - 1)}
              </span>
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
