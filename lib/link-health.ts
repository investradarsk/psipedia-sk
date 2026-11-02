/**
 * Shared public-link policy: never crawl admin, APIs or offsite pages.
 * Browser checks are intentionally user-triggered and request bounded.
 */
export const LINK_HEALTH_SEED_PATHS = Object.freeze([
  "/", "/clanky", "/plemena", "/adresar", "/podujatia", "/pomoc-psom",
] as const);
export const MAX_LINK_SOURCE_PAGES = 8;
export const MAX_LINK_TARGETS = 60;
export const LINK_CHECK_CONCURRENCY = 2;

const PRIVATE_PREFIXES = [
  "/admin", "/api", "/_next", "/_worker", "/hladat",
  "/login", "/logout", "/auth", "/oblubene", "/cdn-cgi",
];

function cleanPath(path: string) {
  return path.replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
}
export function isAllowedPublicPath(pathname: string): boolean {
  if (!pathname || !pathname.startsWith("/") || pathname.startsWith("//")) return false;
  if (pathname.length > 340 || /[\u0000-\u001f\u007f\\%]/.test(pathname)) return false;
  const path = cleanPath(pathname).toLowerCase();
  if (/(^|\/)\.{1,2}(\/|$)/.test(path) || path.startsWith("/.")) return false;
  if (/\.(?:pdf|zip|csv|xlsx?|docx?|mp4|mov|png|jpe?g|webp|gif|svg|woff2?|css|js|json|xml|txt)$/i.test(path)) return false;
  return !PRIVATE_PREFIXES.some(prefix => path === prefix || path.startsWith(prefix + "/"));
}
export function internalPublicUrl(rawHref: unknown, origin: string): string | null {
  if (typeof rawHref !== "string" || !rawHref.trim() || rawHref.length > 900) return null;
  const href = rawHref.trim();
  if (href.startsWith("#") || /^(?:javascript|data|mailto|tel|sms|blob):/i.test(href)) return null;
  try {
    const base = new URL(origin);
    const candidate = new URL(href, base);
    if (candidate.origin !== base.origin || !["http:", "https:"].includes(candidate.protocol)) return null;
    if (!isAllowedPublicPath(candidate.pathname)) return null;
    candidate.hash = "";
    candidate.search = ""; // avoid tokens and parameter-triggered page variants
    candidate.pathname = cleanPath(candidate.pathname);
    return candidate.toString();
  } catch {
    return null;
  }
}
export type LinkCheckState = "ok" | "broken" | "server-error" | "unverified";
export function classifyPublicLink(status: number | null): LinkCheckState {
  if (status === 404 || status === 410) return "broken";
  if (status !== null && status >= 500 && status <= 599) return "server-error";
  if (status !== null && status >= 200 && status <= 399) return "ok";
  return "unverified"; // includes 401, 403, 405, 429, timeout and bot blocks
}
export function uniquePublicLinks(hrefs: readonly string[], origin: string, limit = MAX_LINK_TARGETS): string[] {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > MAX_LINK_TARGETS) throw new Error("Invalid link budget.");
  const urls = new Set<string>();
  if (limit === 0) return [];
  for (const href of hrefs) {
    const url = internalPublicUrl(href, origin);
    if (url) urls.add(url);
    if (urls.size >= limit) break;
  }
  return [...urls];
}
