// Timing, easing and layout helpers ported from the design system's
// templates/broll/broll-engine.jsx. Time is in milliseconds, derived from the
// Remotion frame instead of requestAnimationFrame, so renders are deterministic.
import { Easing } from "remotion";
import { broll } from "../design-system";
import { parseCardNumber, splitCardParts } from "./validation";

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);
// Keynote motion: every element glides on the --broll-ease curve.
const curve = Easing.bezier(...broll.motion.ease);
export const ease = (t: number) => curve(clamp01(t));
// Exits use their own gentle ease-in-out (--broll-exit-ease).
const exitCurve = Easing.bezier(...broll.motion.exitEase);
const exitEase = (t: number) => exitCurve(clamp01(t));

export type Timeline = { inMs: number; holdMs: number; outMs: number };

export function phase(t: number, tl: Timeline) {
  const enter = ease(t / tl.inMs);
  const exit = clamp01(1 - exitEase((t - (tl.inMs + tl.holdMs)) / tl.outMs));
  return { enter, exit };
}

// Fit-to-width heuristics based on Geist advance widths.
const longestWord = (str: string) => str.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
export const fitByWord = (str: string, target: number, availW: number, per = 0.63) =>
  Math.min(target, availW / (Math.max(1, longestWord(str)) * per));
export const fitByLen = (str: string, target: number, availW: number, per = 0.6) =>
  Math.min(target, availW / (Math.max(1, str.length) * per));

export type { ParsedNumber } from "./validation";
export const parseNum = parseCardNumber;

export const fmtNum = (n: number, d: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });

// Multi-part scenes split on " → ", "->", "/", "|" (and "vs" for before/after).
export const splitParts = splitCardParts;
