/** Narrow, public-only guards for qualified profile-view POST requests. */

const CRAWLER_USER_AGENT = /(?:bot|crawl|spider|slurp|facebookexternalhit|lighthouse|headless|phantomjs|python|curl\/|wget\/|httpclient|axios|node-fetch|gptbot|chatgpt-user|oai-searchbot|semrush|ahrefs|uptimerobot|pingdom)/i;
export const PROFILE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const PROFILE_VISIT_TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isLikelyCrawlerRequest(request: Request) {
  const cloudflare = (request as Request & {
    cf?: { botManagement?: { verifiedBot?: boolean; score?: number } };
  }).cf?.botManagement;
  if (cloudflare?.verifiedBot === true) return true;
  if (typeof cloudflare?.score === "number" && cloudflare.score < 10) return true;

  const agent = request.headers.get("user-agent")?.trim() ?? "";
  return !agent || !agent.startsWith("Mozilla/") || CRAWLER_USER_AGENT.test(agent);
}

export function hasTrustedProfileViewOrigin(request: Request, profileSlug: string) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const referer = request.headers.get("referer");
  const target = new URL(request.url);

  // The tracker is a same-origin browser fetch: require its Origin.
  if (origin !== target.origin) return false;
  if (fetchSite && fetchSite !== "same-origin") return false;

  // In browsers that provide a Referer, it must point to this exact
  // public profile slug (an additional category may use a different path).
  if (referer) {
    try {
      const source = new URL(referer);
      if (source.origin !== target.origin) return false;
      const segments = source.pathname.split("/").filter(Boolean);
      if (segments.length !== 3 || segments[0] !== "adresar"
        || !PROFILE_SLUG.test(segments[1])
        || segments[2] !== profileSlug) return false;
    } catch {
      return false;
    }
  }
  return true;
}
