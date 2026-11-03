// Typed access to the bundled video design tokens.
// Values come from tokens.generated.ts (run `pnpm sync:ds` after the
// design system changes). Consume roles here, never raw hex in components.
import { loadVariableFont as loadGeist } from "@remotion/google-fonts/Geist";
import { loadVariableFont as loadGeistMono } from "@remotion/google-fonts/GeistMono";
import { cssVars as v } from "./tokens.generated";

export { dsSource } from "./tokens.generated";

const ms = (value: string) => parseFloat(value);
const pct = (value: string) => parseFloat(value) / 100;

const geist = loadGeist("normal", { subsets: ["latin", "latin-ext"] });
const geistMono = loadGeistMono("normal", { subsets: ["latin", "latin-ext"] });

export const font = {
  family: geist.fontFamily,
  sans: `'${geist.fontFamily}', ui-sans-serif, system-ui, sans-serif`,
  mono: `'${geistMono.fontFamily}', ui-monospace, monospace`,
} as const;

// Resolves once Geist and Geist Mono are loaded; text measurement must wait for it.
export const fontsReady = Promise.all([geist.waitUntilDone(), geistMono.waitUntilDone()]);

// Border drawn outside the glyph: paint-order puts the fill over the inner half
// of a centered stroke, so the stroke is twice the visible border width.
export const outerStroke = (visibleWidthPx: number, strokeColor: string) => ({
  WebkitTextStroke: `${visibleWidthPx * 2}px ${strokeColor}`,
  paintOrder: "stroke fill",
});

// Light editorial foundations (content modes 1, 2 and 4).
export const color = {
  brandPrimary: v["brand-primary"],
  brandSecondary: v["brand-secondary"],
  accent: v["accent-500"],
  accentHover: v["accent-600"],
  accentSoftSurface: v["accent-50"],
  fg1: v["fg-1"],
  fg2: v["fg-2"],
  fg3: v["fg-3"],
  fg4: v["fg-4"],
  fgOnAccent: v["fg-on-accent"],
  bgApp: v["bg-app"],
  bgSurface: v["bg-surface"],
  bgSubtle: v["bg-subtle"],
  bgInverse: v["bg-inverse"],
  borderSubtle: v["border-subtle"],
  borderDefault: v["border-default"],
  borderStrong: v["border-strong"],
  success: v["success-500"],
  warning: v["warning-500"],
  danger: v["danger-500"],
  info: v["info-500"],
} as const;

export const type = {
  tracking: {
    display: v["tracking-display"],
    tight: v["tracking-tight"],
    caps: v["tracking-caps"],
  },
  leading: {
    tight: parseFloat(v["leading-tight"]),
    snug: parseFloat(v["leading-snug"]),
  },
  size: {
    h1: parseFloat(v["text-h1"]),
    h2: parseFloat(v["text-h2"]),
    h3: parseFloat(v["text-h3"]),
  },
  weight: {
    semibold: parseFloat(v["weight-semibold"]),
    bold: parseFloat(v["weight-bold"]),
  },
} as const;

// Web tokens are specified at 1x. A 1080 px-wide video canvas renders them at
// --video-density (2x, the density of a 540 pt-wide phone layout).
export const VIDEO_DENSITY = parseFloat(v["video-density"]);

const bezier = (value: string) => value.match(/[\d.]+/g)!.map(Number) as [number, number, number, number];

export const motion = {
  durFastMs: ms(v["dur-fast"]),
  durBaseMs: ms(v["dur-base"]),
  easeOut: bezier(v["ease-out"]),
} as const;

// Talking-head captions (captions.css, revision 2, black and white). Pixel values are 1x.
export const captions = {
  size: parseFloat(v["caption-size"]),
  weight: parseFloat(v["caption-weight"]),
  tracking: v["caption-tracking"],
  leading: parseFloat(v["caption-leading"]),
  transform: v["caption-transform"],
  fg: v["caption-fg"],
  textShadow: v["caption-text-shadow"],
  strokeWidth: parseFloat(v["caption-stroke-width"]),
  strokeColor: v["caption-stroke-color"],
  activeBg: v["caption-active-bg"],
  activeRadius: parseFloat(v["caption-active-radius"]),
  activePadY: v["caption-active-pad-y"],
  activePadX: v["caption-active-pad-x"],
  wordsMin: parseFloat(v["caption-words-min"]),
  wordsMax: parseFloat(v["caption-words-max"]),
  gapBreakMs: ms(v["caption-gap-break"]),
  maxWidth916: pct(v["caption-max-width-916"]),
  bottom916: pct(v["caption-bottom-916"]),
  // 16:9: lower third, one line (chosen 2026-10-26).
  size169: parseFloat(v["caption-size-169"]),
  maxWidth169: pct(v["caption-max-width-169"]),
  bottom169: pct(v["caption-bottom-169"]),
  enterMs: ms(v["caption-enter"]),
  ease: bezier(v["caption-ease"]),
  rise: parseFloat(v["caption-rise"]),
  lingerMs: ms(v["caption-linger"]),
} as const;

