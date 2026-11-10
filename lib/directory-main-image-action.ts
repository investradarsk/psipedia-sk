/**
 * Main image edits from the native Directory Admin editor.
 *
 * Unlike an old whole-form imageUrl/imageKey pair, an explicit action can
 * distinguish "unchanged" from "remove" and "replace". Never treat an
 * omitted or stale field in a background/editorial payload as deletion.
 */
export type DirectoryMainImageAction =
  | { kind: "keep" }
  | { kind: "remove"; imageUrl: null; imageKey: null }
  | { kind: "replace"; imageUrl: string; imageKey: string };

const OWN_UPLOAD_KEY = /^directory\/20\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:jpg|png|webp|avif)$/i;

export function parseDirectoryMainImageAction(
  action: unknown,
  imageUrl: unknown,
  imageKey: unknown,
): DirectoryMainImageAction | null {
  if (action === undefined) return null; // legacy writer, not the native editor
  if (action === "keep") return { kind: "keep" };
  if (action === "remove") return { kind: "remove", imageUrl: null, imageKey: null };
  if (action === "replace") {
    const url = typeof imageUrl === "string" ? imageUrl.trim() : "";
    const key = typeof imageKey === "string" ? imageKey.trim() : "";
    // The upload endpoint generates one unique R2 object per accepted photo.
    // Reject arbitrary external URLs and mismatched/stale image keys.
    if (!OWN_UPLOAD_KEY.test(key) || url !== `/media/${key}`)
      throw new Error("DIRECTORY_IMAGE_REPLACEMENT_INVALID");
    return { kind: "replace", imageUrl: url, imageKey: key };
  }
  throw new Error("DIRECTORY_IMAGE_ACTION_INVALID");
}

export function directoryMainImageMatches(
  stored: { imageUrl?: string | null; imageKey?: string | null },
  expected: { imageUrl: string | null; imageKey: string | null },
): boolean {
  return (stored.imageUrl ?? null) === expected.imageUrl &&
    (stored.imageKey ?? null) === expected.imageKey;
}
