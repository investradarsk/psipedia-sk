/** Mirrors the existing AdminPhotoGallery URL policy without an editor-only dependency. */
function validatedGalleryUrl(value: string): string | null {
  const clean = value.trim();
  if (!clean) return null;
  if (clean.startsWith("/media/") || clean.startsWith("/images/")) return clean;
  try {
    return ["http:", "https:"].includes(new URL(clean).protocol) ? clean : null;
  } catch {
    return null;
  }
}

/** Gallery metadata lives in the existing directory source_data_json; no D1 migration. */
export const DIRECTORY_BREEDER_GALLERY_KEY = "_psipedia_breeder_gallery_urls";
export const DIRECTORY_BREEDER_GALLERY_LIMIT = 6;

export function readDirectoryBreederGallery(
  data: Record<string, unknown> | null | undefined,
): string[] {
  const raw = data?.[DIRECTORY_BREEDER_GALLERY_KEY];
  if (typeof raw !== "string") return [];
  try {
    const values = JSON.parse(raw) as unknown;
    if (!Array.isArray(values)) return [];
    const seen = new Set<string>();
    return values.flatMap((value) => {
      if (typeof value !== "string") return [];
      const url = validatedGalleryUrl(value);
      if (!url || seen.has(url) || seen.size >= DIRECTORY_BREEDER_GALLERY_LIMIT) return [];
      seen.add(url);
      return [url];
    });
  } catch {
    return [];
  }
}

export function mergeDirectoryBreederGallery(
  current: Record<string, string | number | null> | null | undefined,
  category: string,
  proposed: unknown,
): Record<string, string | number | null> {
  const next = { ...(current ?? {}) };
  // Notion sync and other profile updates do not supply this field. Preserve it.
  if (proposed === undefined) return next;
  if (category !== "chovatelske-stanice") {
    throw new Error("Fotogaléria je dostupná len pre chovateľské stanice.");
  }
  if (!Array.isArray(proposed) || proposed.length > DIRECTORY_BREEDER_GALLERY_LIMIT) {
    throw new Error(`Fotogaléria môže obsahovať najviac ${DIRECTORY_BREEDER_GALLERY_LIMIT} fotografií.`);
  }
  const urls: string[] = [];
  for (const value of proposed) {
    if (typeof value !== "string") throw new Error("Neplatná fotografia vo fotogalérii.");
    const url = validatedGalleryUrl(value);
    if (!url) throw new Error("Neplatná URL fotografie vo fotogalérii.");
    if (urls.includes(url)) throw new Error("Rovnaká fotografia je vo fotogalérii dvakrát.");
    urls.push(url);
  }
  if (urls.length) next[DIRECTORY_BREEDER_GALLERY_KEY] = JSON.stringify(urls);
  else delete next[DIRECTORY_BREEDER_GALLERY_KEY];
  return next;
}
