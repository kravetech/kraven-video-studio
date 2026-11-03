import type { Caption } from "@remotion/captions";
import { getVideoMetadata } from "@remotion/media-utils";
import type { CalculateMetadataFunction } from "remotion";
import { AbsoluteFill, staticFile } from "remotion";
import { z } from "zod";
import { type Callout, calloutSchema, TechnicalCallouts } from "../callouts/TechnicalCallouts";
import { broll, color, font, formats, VIDEO_DENSITY as D } from "../design-system";
import { assertEnhancementTimeline } from "../edit/timing";
import { assertCardTiming } from "../broll/validation";
import { type BrollCue, brollCueSchema, BrollCutaways, type Sfx, sfxSchema, SoundEffects, useCutawayActive, type Zoom, ZoomedVideo, zoomSchema } from "../edit/Enhancements";
import { profileForSize } from "../profiles";
import { REVIEW_MESSAGES, type ReviewState, reviewState } from "./review";
import { TalkingHeadCaptions } from "./TalkingHeadCaptions";

export const captionedClipSchema = z.object({
  // Paths relative to public/ (review clips live in public/samples/, git-ignored).
  videoSrc: z.string(),
  captionsSrc: z.string(),
  // Optional edit file: technical callouts plus optional B-roll cutaways, zooms
  // and sound effects ({ callouts, broll, zooms, sfx }).
  calloutsSrc: z.string().optional(),
  // Renders an unreviewed transcript with a visible label. Never for publishing.
  previewUnreviewed: z.boolean(),
  // Output frame rate; match the source (e.g. 59.94 for 60000/1001 footage). Default 30.
  fps: z.number().positive().optional(),
});

type CaptionFile = {
  review: { status: "needs-review" | "reviewed"; reviewedBy: string | null; reviewedAt: string | null; textHash?: string; timingHash?: string };
  captions: Caption[];
};

type Props = z.infer<typeof captionedClipSchema> & {
  captions?: Caption[];
  callouts?: Callout[];
  brollCues?: BrollCue[];
  zooms?: Zoom[];
  sfx?: Sfx[];
  reviewed?: boolean;
  state?: ReviewState;
  graphicsDraft?: boolean;
};

// The preview label names why this render is not final.
const PREVIEW_LABEL: Record<ReviewState, string> = {
  approved: "",
  "timing-changed": "Timing changed · sync check preview",
  "text-changed": "Text changed since approval · preview only",
  unbound: "Approval needs re-confirming · preview only",
  "needs-review": "Unreviewed transcript · preview only",
};

export const captionedClipDefaults: z.infer<typeof captionedClipSchema> = {
  videoSrc: "samples/demo.mp4",
  captionsSrc: "samples/demo.captions.json",
  previewUnreviewed: true,
  fps: 30,
};

export const calculateCaptionedClipMetadata: CalculateMetadataFunction<Props> = async ({ props }) => {
  const [meta, file, edit] = await Promise.all([
    getVideoMetadata(staticFile(props.videoSrc)),
    fetch(staticFile(props.captionsSrc)).then((r) => r.json() as Promise<CaptionFile>),
    props.calloutsSrc ? fetch(staticFile(props.calloutsSrc)).then((r) => r.json() as Promise<{ callouts?: unknown; broll?: unknown; zooms?: unknown; sfx?: unknown }>) : null,
  ]);
  // Design-system rule: never render final captions unless human approval
  // matches this exact text and timing.
  const state = await reviewState(file);
  const reviewed = state === "approved";
  if (!reviewed && !props.previewUnreviewed) {
    throw new Error(`${props.captionsSrc}: ${REVIEW_MESSAGES[state]} For a labeled preview, pass previewUnreviewed: true.`);
  }
  // The canvas is the master's output profile; a master no profile matches
  // was not assembled by this pipeline.
  const profile = profileForSize(meta.width, meta.height);
  if (!profile) throw new Error(`${props.videoSrc} is ${meta.width}x${meta.height}; no output profile matches. Assemble it with a profile first.`);
  // Orientations without an approved caption/callout design render previews only.
  const graphicsDraft = !profile.graphicsApproved;
  if (graphicsDraft && !props.previewUnreviewed) {
    throw new Error(`${profile.id} captions and callouts are not designed yet. For a labeled preview, pass previewUnreviewed: true.`);
  }
  const callouts = z.array(calloutSchema).parse(edit?.callouts ?? []);
  const brollCues = z.array(brollCueSchema).parse(edit?.broll ?? []);
  // Plain errors retain actionable messages across the render-browser boundary.
  for (const cue of brollCues) assertCardTiming(cue, broll.timing, broll.motion.clock);
  const zooms = z.array(zoomSchema).parse(edit?.zooms ?? []);
  const sfx = z.array(sfxSchema).parse(edit?.sfx ?? []);
  const fps = props.fps ?? formats.vertical.fps;
  const durationInFrames = Math.floor(meta.durationInSeconds * fps);
  assertEnhancementTimeline({ broll: brollCues, zooms, sfx }, fps, durationInFrames, broll.timing);
  return {
    width: profile.width,
    height: profile.height,
    fps,
    durationInFrames,
    props: { ...props, captions: file.captions, callouts, brollCues, zooms, sfx, reviewed, state, graphicsDraft },
  };
};

export const CaptionedClip: React.FC<Props> = ({ videoSrc, captions, callouts, brollCues, zooms, sfx, reviewed, state, graphicsDraft }) => {
  const cutaway = useCutawayActive(brollCues ?? []);
  const label = !reviewed ? PREVIEW_LABEL[state ?? "needs-review"] : graphicsDraft ? "Graphics not designed for this format · preview only" : null;
  return (
    <AbsoluteFill>
      <ZoomedVideo src={videoSrc} zooms={zooms ?? []} />
      {brollCues?.length ? <BrollCutaways cues={brollCues} /> : null}
      {sfx?.length ? <SoundEffects cues={sfx} /> : null}
      {callouts?.length && !cutaway ? <TechnicalCallouts callouts={callouts} /> : null}
      {captions && !cutaway ? <TalkingHeadCaptions captions={captions} /> : null}
      {label ? (
        <div
          style={{
            position: "absolute",
            top: "3.5%",
            width: "100%",
            textAlign: "center",
            fontFamily: font.mono,
            fontSize: 11 * D * 1.4,
            fontWeight: 500,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: color.brandPrimary,
          }}
        >
          <span style={{ background: "rgba(9,9,11,.82)", padding: `${4 * D}px ${10 * D}px`, borderRadius: 6 * D }}>
            {label}
          </span>
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
