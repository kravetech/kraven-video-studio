import "./index.css";
import { Composition, Folder } from "remotion";
import { PRODUCT } from "./product";
import { formats } from "./design-system";
import { brollDefaults, BrollScene, brollSchema, calculateBrollMetadata } from "./broll/BrollScene";
import {
  calculateCaptionedClipMetadata,
  CaptionedClip,
  captionedClipDefaults,
  captionedClipSchema,
} from "./captions/CaptionedClip";
import { calculateVideoCoverMetadata, VideoCover, videoCoverDefaults, videoCoverSchema } from "./covers/VideoCover";
import {
  calculateYouTubeThumbnailMetadata,
  YouTubeThumbnail,
  youTubeThumbnailDefaults,
  youTubeThumbnailSchema,
} from "./covers/YouTubeThumbnail";

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name={PRODUCT.studioFolder}>
      <Composition
        id="Broll"
        component={BrollScene}
        schema={brollSchema}
        defaultProps={brollDefaults}
        calculateMetadata={calculateBrollMetadata}
        durationInFrames={83}
        {...formats.vertical}
      />
      <Composition
        id="CaptionedClip"
        component={CaptionedClip}
        schema={captionedClipSchema}
        defaultProps={captionedClipDefaults}
        calculateMetadata={calculateCaptionedClipMetadata}
        durationInFrames={300}
        {...formats.vertical}
      />
      <Composition
        id="VideoCover"
        component={VideoCover}
        schema={videoCoverSchema}
        defaultProps={videoCoverDefaults}
        calculateMetadata={calculateVideoCoverMetadata}
        durationInFrames={1}
        {...formats.vertical}
      />
      {/* YouTube thumbnail for horizontal-1080 videos (covers.css). */}
      <Composition
        id="YouTubeThumbnail"
        component={YouTubeThumbnail}
        schema={youTubeThumbnailSchema}
        defaultProps={youTubeThumbnailDefaults}
        calculateMetadata={calculateYouTubeThumbnailMetadata}
        durationInFrames={1}
        {...formats.landscape}
      />
    </Folder>
  );
};
