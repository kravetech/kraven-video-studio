// Pure rules shared by preflight, standalone cards and timed cutaways.
export const build = {
  wordDuration: 460, wordStagger: 55, phraseBarDelay: 160, phraseBarDuration: 420,
  numberTail: 400, beforeAfterDelay: 160, beforeAfterDuration: 420,
  problemDelay: 220, problemDuration: 460, mythDelay: 260, mythDuration: 460,
  stepGap: 300, stepDuration: 460, quoteStagger: 42, warningDelay: 120,
  humanDelay: 160, supportDuration: 320, workflowGap: 240, workflowDuration: 440,
} as const;
export const MIN_READING_MS = 900;
export const variants = ["keyword", "phrase", "number", "beforeAfter", "problemSolution", "mythReality", "steps", "stat", "quote", "warning", "aiWorkflow", "humanReview"] as const;
type Variant = typeof variants[number];
export type CardContent = { variant: string; primary: string; secondary?: string; holdMs?: number; startAt?: number };
export type CardTiming = { inMs: number; holdMs: number; outMs: number };
export const splitCardParts = (text: string, allowVs = false) =>
  text.split(allowVs ? /\s*(?:→|->|\/|\bvs\b|\|)\s*/i : /\s*(?:→|->|\/|\|)\s*/).map(part => part.trim());
export type ParsedNumber = { prefix: string; value: number; suffix: string; decimals: number };
export function parseCardNumber(text: string): ParsedNumber | null {
  const match = text.trim().match(/^([₱$€£¥]?)([+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([^\d]*)$/u);
  if (!match) return null;
  const value = Number(match[2].replaceAll(",", ""));
  if (!Number.isFinite(value)) return null;
  return { prefix: match[1], value, suffix: match[3], decimals: (match[2].split(".")[1] ?? "").length };
}
const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export function assertCardContent(cue: CardContent) {
  if (!variants.includes(cue.variant as Variant)) throw new Error(`Unknown B-roll variant: ${cue.variant}`);
  if (typeof cue.primary !== "string" || !cue.primary.trim()) throw new Error("B-roll primary text is required.");
  if (cue.secondary !== undefined && (typeof cue.secondary !== "string" || words(cue.secondary) > 8)) throw new Error("B-roll secondary text must contain at most 8 words.");
  const paired = ["beforeAfter", "problemSolution", "mythReality"].includes(cue.variant);
  const structured = paired || cue.variant === "steps" || cue.variant === "aiWorkflow";
  const parts = structured ? splitCardParts(cue.primary, cue.variant === "beforeAfter") : [cue.primary];
  if (parts.some(part => !part.trim())) throw new Error(`${cue.variant}: every part needs text.`);
  if (paired && parts.length !== 2) throw new Error(`${cue.variant}: provide exactly two parts; no text is discarded.`);
  if (cue.variant === "steps" && parts.length > 3) throw new Error("steps: provide 1–3 steps; split longer sequences into reviewed cards.");
  if (cue.startAt !== undefined && (cue.variant !== "steps" || !Number.isInteger(cue.startAt) || cue.startAt < 1 || cue.startAt + parts.length - 1 > 99)) throw new Error("startAt: a whole number from 1, on steps cards only, with the last step at most 99.");
  if (cue.variant === "aiWorkflow" && (parts.length < 2 || parts.length > 3)) throw new Error("aiWorkflow: provide 2–3 explicit nodes; fallback labels are not permitted.");
  if (parts.some(part => words(part) > 5)) throw new Error("B-roll primary text must contain at most 5 words per part.");
  if (cue.variant === "number" || cue.variant === "stat") {
    const number = parseCardNumber(cue.primary);
    if (!number) throw new Error(`${cue.variant}: provide an explicit finite number; no numeric fallback is permitted.`);
    if (cue.variant === "stat" && (number.prefix || number.suffix.trim() !== "%" || number.value < 0 || number.value > 100)) throw new Error("stat: provide a percentage from 0% to 100%; use number for other amounts.");
  }
}
export function revealEndMs(cue: CardContent, timing: CardTiming, clock: number) {
  assertCardContent(cue);
  const count = words(cue.primary);
  const wordEnd = (delay = 0, stagger: number = build.wordStagger) => (delay + (count - 1) * stagger + build.wordDuration) * clock;
  const supportEnd = cue.secondary?.trim() ? timing.inMs + build.supportDuration * clock : 0;
  switch (cue.variant) {
    case "keyword": return wordEnd();
    case "phrase": return ((count - 1) * build.wordStagger + build.phraseBarDelay + build.phraseBarDuration) * clock;
    case "number": return Math.max(timing.inMs + build.numberTail * clock, supportEnd);
    case "stat": return timing.inMs + build.numberTail * clock;
    case "beforeAfter": return timing.inMs + (build.beforeAfterDelay + build.beforeAfterDuration) * clock;
    case "problemSolution": return timing.inMs + (build.problemDelay + build.problemDuration) * clock;
    case "mythReality": return timing.inMs + (build.mythDelay + build.mythDuration) * clock;
    case "steps": return ((splitCardParts(cue.primary).length - 1) * build.stepGap + build.stepDuration) * clock;
    case "quote": return Math.max(wordEnd(0, build.quoteStagger), supportEnd, 300 * clock);
    case "warning": return Math.max(wordEnd(build.warningDelay), supportEnd);
    case "aiWorkflow": return ((splitCardParts(cue.primary).length - 1) * build.workflowGap + build.workflowDuration) * clock;
    case "humanReview": return Math.max(wordEnd(build.humanDelay), supportEnd, 660 * clock);
    default: throw new Error(`Unknown B-roll variant: ${cue.variant}`);
  }
}
export function assertCardTiming(cue: CardContent, timing: CardTiming, clock: number) {
  if (![timing.inMs, timing.holdMs, timing.outMs, clock].every(value => Number.isFinite(value) && value > 0)) throw new Error("Invalid B-roll motion configuration.");
  const hold = cue.holdMs ?? timing.holdMs;
  if (!Number.isFinite(hold) || hold <= 0) throw new Error("B-roll holdMs must be a positive finite number.");
  const end = revealEndMs(cue, timing, clock);
  const minimumHoldMs = Math.ceil(Math.max(timing.inMs, end) + MIN_READING_MS - timing.inMs);
  if (hold < minimumHoldMs) throw new Error(`${cue.variant}: holdMs ${hold} is too short. Use at least ${minimumHoldMs} ms so the last reveal has ${MIN_READING_MS} ms of reading time. Review placement; timing was not extended automatically.`);
  return { revealEndMs: end, minimumHoldMs };
}
