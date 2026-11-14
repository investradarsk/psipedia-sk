import { env } from "cloudflare:workers";
import { isInternalTrafficRequest } from "@/lib/internal-traffic";
import { PROFILE_VISIT_TOKEN, isLikelyCrawlerRequest } from "@/lib/profile-view-security";
import { createD1RateLimitStore, deriveRateLimitKey, enforceRateLimit } from "@/lib/rate-limit";
import { pruneSiteAnalyticsIdentityRows, recordSitePageView } from "@/lib/site-analytics";
import { isSafeSiteAnalyticsPath, validSiteTrafficSource } from "@/lib/site-analytics-public";

export const dynamic = "force-dynamic";

type Bindings = { DB?: D1Database; PII_HASH_KEY?: string };
const MAX_BYTES = 700;
const NO_STORE = { "Cache-Control": "private, no-store" };

function fail(error: string, status: number) {
  return Response.json({ error }, { status, headers: NO_STORE });
}

/** No GET endpoint or public read API. Only same-origin, opted-in browser POSTs. */
export async function POST(request: Request) {
  if (isInternalTrafficRequest(request) || isLikelyCrawlerRequest(request)) {
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  const target = new URL(request.url);
  if (
    request.headers.get("origin") !== target.origin
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

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) return fail("Príliš veľká požiadavka.", 413);
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Neplatné údaje.", 400);
  }

  if (
    !isSafeSiteAnalyticsPath(body.path)
    || typeof body.visitorToken !== "string"
    || !PROFILE_VISIT_TOKEN.test(body.visitorToken)
    || typeof body.sessionToken !== "string"
    || !PROFILE_VISIT_TOKEN.test(body.sessionToken)
    || !validSiteTrafficSource(body.source)
  ) {
    return fail("Neplatné údaje návštevy.", 400);
  }

  const database = (env as unknown as Bindings).DB;
  const hashKey = (env as unknown as Bindings).PII_HASH_KEY;
  if (!database || typeof database.prepare !== "function" || !hashKey) {
    return fail("Štatistiky nie sú momentálne dostupné.", 503);
  }

  const ip = request.headers.get("cf-connecting-ip")?.trim();
  if (!ip) return fail("Požiadavku nie je možné overiť.", 403);

  try {
    const ipKey = await deriveRateLimitKey("site-traffic-ip", ip, hashKey);
    const limit = await enforceRateLimit(createD1RateLimitStore(database), ipKey, 120, 60);
    if (!limit.allowed) return fail("Príliš veľa požiadaviek.", 429);

    const result = await recordSitePageView({
      path: body.path,
      visitorToken: body.visitorToken,
      sessionToken: body.sessionToken,
      source: body.source,
      userAgent: request.headers.get("user-agent") ?? "",
      database,
      hashKey,
    });
    if (!result.recorded) return fail("Štatistiky nie sú momentálne dostupné.", 503);

    // Sampling is driven by the random per-session token. Retention is bounded
    // and best-effort, independent of the success of the pageview.
    if (Number.parseInt(body.sessionToken.slice(-2), 16) % 64 === 17) {
      try { await pruneSiteAnalyticsIdentityRows(database); }
      catch { console.warn("Site analytics expiry maintenance deferred"); }
    }
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (cause) {
    console.error("Site analytics request failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return fail("Štatistiky nie sú momentálne dostupné.", 503);
  }
}
