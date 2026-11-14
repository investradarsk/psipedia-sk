import {
  DIRECTORY_BREEDER_GALLERY_KEY,
  DIRECTORY_BREEDER_GALLERY_LIMIT,
  readDirectoryBreederGallery,
} from "./directory-breeder-gallery";

export const PROFILE_GALLERY_KEY = "_psipedia_profile_gallery_urls";
export const PROFILE_GALLERY_LIMIT = DIRECTORY_BREEDER_GALLERY_LIMIT;

export function validProfileGalleryUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  if (!url || url.length > 2048) return false;
  if (/^\/(media|images)\/[^\s?#]+(?:\?[^\s#]*)?$/.test(url)) return true;
  try {
    const parsed = new URL(url);
    return ["https:", "http:"].includes(parsed.protocol) && Boolean(parsed.hostname) &&
      !parsed.username && !parsed.password;
  } catch { return false; }
}

export function normalizeProfileGalleryUrls(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > PROFILE_GALLERY_LIMIT) {
    throw new Error(`Galéria môže obsahovať najviac ${PROFILE_GALLERY_LIMIT} fotografií.`);
  }
  const urls: string[] = [];
  for (const raw of value) {
    if (!validProfileGalleryUrl(raw)) throw new Error("Neplatná adresa fotografie galérie.");
    const url = raw.trim();
    if (urls.includes(url)) throw new Error("Fotografia je v galérii dvakrát.");
    urls.push(url);
  }
  return urls;
}

export function readProfileGallery(
  data: Record<string, unknown> | null | undefined,
  directoryCategory?: string | null,
): string[] {
  if (directoryCategory === "chovatelske-stanice" && data?.[DIRECTORY_BREEDER_GALLERY_KEY] !== undefined) {
    return readDirectoryBreederGallery(data);
  }
  const raw = data?.[PROFILE_GALLERY_KEY];
  if (typeof raw !== "string") return [];
  try { return normalizeProfileGalleryUrls(JSON.parse(raw)); }
  catch { return []; }
}

export function mergeProfileGallery(
  source: Record<string, string | number | null>,
  proposed: unknown,
  directoryCategory?: string | null,
): Record<string, string | number | null> {
  if (proposed === undefined) return source;
  const urls = normalizeProfileGalleryUrls(proposed);
  const key = directoryCategory === "chovatelske-stanice"
    ? DIRECTORY_BREEDER_GALLERY_KEY : PROFILE_GALLERY_KEY;
  const next = { ...source };
  if (urls.length) next[key] = JSON.stringify(urls);
  else delete next[key];
  return next;
}
