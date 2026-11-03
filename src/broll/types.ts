export type SceneContext = {
  p: string;
  s: string;
  beforeLabel: string;
  afterLabel: string;
  // Number of the first step on a steps card (1 unless a list continues).
  startAt: number;
  accent: string;
  accentSoft: string;
  is916: boolean;
  // Content block alignment: always centered at 9:16; set per layout at 16:9.
  center: boolean;
  W: number;
  H: number;
  u: number;
  t: number;
  availW: number;
  inMs: number;
};
