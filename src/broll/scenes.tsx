// The 12 B-roll scene variants, ported from broll-engine.jsx.
// Deviations from the source engine: no indigo glow on the AI Workflow node
// (v2 removed accent glow), and the Myth strike-through is near-black because
// video is black and white.
import { broll, font } from "../design-system";
import { clamp01, ease, fitByLen, fitByWord, fmtNum, parseNum, splitParts } from "./engine";
import { big, Icon, label, MaskReveal, Overline, support } from "./primitives";
import type { SceneContext } from "./types";
import { build } from "./validation";

const C = broll.color;

// Fits text on one line at 16:9; below `floor` × target it wraps instead.
// Count-up shared by number and stat: the figure enters like the words
// (rise + blur-in), counts on a cubic ease-out so the last digits do not crawl,
// and sits in a box reserved at its final width so it never slides as digits
// are added.
const countEase = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);
const CountUp = ({ ctx, shown, final, style }: { ctx: SceneContext; shown: string; final: string; style: React.CSSProperties }) => {
  const k = ease(ctx.t / ctx.inMs);
  const size = Number(style.fontSize);
  return (
    <div
      style={{
        ...style,
        position: "relative",
        opacity: k,
        transform: `translateY(${(1 - k) * broll.motion.wordRise * 0.5}%)`,
        filter: `blur(${(1 - k) * size * broll.motion.wordBlurEm}px)`,
      }}
    >
      <span style={{ visibility: "hidden" }}>{final}</span>
      <span style={{ position: "absolute", right: 0, top: 0 }}>{shown}</span>
    </div>
  );
};

const oneLine = (text: string, target: number, width: number, floor = 0) =>
  Math.min(fitByWord(text, target, width, 0.6), Math.max(fitByLen(text, target, width, 0.52), target * floor));

const keyword = (ctx: SceneContext) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.center ? "center" : "flex-start", gap: 1.6 * ctx.u, textAlign: ctx.center ? "center" : "left" }}>
    {ctx.s ? <Overline text={ctx.s} ctx={ctx} /> : null}
    <MaskReveal text={ctx.p} size={big(ctx)} weight={680} color={C.fg} tracking="-0.035em" t={ctx.t} lh={1.0} align={ctx.center ? "center" : "left"} />
  </div>
);

const phrase = (ctx: SceneContext) => {
  const words = ctx.p.split(/\s+/);
  const lead = words.slice(0, -1).join(" ");
  const key = words[words.length - 1];
  // At 16:9 a phrase (1-5 words) always fits on one line.
  const sz = ctx.is916 ? fitByWord(ctx.p, 10 * ctx.u, ctx.availW, 0.6) : oneLine(ctx.p, 10 * ctx.u, ctx.availW);
  const keyDelay = lead ? lead.split(" ").length * build.wordStagger : 0;
  // The underline starts as the last word lands, not as a separate late beat.
  const barK = ease((ctx.t - keyDelay - build.phraseBarDelay) / build.phraseBarDuration);
  const align = ctx.center ? "center" : "left";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.center ? "center" : "flex-start", gap: 1.2 * ctx.u, textAlign: align }}>
      {ctx.s ? <Overline text={ctx.s} ctx={ctx} /> : null}
      <div style={{ display: "flex", flexWrap: "wrap", gap: `0 ${sz * 0.28}px`, justifyContent: ctx.center ? "center" : "flex-start", alignItems: "baseline" }}>
        {lead ? <MaskReveal text={lead} size={sz} weight={600} color={C.fg} tracking="-0.03em" t={ctx.t} align={align} /> : null}
        <span style={{ position: "relative", display: "inline-block" }}>
          <MaskReveal text={key} size={sz} weight={700} color={ctx.accent} tracking="-0.03em" t={ctx.t} delay={keyDelay} align="left" />
          <span style={{ position: "absolute", left: 0, bottom: -sz * 0.08, height: sz * 0.11, width: `${clamp01(barK) * 100}%`, background: ctx.accent, borderRadius: 999 }} />
        </span>
      </div>
    </div>
  );
};

