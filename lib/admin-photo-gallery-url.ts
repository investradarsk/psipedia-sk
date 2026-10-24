import { z } from "zod";

/** Preserve the canonical admin media URL contract (not an upload endpoint). */
const galleryUrl = z.string().trim().min(1).refine(value => {
  if (/^\/(?:media|images)\//.test(value)) return true;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
});

/** Invalid values are never added, including javascript:, data: and file: URIs. */
export function validateAdminPhotoGalleryUrl(input: string): string | null {
  const parsed = galleryUrl.safeParse(input);
  return parsed.success ? parsed.data : null;
}
