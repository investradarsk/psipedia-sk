/**
 * The public media endpoint serves approved/published R2 keys at /media/<key>.
 * A URL alone (including a static /images/ fallback or remote hotlink) is not
 * evidence that a profile/event/help card has its own canonical image.
 *
 * Use this SQLite predicate in homepage-only bounded selection queries so
 * LIMIT applies to image-eligible published rows. No per-card R2 or HTTP reads.
 */
export const HOMEPAGE_REAL_IMAGE_SQL = `image_key IS NOT NULL
  AND length(image_key) > 0
  AND trim(image_key) = image_key
  AND image_key NOT LIKE '%..%'
  AND image_key NOT LIKE '%//%'
  AND image_key NOT LIKE '/%'
  AND image_key NOT LIKE 'safe/%'
  AND image_key NOT LIKE 'quarantine/%'
  AND image_url = '/media/' || image_key`;

/** Mirrors the public canonical-media pairing for assertion and test fixtures. */
export function hasHomepageRealImage(input: { imageUrl?: string | null; imageKey?: string | null }) {
  const key = input.imageKey;
  return typeof key === "string"
    && key.length > 0
    && key.trim() === key
    && !key.includes("..")
    && !key.includes("//")
    && !key.startsWith("/")
    && !key.startsWith("safe/")
    && !key.startsWith("quarantine/")
    && input.imageUrl === `/media/${key}`;
}