const number = (ctx: SceneContext) => {
  const pn = parseNum(ctx.p)!; // Content is validated before a scene renders.
  const countK = countEase(ctx.t / (ctx.inMs + build.numberTail));
  const shown = `${pn.prefix}${fmtNum(pn.value * countK, pn.decimals)}${pn.suffix}`;
  const maxStr = `${pn.prefix}${fmtNum(pn.value, pn.decimals)}${pn.suffix}`;
  const sz = fitByLen(maxStr, (ctx.is916 ? 20 : 22) * ctx.u, ctx.availW, 0.58);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.center ? "center" : "flex-start", gap: 1.4 * ctx.u, textAlign: ctx.center ? "center" : "left" }}>
      <CountUp ctx={ctx} shown={shown} final={maxStr} style={{ fontSize: sz, fontWeight: 700, color: C.fg, letterSpacing: "-0.04em", lineHeight: 0.95, fontVariantNumeric: "tabular-nums" }} />
      {ctx.s ? (
        <div style={{ fontSize: support(ctx), fontWeight: 500, color: C.fg2, letterSpacing: "-0.01em", maxWidth: ctx.W * 0.62, opacity: ease((ctx.t - ctx.inMs) / 300) }}>{ctx.s}</div>
      ) : null}
    </div>
  );
};

const beforeAfter = (ctx: SceneContext) => {
  const [before = "", after = ""] = splitParts(ctx.p, true);
  const cellW = ctx.is916 ? ctx.availW : ctx.availW * 0.42;
  const target = (ctx.is916 ? 7.4 : 7.2) * ctx.u;
  const sz = Math.min(fitByWord(before, target, cellW, 0.6), fitByWord(after, target, cellW, 0.6));
  const k2 = ease((ctx.t - ctx.inMs - build.beforeAfterDelay) / build.beforeAfterDuration);
  const cell = (txt: string, lbl: string, color: string, kk: number) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 0.9 * ctx.u, alignItems: ctx.center ? "center" : "flex-start", opacity: kk, transform: `translateY(${(1 - kk) * 3 * ctx.u}px)` }}>
      <Overline text={lbl} ctx={ctx} color={color} />
      <div style={{ fontSize: sz, fontWeight: 660, color: C.fg, letterSpacing: "-0.03em", lineHeight: 1.0, textAlign: ctx.center ? "center" : "left" }}>{txt}</div>
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: ctx.is916 ? "column" : "row", alignItems: "center", gap: (ctx.is916 ? 3 : 4) * ctx.u }}>
      {cell(before, ctx.beforeLabel, C.fg3, ease(ctx.t / ctx.inMs))}
      <div style={{ opacity: k2, transform: ctx.is916 ? "rotate(90deg)" : "none" }}>
        <Icon name="arrow" s={4.4 * ctx.u} c={ctx.accent} sw={2.4} k={k2} />
      </div>
      {cell(after, ctx.afterLabel, ctx.accent, k2)}
    </div>
  );
};

const problemSolution = (ctx: SceneContext) => {
  const [prob = "", sol = ""] = splitParts(ctx.p);
  const target = (ctx.is916 ? 6.6 : 6.4) * ctx.u;
  const w = ctx.availW - 6 * ctx.u;
  const sz = Math.min(fitByWord(prob, target, w, 0.58), fitByWord(sol, target, w, 0.58));
  const row = (icon: "cross" | "check", txt: string, color: string, delay: number) => {
    const k = ease((ctx.t - delay) / build.problemDuration);
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 1.6 * ctx.u, opacity: k, transform: `translateY(${(1 - k) * 3 * ctx.u}px)` }}>
        <span style={{ width: 4.6 * ctx.u, height: 4.6 * ctx.u, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
          <Icon name={icon} s={2.7 * ctx.u} c={color} sw={3} k={k} />
        </span>
        <span style={{ fontSize: sz, fontWeight: 640, color: C.fg, letterSpacing: "-0.025em", lineHeight: 1.05 }}>{txt}</span>
      </div>
    );
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2.2 * ctx.u, alignItems: "flex-start" }}>
      {row("cross", prob, C.neg, ctx.inMs * 0.2)}
      {row("check", sol, C.pos, ctx.inMs + build.problemDelay)}
    </div>
  );
};

