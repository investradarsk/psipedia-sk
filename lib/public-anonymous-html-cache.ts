// Only these strictly public, cookie-free SSR surfaces may use a 45-second
// shared HTML response. Never generalize this list to /admin, /partner,
// review-author routes, personal dashboards, arbitrary nested routes or APIs.
const PUBLIC_DIRECTORY_CATEGORIES = new Set([
  "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
  "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie", "fyzioterapia", "dalsie-sluzby",
]);

export function isExplicitAnonymousHtmlRoute(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, "") || "/";
  if (path === "/" || path === "/clanky" || path === "/podujatia") return true;
  if (/^\/plemena(?:\/[a-z0-9-]+)?$/.test(path)) return true;
  if (path === "/adresar") return true;
  const match = /^\/adresar\/([a-z0-9-]+)$/.exec(path);
  return match !== null && PUBLIC_DIRECTORY_CATEGORIES.has(match[1]);
}

function forbiddenVariants(response: Response): boolean {
  if (response.headers.has("set-cookie")) return true;
  const vary = response.headers.get("vary");
  return Boolean(vary?.split(",").some((item) =>
    ["*", "cookie", "authorization", "cf-access-jwt-assertion"].includes(item.trim().toLowerCase())
  ));
}

/**
 * Next's dynamic SSR emits no-store globally because the root layout CAN read
 * partner cookies. For a request with no cookies or credentials the listed pages
 * render their anonymous public variant. This narrow exception MUST only run
 * after the Worker has excluded those credentials on the incoming request.
 * Private responses from any other route retain the original no-store policy.
 */
export function isExplicitAnonymousSsrHtml(response: Response, pathname: string): boolean {
  if (!isExplicitAnonymousHtmlRoute(pathname)) return false;
  if (response.status !== 200 || !(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) return false;
  if (forbiddenVariants(response)) return false;
  if (response.headers.has("x-robots-tag") && /noindex/i.test(response.headers.get("x-robots-tag") ?? "")) return false;
  const control = response.headers.get("cache-control");
  if (!control) return false;
  // Permit only Next SSR's well-known conservative directives; any unfamiliar
  // policy is a hard bypass, not an invitation to overwrite explicit privacy.
  const parts = control.toLowerCase().split(",").map((item) => item.trim()).filter(Boolean);
  if (!parts.includes("no-store") || parts.some((part) =>
    !["private", "no-store", "no-cache", "must-revalidate", "max-age=0"].includes(part)
  )) return false;
  for (const name of ["cdn-cache-control", "cloudflare-cdn-cache-control", "surrogate-control"]) {
    if (response.headers.has(name)) return false;
  }
  return !response.headers.has("pragma");
}
