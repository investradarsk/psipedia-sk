import { env } from "cloudflare:workers";
import { isLikelyCrawlerRequest } from "@/lib/profile-view-security";
import { recordSitePageView } from "@/lib/site-analytics";
import { isSafeSiteAnalyticsPath } from "@/lib/site-analytics-public";

export const dynamic = "force-dynamic";

type Bindings = { DB?: D1Database; SITE_ANALYTICS_ENABLED?: string };
const NO_STORE = { "Cache-Control": "private, no-store" };
const MAX_BYTES = 256;

function fail(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/**
 * Aggregate-only public counter: accepts exactly {"path":"/public-route"}.
 * No IP address, visitor token, cookie, referrer, source or device is read
 * into analytics storage; no individual visitor records exist.
 */
export async function POST(request: Request) {
  const bindings = env as unknown as Bindings;
  if (bindings.SITE_ANALYTICS_ENABLED !== "true") {
    return new Response(null, { status: 204, headers: NO_STORE });
  }
  if (isLikelyCrawlerRequest(request)) {
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  const origin = new URL(request.url).origin;
  if (
    request.headers.get("origin") !== origin
    || (request.headers.get("sec-fetch-site")
      && request.headers.get("sec-fetch-site") !== "same-origin")
  ) {
    return fail("Cudzia požiadavka bola zablokovaná.", 403);
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return fail("Neplatný formát požiadavky.", 415);
  }
  if (Number(request.headers.get("content-length") ?? "0") > MAX_BYTES) {
    return fail("Príliš veľká požiadavka.", 413);
  }

  let path: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) {
      return fail("Príliš veľká požiadavka.", 413);
    }
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)
      || Object.keys(body).length !== 1 || !Object.hasOwn(body, "path")) {
      return fail("Očakáva sa iba cesta stránky.", 400);
    }
    path = (body as { path: unknown }).path;
  } catch {
    return fail("Neplatné údaje.", 400);
  }
  if (!isSafeSiteAnalyticsPath(path)) {
    return fail("Neplatná cesta stránky.", 400);
  }
  if (!bindings.DB || typeof bindings.DB.batch !== "function") {
    return fail("Štatistiky nie sú momentálne dostupné.", 503);
  }

  const result = await recordSitePageView({ path, database: bindings.DB });
  if (!result.recorded) return fail("Štatistiky nie sú momentálne dostupné.", 503);
  return new Response(null, { status: 204, headers: NO_STORE });
}