const mythReality = (ctx: SceneContext) => {
  const [myth = "", reality = ""] = splitParts(ctx.p);
  const target = (ctx.is916 ? 7.2 : 7) * ctx.u;
  const sz = Math.min(fitByWord(myth, target, ctx.availW, 0.6), fitByWord(reality, target, ctx.availW, 0.6));
  const kM = ease(ctx.t / ctx.inMs);
  const strike = clamp01(ease((ctx.t - ctx.inMs - 120) / 380));
  const kR = ease((ctx.t - ctx.inMs - build.mythDelay) / build.mythDuration);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2.4 * ctx.u, alignItems: ctx.center ? "center" : "flex-start", textAlign: ctx.center ? "center" : "left" }}>
      <div style={{ opacity: 0.5 + kM * 0.5, transform: `translateY(${(1 - kM) * 2 * ctx.u}px)` }}>
        <Overline text="Myth" ctx={ctx} color={C.fg3} />
        {/* Strike drawn per line (box-decoration clone) so wrapped myths stay accurate. */}
        <div style={{ marginTop: 0.6 * ctx.u, lineHeight: 1.02 }}>
          <span
            style={{
              fontSize: sz,
              fontWeight: 600,
              color: C.fg2,
              letterSpacing: "-0.025em",
              // Near-black strike over the gray myth text; a gray strike would blend in.
              backgroundImage: `linear-gradient(${C.fg}, ${C.fg})`,
              backgroundRepeat: "no-repeat",
              backgroundSize: `${strike * 100}% ${sz * 0.055}px`,
              backgroundPosition: "0 56%",
              boxDecorationBreak: "clone",
              WebkitBoxDecorationBreak: "clone",
            }}
          >
            {myth}
          </span>
        </div>
      </div>
      <div style={{ opacity: kR, transform: `translateY(${(1 - kR) * 3 * ctx.u}px)` }}>
        <Overline text="Reality" ctx={ctx} color={ctx.accent} />
        <div style={{ fontSize: sz * 1.06, fontWeight: 700, color: C.fg, letterSpacing: "-0.03em", lineHeight: 1.02, marginTop: 0.6 * ctx.u }}>{reality}</div>
      </div>
    </div>
  );
};

const STEP_MS = build.stepGap;

const steps = (ctx: SceneContext) => {
  const items = splitParts(ctx.p);
  const colW = ctx.is916 ? ctx.availW - 7 * ctx.u : ctx.availW / 3.2;
  const target = (ctx.is916 ? 5 : 4.4) * ctx.u;
  const sz = items.reduce((m, it) => Math.min(m, fitByWord(it, target, colW, 0.58)), target);
  const num = (ctx.is916 ? 3 : 2.7) * ctx.u;
  const kids: React.ReactNode[] = [];
  items.forEach((txt, i) => {
    if (i) {
      // The line draws first and the next step arrives as it lands.
      const kc = ease((ctx.t - i * STEP_MS + 220) / 260);
      kids.push(
        <span
          key={`c${i}`}
          style={{
            flex: ctx.is916 ? "none" : 1,
            width: ctx.is916 ? 0.28 * ctx.u : "auto",
            height: ctx.is916 ? 3 * ctx.u : 0.22 * ctx.u,
            background: ctx.is916 ? C.hair : C.accentLine,
            transformOrigin: ctx.is916 ? "top" : "left",
            transform: ctx.is916 ? `scaleY(${kc})` : `scaleX(${kc})`,
            alignSelf: "flex-start",
            marginLeft: ctx.is916 ? 2.35 * ctx.u : 2 * ctx.u,
            marginRight: ctx.is916 ? 0 : 2 * ctx.u,
            // At 16:9 the line runs level with the centre of the step numbers.
            marginTop: ctx.is916 ? 0 : 2.4 * ctx.u,
          }}
        />,
      );
    }
    const k = ease((ctx.t - i * STEP_MS) / build.stepDuration);
    kids.push(
      <div key={i} style={{ display: "flex", flexDirection: ctx.is916 ? "row" : "column", alignItems: ctx.center ? "center" : "flex-start", gap: 1.4 * ctx.u, opacity: k, transform: `translateY(${(1 - k) * 3 * ctx.u}px)`, flex: "none" }}>
        <span style={{ width: 5 * ctx.u, height: 5 * ctx.u, borderRadius: 999, border: `${0.28 * ctx.u}px solid ${ctx.accent}`, color: ctx.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: num, fontWeight: 700, flex: "none", background: ctx.accentSoft }}>
          {ctx.startAt + i}
        </span>
        <span style={{ fontSize: sz, fontWeight: 620, color: C.fg, letterSpacing: "-0.02em", lineHeight: 1.05 }}>{txt}</span>
      </div>,
    );
  });
  return (
    <div style={{ display: "flex", flexDirection: ctx.is916 ? "column" : "row", alignItems: "flex-start", width: ctx.is916 ? "auto" : "100%", justifyContent: "space-between" }}>
      {kids}
    </div>
  );
};