// Instagram & Facebook video covers (covers.css, revision 1, black and white). Pixel values are 1x.
export const cover = {
  width: parseFloat(v["cover-width"]),
  height: parseFloat(v["cover-height"]),
  weight: parseFloat(v["cover-weight"]),
  sizeMax: parseFloat(v["cover-size-max"]),
  tracking: v["cover-tracking"],
  leading: parseFloat(v["cover-leading"]),
  fg: v["cover-fg"],
  textShadow: v["cover-text-shadow"],
  strokeWidth: parseFloat(v["cover-stroke-width"]),
  strokeColor: v["cover-stroke-color"],
  marginX: pct(v["cover-margin-x"]),
  bottom: pct(v["cover-bottom"]),
  bottomCloseup: pct(v["cover-bottom-closeup"]),
  maxLines: parseFloat(v["cover-max-lines"]),
  lineChars: parseFloat(v["cover-line-chars"]),
} as const;

// YouTube thumbnail (covers.css, 16:9, chosen 2026-10-26): near-black title
// panel left, photo right; title type, border and halo as the cover.
export const thumbnail = {
  width: parseFloat(v["thumb-width"]),
  height: parseFloat(v["thumb-height"]),
  panel: pct(v["thumb-panel"]),
  marginX: pct(v["thumb-margin-x"]),
  sizeMax: pct(v["thumb-size-max"]),
  strokeWidth: parseFloat(v["thumb-stroke-width"]),
} as const;

// Technical callouts (callouts.css, black and white). Pixel values are 1x.
export const callout = {
  fg: v["callout-fg"],
  labelSize: parseFloat(v["callout-label-size"]),
  labelFg: v["callout-label-fg"],
  labelTracking: v["callout-label-tracking"],
  termSize: parseFloat(v["callout-term-size"]),
  termWeight: parseFloat(v["callout-term-weight"]),
  termTracking: v["callout-term-tracking"],
  itemSize: parseFloat(v["callout-item-size"]),
  itemWeight: parseFloat(v["callout-item-weight"]),
  ruleWidth: parseFloat(v["callout-rule-width"]),
  ruleFg: v["callout-rule-fg"],
  textShadow: v["callout-text-shadow"],
  scrim: v["callout-scrim"],
  scrimHeight: pct(v["callout-scrim-height"]),
  marginX: pct(v["callout-margin-x"]),
  top: pct(v["callout-top"]),
  maxWidth: pct(v["callout-max-width"]),
  enterMs: ms(v["callout-enter"]),
  exitMs: ms(v["callout-exit"]),
  ruleDrawMs: ms(v["callout-rule-draw"]),
  rise: parseFloat(v["callout-rise"]),
  ease: bezier(v["callout-ease"]),
  holdMinMs: ms(v["callout-hold-min"]),
  // 16:9: a column beside the speaker, vertically centered (chosen 2026-10-26).
  marginX169: pct(v["callout-169-margin-x"]),
  maxWidth169: pct(v["callout-169-max-width"]),
  scrim169: v["callout-169-scrim"],
  scrimWidth169: pct(v["callout-169-scrim-width"]),
} as const;

// B-roll subsystem (broll.css): video overlays and cutaways only.
export const broll = {
  color: {
    bg: v["broll-bg"],
    bgPure: v["broll-bg-pure"],
    bgWarm: v["broll-bg-warm"],
    fg: v["broll-fg"],
    fgAlt: v["broll-fg-alt"],
    fg2: v["broll-fg-2"],
    fg3: v["broll-fg-3"],
    accent: v["broll-accent"],
    accentSoft: v["broll-accent-soft"],
    accentLine: v["broll-accent-line"],
    warn: v["broll-warn"],
    warnSoft: v["broll-warn-soft"],
    neg: v["broll-neg"],
    pos: v["broll-pos"],
    hair: v["broll-hair"],
  },
  safe: {
    vertical: { x: pct(v["broll-safe-x-916"]), y: pct(v["broll-safe-y-916"]) },
    landscape: { x: pct(v["broll-safe-x-169"]), y: pct(v["broll-safe-y-169"]) },
  },
  // 16:9 layout (centered keynote, chosen 2026-10-26): alignment and the scale
  // applied to the 9:16-tuned sizes. 9:16 is always centered at scale 1.
  layout: {
    vertical: { center: true, scale: 1 },
    landscape: { center: v["broll-align-169"] === "center", scale: parseFloat(v["broll-scale-169"]) },
  },
  timing: {
    inMs: ms(v["broll-in"]),
    holdMs: ms(v["broll-hold"]),
    outMs: ms(v["broll-out"]),
  },
  // Keynote motion (chosen 2026-10-26).
  motion: {
    ease: bezier(v["broll-ease"]),
    exitEase: bezier(v["broll-exit-ease"]),
    clock: parseFloat(v["broll-clock"]),
    push: pct(v["broll-push"]),
    rise: pct(v["broll-rise"]),
    wordRise: parseFloat(v["broll-word-rise"]),
    wordBlurEm: parseFloat(v["broll-word-blur"]),
    exitBlur: pct(v["broll-exit-blur"]),
  },
} as const;

export const logo = {
  markBlack: "brand/kw-mark-black.png",
  markWhite: "brand/kw-mark-white.png",
  domainWhite: "brand/kw-domain-white.png",
} as const;

// Matches current short-form exports and the 16:9 presentation canvas.
export const formats = {
  vertical: { width: 1080, height: 1920, fps: 30 },
  landscape: { width: 1920, height: 1080, fps: 30 },
} as const;
