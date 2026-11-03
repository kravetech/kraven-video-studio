// Instagram & Facebook video cover (covers.css, revision 1, restored): a clean
// frame from the video with a large white uppercase title, left-aligned and
// stacked word by word, with a thin dark border and a dark halo.
import { fitText } from "@remotion/layout-utils";
import { useEffect, useState } from "react";
import type { CalculateMetadataFunction } from "remotion";
import { AbsoluteFill, continueRender, delayRender, Img, staticFile } from "remotion";
import { z } from "zod";
import { cover, font, fontsReady, outerStroke, VIDEO_DENSITY as D } from "../design-system";

export const videoCoverSchema = z.object({
  // 1-4 words that truthfully name the topic. "|" forces a line break.
  title: z.string().min(1),
  // Frame from the video, relative to public/ (scripts/make-cover.mjs extracts it).
  frameSrc: z.string(),
  // "closeup" when the face fills the frame: the title drops below the chin.
  framing: z.enum(["standard", "closeup"]),
});

export type VideoCoverProps = z.infer<typeof videoCoverSchema>;

export const videoCoverDefaults: VideoCoverProps = {
  title: "VIDEO STUDIO",
  frameSrc: "samples/cover-frame.png",
  framing: "standard",
};

export const calculateVideoCoverMetadata: CalculateMetadataFunction<VideoCoverProps> = () => ({
  width: cover.width,
  height: cover.height,
  durationInFrames: 1,
  fps: 30,
});

// Explicit "|" breaks win; otherwise soft-wrap near --cover-line-chars.
export function coverLines(title: string): string[] {
  if (title.includes("|")) return title.split("|").map((l) => l.trim().toUpperCase()).filter(Boolean);
  const lines: string[] = [];
  for (const word of title.trim().toUpperCase().split(/\s+/)) {
    const last = lines[lines.length - 1];
    if (last && (last + " " + word).length <= cover.lineChars) lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

export const VideoCover: React.FC<VideoCoverProps> = ({ title, frameSrc, framing }) => {
  const lines = coverLines(title);
  const W = cover.width;
  const H = cover.height;
  const withinWidth = W * (1 - 2 * cover.marginX);
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [handle] = useState(() => delayRender("Measuring cover title"));

  useEffect(() => {
    fontsReady.then(() => {
      const fitted = Math.min(
        ...lines.map(
          (line) =>
            fitText({ text: line, withinWidth, fontFamily: font.family, fontWeight: cover.weight, letterSpacing: cover.tracking }).fontSize,
        ),
      );
      setFontSize(Math.min(cover.sizeMax * D, fitted));
      continueRender(handle);
    });
  }, [handle, lines.join("|"), withinWidth]);

  if (lines.length > cover.maxLines) {
    throw new Error(`Cover title has ${lines.length} lines; the maximum is ${cover.maxLines}: "${title}"`);
  }

  return (
    <AbsoluteFill>
      <Img src={staticFile(frameSrc)} style={{ width: W, height: H, objectFit: "cover" }} />
      {fontSize ? (
        <div
          style={{
            position: "absolute",
            left: W * cover.marginX,
            right: W * cover.marginX,
            bottom: H * (framing === "closeup" ? cover.bottomCloseup : cover.bottom),
            fontFamily: font.sans,
            fontSize,
            fontWeight: cover.weight,
            letterSpacing: cover.tracking,
            lineHeight: cover.leading,
            color: cover.fg,
            textShadow: cover.textShadow,
            ...outerStroke(cover.strokeWidth * D, cover.strokeColor),
            textAlign: "left",
          }}
        >
          {lines.map((line, i) => (
            <div key={i} style={{ whiteSpace: "nowrap" }}>
              {line}
            </div>
          ))}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
