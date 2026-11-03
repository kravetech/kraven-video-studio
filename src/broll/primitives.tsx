import type { CSSProperties } from "react";
import { broll, font } from "../design-system";
import { ease, fitByWord } from "./engine";
import type { SceneContext } from "./types";
import { build } from "./validation";

type MaskRevealProps = {
  text: string;
  size: number;
  weight: number;
  color: string;
  tracking: string;
  t: number;
  delay?: number;
  stagger?: number;
  dur?: number;
  align?: "center" | "left";
  lh?: number;
  style?: CSSProperties;
};

// Word-by-word reveal (keynote look): each word rises a little and resolves
// from a soft blur (--broll-word-rise, --broll-word-blur).
export const MaskReveal: React.FC<MaskRevealProps> = ({
  text, size, weight, color, tracking, t, delay = 0, stagger = build.wordStagger, dur = build.wordDuration, align = "center", lh = 1.02, style,
}) => {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: `0 ${size * 0.26}px`, justifyContent: align === "center" ? "center" : "flex-start", ...style }}>
      {words.map((w, i) => {
        const k = ease((t - delay - i * stagger) / dur);
        return (
          <span
            key={i}
            style={{
              display: "inline-block",
              fontSize: size,
              fontWeight: weight,
              color,
              letterSpacing: tracking,
              lineHeight: lh,
              paddingBottom: size * 0.06,
              transform: `translateY(${(1 - k) * broll.motion.wordRise}%)`,
              filter: `blur(${(1 - k) * size * broll.motion.wordBlurEm}px)`,
              opacity: k,
            }}
          >
            {w}
          </span>
        );
      })}
    </span>
  );
};

export type IconName = "check" | "cross" | "arrow" | "warn" | "user" | "spark" | "bolt";

// Minimal stroke icons that draw on with progress k.
export const Icon: React.FC<{ name: IconName; s: number; c: string; sw: number; k: number }> = ({ name, s, c, sw, k }) => {
  const common = {
    width: s,
    height: s,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: c,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    style: { strokeDasharray: 60, strokeDashoffset: (1 - ease(k)) * 60 },
  };
  switch (name) {
    case "check":
      return <svg {...common}><path d="M4 12.5l5 5L20 6" /></svg>;
    case "cross":
      return <svg {...common}><path d="M6 6l12 12M18 6L6 18" /></svg>;
    case "arrow":
      return <svg {...common}><path d="M4 12h15M13 6l6 6-6 6" /></svg>;
    case "warn":
      return (
        <svg {...common}>
          <path d="M12 3L2 20h20L12 3z" />
          <path d="M12 10v4" />
          <circle cx={12} cy={17} r={0.6} fill={c} stroke={c} />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx={12} cy={8} r={4} />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
      );
    case "spark":
      return <svg {...common}><path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" /></svg>;
    case "bolt":
      return <svg {...common}><path d="M13 3L4 14h6l-1 7 9-11h-6l1-7z" /></svg>;
  }
};

// Mono metadata label (overline).
export const Overline: React.FC<{ text: string; ctx: SceneContext; color?: string }> = ({ text, ctx, color }) => (
  <div
    style={{
      fontFamily: font.mono,
      fontSize: label(ctx),
      fontWeight: 500,
      letterSpacing: "0.16em",
      textTransform: "uppercase",
      color: color ?? broll.color.fg3,
    }}
  >
    {text}
  </div>
);

// Sizes in u (1% of canvas height) satisfy the %-of-height type rules.
export const big = (ctx: SceneContext) => fitByWord(ctx.p, 12 * ctx.u, ctx.availW, 0.64);
export const support = (ctx: SceneContext) => (ctx.is916 ? 3.3 : 3.1) * ctx.u;
export const label = (ctx: SceneContext) => (ctx.is916 ? 2.3 : 2.1) * ctx.u;