const stat = (ctx: SceneContext) => {
  const pn = parseNum(ctx.p)!;
  const k = countEase(ctx.t / (ctx.inMs + build.numberTail));
  const shown = `${pn.prefix}${fmtNum(pn.value * k, pn.decimals)}${pn.suffix}`;
  const maxStr = `${pn.prefix}${fmtNum(pn.value, pn.decimals)}${pn.suffix}`;
  const sz = fitByLen(maxStr, (ctx.is916 ? 18 : 20) * ctx.u, ctx.availW, 0.58);
  const barW = ctx.W * (ctx.is916 ? 0.56 : 0.42);
  const fill = clamp01((pn.value / 100) * k);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.center ? "center" : "flex-start", gap: 2 * ctx.u }}>
      {ctx.s ? <Overline text={ctx.s} ctx={ctx} /> : null}
      <CountUp ctx={ctx} shown={shown} final={maxStr} style={{ fontSize: sz, fontWeight: 720, color: C.fg, letterSpacing: "-0.045em", lineHeight: 0.9, fontVariantNumeric: "tabular-nums" }} />
      <div style={{ width: barW, height: 1.2 * ctx.u, background: C.hair, borderRadius: 999, overflow: "hidden" }}>
        <div style={{ width: `${fill * 100}%`, height: "100%", background: ctx.accent, borderRadius: 999 }} />
      </div>
    </div>
  );
};

const quote = (ctx: SceneContext) => {
  const sz = ctx.is916 ? fitByWord(ctx.p, 7.4 * ctx.u, ctx.availW, 0.58) : oneLine(ctx.p, 7 * ctx.u, Math.min(ctx.availW, ctx.W * 0.78), 0.7);
  const kM = ease(ctx.t / 300);
  const align = ctx.center ? "center" : "left";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.center ? "center" : "flex-start", gap: 0.4 * ctx.u, textAlign: align, maxWidth: ctx.W * 0.78 }}>
      <div style={{ fontFamily: font.sans, fontWeight: 600, fontSize: 16 * ctx.u, lineHeight: 0.6, color: ctx.accent, opacity: kM, height: 6 * ctx.u }}>{"“"}</div>
      <MaskReveal text={ctx.p} size={sz} weight={560} color={C.fg} tracking="-0.02em" t={ctx.t} lh={1.12} align={align} stagger={build.quoteStagger} />
      {ctx.s ? (
        <div style={{ fontSize: label(ctx) * 1.15, fontWeight: 500, color: C.fg2, marginTop: 1.4 * ctx.u, opacity: ease((ctx.t - ctx.inMs) / 320) }}>{`— ${ctx.s}`}</div>
      ) : null}
    </div>
  );
};

const warning = (ctx: SceneContext) => {
  const sz = fitByWord(ctx.p, (ctx.is916 ? 8.4 : 8) * ctx.u, ctx.availW, 0.6);
  const kI = ease(ctx.t / ctx.inMs);
  const align = ctx.center ? "center" : "left";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.center ? "center" : "flex-start", gap: 2 * ctx.u, textAlign: align }}>
      <span style={{ width: 8 * ctx.u, height: 8 * ctx.u, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", opacity: kI, transform: `scale(${0.9 + kI * 0.1})` }}>
        <Icon name="warn" s={4.6 * ctx.u} c={C.warn} sw={2.2} k={ease((ctx.t - 120) / 460)} />
      </span>
      <MaskReveal text={ctx.p} size={sz} weight={680} color={C.fg} tracking="-0.03em" t={ctx.t} delay={build.warningDelay} align={align} lh={1.02} />
      {ctx.s ? (
        <div style={{ fontSize: support(ctx), fontWeight: 500, color: C.fg2, maxWidth: ctx.W * 0.66, opacity: ease((ctx.t - ctx.inMs) / 320) }}>{ctx.s}</div>
      ) : null}
    </div>
  );
};

