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

export function serializeJsonLd(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
