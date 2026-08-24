export const SITE_NAME = "Psipedia.sk";
export const SITE_URL = "https://psipedia.sk";
export const SITE_DESCRIPTION =
  "Praktické a zrozumiteľné články o výcviku, zdraví, výžive a živote so psom.";

export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Keep document titles useful in search results without changing the visible
 * article heading. The root layout adds " | Psipedia.sk" afterwards.
 */
export function searchResultTitle(title: string, maxLength = 80) {
  const normalized = title.trim().replace(/\s+/g, " ");
  if (normalized.length <= maxLength) return normalized;

  const candidate = normalized.slice(0, maxLength + 1);
  const lastSpace = candidate.lastIndexOf(" ");
  const shortened = lastSpace >= Math.floor(maxLength * 0.7)
    ? candidate.slice(0, lastSpace)
    : normalized.slice(0, maxLength);

  return `${shortened.replace(/[\s,:;.!?–—-]+$/u, "")}…`;
}

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
