// Output profiles, one per delivery orientation. An edit file names its
// profile ("profile": "horizontal-1080"); assembly, the captioned render,
// validation and release all follow it. Shared by the Remotion compositions
// and the Node scripts. No runtime imports: Node loads this file directly.

export type ProfileId = "vertical-1080" | "horizontal-1080";

export type Profile = {
  id: ProfileId;
  width: number;
  height: number;
  orientation: "vertical" | "horizontal";
  // The platform image delivered with the video.
  cover: { suffix: string; width: number; height: number; label: string };
  // Whether the Facebook/Instagram post text is part of the package.
  post: boolean;
  // Captions, callouts and the cover have a Kraven-approved design for this
  // orientation. Until then, renders are labeled previews only.
  graphicsApproved: boolean;
  // Captions burned into the picture. Long-form leaves them off (they cover
  // slides and the face cam); the SRT is still delivered for viewers to turn on.
  burnedCaptions: boolean;
};

export const PROFILES: Record<ProfileId, Profile> = {
  "vertical-1080": {
    id: "vertical-1080",
    width: 1080,
    height: 1920,
    orientation: "vertical",
    cover: { suffix: "-Cover.jpg", width: 1080, height: 1920, label: "Facebook/Instagram cover" },
    post: true,
    graphicsApproved: true,
    burnedCaptions: true,
  },
  // Long-form for YouTube. 16:9 captions, callouts and the 1280x720 thumbnail
  // approved by Kraven 2026-10-26 (captions A, callouts B, thumbnail A).
  // Burned-in captions turned off by Kraven 2026-10-28: YouTube gets the SRT.
  "horizontal-1080": {
    id: "horizontal-1080",
    width: 1920,
    height: 1080,
    orientation: "horizontal",
    cover: { suffix: "-Thumbnail.jpg", width: 1280, height: 720, label: "YouTube thumbnail" },
    post: false,
    graphicsApproved: true,
    burnedCaptions: false,
  },
};

export const DEFAULT_PROFILE: ProfileId = "vertical-1080";

export const profileFor = (id: string = DEFAULT_PROFILE): Profile => {
  const p = PROFILES[id as ProfileId];
  if (!p) throw new Error(`Unknown output profile "${id}". Use one of: ${Object.keys(PROFILES).join(", ")}.`);
  return p;
};

export const profileForSize = (width: number, height: number): Profile | undefined =>
  Object.values(PROFILES).find((p) => p.width === width && p.height === height);