const aiWorkflow = (ctx: SceneContext) => {
  const parts = splitParts(ctx.p);
  const nodes = parts;
  const sz = (ctx.is916 ? 4.2 : 3.8) * ctx.u;
  const kids: React.ReactNode[] = [];
  nodes.forEach((txt, i) => {
    if (i) {
      const ka = ease((ctx.t - i * build.workflowGap - 140) / 300);
      kids.push(
        <span
          key={`a${i}`}
          style={
            ctx.is916
              ? { opacity: ka, transform: "rotate(90deg)", margin: `${0.4 * ctx.u}px 0` }
              : { opacity: ka, alignSelf: "flex-start", marginTop: 3.4 * ctx.u }
          }
        >
          <Icon name="arrow" s={3.4 * ctx.u} c={C.fg3} sw={2} k={ka} />
        </span>,
      );
    }
    const k = ease((ctx.t - i * build.workflowGap) / build.workflowDuration);
    const isAI = i === 1;
    kids.push(
      <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 * ctx.u, opacity: k, transform: `translateY(${(1 - k) * 2.4 * ctx.u}px)` }}>
        <span style={{ width: 11 * ctx.u, height: 11 * ctx.u, borderRadius: 2.4 * ctx.u, background: isAI ? ctx.accent : C.bgPure, border: `${0.28 * ctx.u}px solid ${isAI ? ctx.accent : C.hair}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name={isAI ? "spark" : i === 0 ? "bolt" : "check"} s={5 * ctx.u} c={isAI ? C.bgPure : C.fg} sw={2} k={k} />
        </span>
        <span style={{ fontSize: sz, fontWeight: 600, color: isAI ? ctx.accent : C.fg, letterSpacing: "-0.02em" }}>{txt}</span>
      </div>,
    );
  });
  return (
    <div style={{ display: "flex", flexDirection: ctx.is916 ? "column" : "row", alignItems: "center", gap: (ctx.is916 ? 2 : 2.6) * ctx.u }}>
      {kids}
    </div>
  );
};

const humanReview = (ctx: SceneContext) => {
  const sz = fitByWord(ctx.p, (ctx.is916 ? 8.6 : 8.2) * ctx.u, ctx.availW, 0.6);
  const kI = ease(ctx.t / ctx.inMs);
  const align = ctx.center ? "center" : "left";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: ctx.center ? "center" : "flex-start", gap: 2 * ctx.u, textAlign: align }}>
      <div style={{ display: "flex", alignItems: "center", gap: 1.4 * ctx.u, opacity: kI }}>
        <span style={{ width: 7 * ctx.u, height: 7 * ctx.u, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" s={4 * ctx.u} c={ctx.accent} sw={2} k={ease((ctx.t - 100) / 460)} />
        </span>
        <span style={{ width: 4 * ctx.u, height: 4 * ctx.u, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Icon name="check" s={2.6 * ctx.u} c={C.pos} sw={3} k={ease((ctx.t - 260) / 400)} />
        </span>
      </div>
      <MaskReveal text={ctx.p} size={sz} weight={680} color={C.fg} tracking="-0.03em" t={ctx.t} delay={build.humanDelay} align={align} lh={1.02} />
      {ctx.s ? (
        <div style={{ fontSize: support(ctx), fontWeight: 500, color: C.fg2, maxWidth: ctx.W * 0.66, opacity: ease((ctx.t - ctx.inMs) / 320) }}>{ctx.s}</div>
      ) : null}
    </div>
  );
};

export const SCENES = {
  keyword,
  phrase,
  number,
  beforeAfter,
  problemSolution,
  mythReality,
  steps,
  stat,
  quote,
  warning,
  aiWorkflow,
  humanReview,
} satisfies Record<string, (ctx: SceneContext) => React.ReactNode>;

export type BrollVariant = keyof typeof SCENES;
