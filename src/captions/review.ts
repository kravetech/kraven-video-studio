// Transcript approval bound to content. Approval records a hash of the
// caption text and a hash of the word timing. Any text change after approval
// cancels it; a timing-only change (a re-cut carried over by
// remap-captions) keeps the text approved but needs the reviewer to check the sync
// again (pnpm captions:approve-sync). Shared by the CaptionedClip render and
// the Node scripts. No runtime imports: Node loads this file directly.

type Word = { text: string; startMs: number; endMs: number };
type Review = { status?: string; textHash?: string; timingHash?: string };

export type ReviewState = "approved" | "timing-changed" | "text-changed" | "unbound" | "needs-review";

const sha256 = async (text: string) => {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
};

export const textHash = (captions: Word[]) => sha256(captions.map((c) => c.text.trim()).join(" "));
export const timingHash = (captions: Word[]) => sha256(captions.map((c) => `${c.startMs}-${c.endMs}`).join(","));

export const reviewState = async (file: { review?: Review; captions: Word[] }): Promise<ReviewState> => {
  const r = file.review ?? {};
  if (r.status !== "reviewed") return "needs-review";
  // Approved before approval was bound to content: the reviewer confirms again.
  if (!r.textHash || !r.timingHash) return "unbound";
  if ((await textHash(file.captions)) !== r.textHash) return "text-changed";
  if ((await timingHash(file.captions)) !== r.timingHash) return "timing-changed";
  return "approved";
};

export const REVIEW_MESSAGES: Record<Exclude<ReviewState, "approved">, string> = {
  "needs-review": "Transcript not reviewed. Correct it with the reviewer, then run pnpm captions:approve <file> \"the reviewer\".",
  unbound: "Approved before approval was tied to the text. After the reviewer re-confirms the transcript, run pnpm captions:approve <file> \"the reviewer\".",
  "text-changed": "Caption text changed after approval. the reviewer must review and approve it again (pnpm captions:approve).",
  "timing-changed": "Timing changed after approval (re-cut). Render a preview, have the reviewer check the sync, then run pnpm captions:approve-sync <file> \"the reviewer\".",
};
