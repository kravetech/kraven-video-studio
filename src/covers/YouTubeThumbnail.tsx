// YouTube thumbnail (covers.css, 16:9, chosen by Kraven 2026-10-26): a
// near-black panel on the left with the title, a clean frame from the video
// on the right. Same title type, border and halo as the cover; black and white.
import { fitText } from "@remotion/layout-utils";
import { useEffect, useState } from "react";
import type { CalculateMetadataFunction } from "remotion";
import { AbsoluteFill, continueRender, delayRender, Img, staticFile } from "remotion";
import { z } from "zod";
import { color, cover, font, fontsReady, outerStroke, thumbnail as th } from "../design-system";
import { coverLines } from "./VideoCover";

export const youTubeThumbnailSchema = z.object({
  // 1-4 words that truthfully name the topic. "|" forces a line break.
  title: z.string().min(1),
  // Clean frame from the video, relative to public/ (scripts/make-cover.mjs extracts it).
  frameSrc: z.string(),
  // Vertical focus of the photo crop: 0 shows the top of the frame, 1 the bottom.
  focusY: z.number().min(0).max(1),
});

export type YouTubeThumbnailProps = z.infer<typeof youTubeThumbnailSchema>;

export const youTubeThumbnailDefaults: YouTubeThumbnailProps = {
  title: "VIDEO STUDIO",
  frameSrc: "samples/thumb-frame.png",
  focusY: 0.4,
};

export const calculateYouTubeThumbnailMetadata: CalculateMetadataFunction<YouTubeThumbnailProps> = () => ({
  width: th.width,
  height: th.height,
  durationInFrames: 1,
  fps: 30,
});

export const YouTubeThumbnail: React.FC<YouTubeThumbnailProps> = ({ title, frameSrc, focusY }) => {
  const lines = coverLines(title);
  const W = th.width;
  const H = th.height;
  const panel = W * th.panel;
  const marginX = W * th.marginX;
  const withinWidth = panel - marginX * 1.6;
  const [fontSize, setFontSize] = useState<number | null>(null);
  const [handle] = useState(() => delayRender("Measuring thumbnail title"));

  useEffect(() => {
    fontsReady.then(() => {
      const fitted = Math.min(
        ...lines.map((line) => fitText({ text: line, withinWidth, fontFamily: font.family, fontWeight: cover.weight, letterSpacing: cover.tracking }).fontSize),
      );
      setFontSize(Math.min(H * th.sizeMax, fitted));
      continueRender(handle);
    });
  }, [handle, lines.join("|"), withinWidth]);

  if (lines.length > cover.maxLines) {
    throw new Error(`Thumbnail title has ${lines.length} lines; the maximum is ${cover.maxLines}: "${title}"`);
  }

  return (
    <AbsoluteFill style={{ background: color.bgInverse }}>
      <Img src={staticFile(frameSrc)} style={{ position: "absolute", left: panel, width: W - panel, height: H, objectFit: "cover", objectPosition: `50% ${focusY * 100}%` }} />
      {fontSize ? (
        <div
          style={{
            position: "absolute",
            top: "50%",
            transform: "translateY(-50%)",
            left: marginX,
            fontFamily: font.sans,
            fontSize,
            fontWeight: cover.weight,
            letterSpacing: cover.tracking,
            lineHeight: cover.leading,
            color: cover.fg,
            textAlign: "left",
            textShadow: cover.textShadow,
            ...outerStroke(th.strokeWidth, cover.strokeColor),
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
