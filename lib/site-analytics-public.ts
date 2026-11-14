/** Browser-safe bounded inputs for self-hosted analytics. */
export const SITE_SOURCES = [
  "direct", "google", "bing", "other-search", "facebook", "instagram",
  "tiktok", "youtube", "other-social", "referral",
] as const;
export type SiteTrafficSource = (typeof SITE_SOURCES)[number];
export type SiteTrafficDevice = "mobile" | "tablet" | "desktop";

export function isSafeSiteAnalyticsPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length > 220 || !/^\/[A-Za-z0-9%._~/-]*$/.test(path)) {
    return false;
  }
  if (path.includes("//") || path.split("/").some((part) => part === ".." || part === ".")) return false;
  if (/\/%2f|\/%5c/i.test(path)) return false;
  const first = path.split("/")[1]?.toLowerCase() ?? "";
  return !["admin", "partner", "api", "_next", "recenzia", "favicon.ico"].includes(first);
}

export function classifySiteTrafficSource(referrer: string, siteOrigin = "https://psipedia.sk"): SiteTrafficSource {
  if (!referrer) return "direct";
  let host: string;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "direct";
    if (url.origin === siteOrigin) return "direct";
    host = url.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "direct";
  }
  const domain = (candidate: string) => host === candidate || host.endsWith("." + candidate);
  if (domain("google.com") || /^google\.[a-z.]{2,12}$/.test(host)) return "google";
  if (domain("bing.com")) return "bing";
  if (domain("facebook.com") || domain("fb.com") || domain("l.facebook.com")) return "facebook";
  if (domain("instagram.com")) return "instagram";
  if (domain("tiktok.com")) return "tiktok";
  if (domain("youtube.com") || domain("youtu.be")) return "youtube";
  if (["duckduckgo.com", "yahoo.com", "ecosia.org", "seznam.cz"].some(domain)) {
    return "other-search";
  }
  if (["x.com", "twitter.com", "linkedin.com", "pinterest.com", "reddit.com"].some(domain)) {
    return "other-social";
  }
  return "referral";
}

export function classifySiteTrafficDevice(agent: string): SiteTrafficDevice {
  if (/ipad|tablet|kindle|silk|playbook/i.test(agent)) return "tablet";
  if (/mobile|iphone|ipod|android/i.test(agent)) return "mobile";
  return "desktop";
}

export function validSiteTrafficSource(source: unknown): source is SiteTrafficSource {
  return typeof source === "string" && (SITE_SOURCES as readonly string[]).includes(source);
}
