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

/** No GET endpoint. Anonymous aggregate pageviews need no cookie consent; identity tracking still does. */
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

  const hasVisitor = body.visitorToken !== undefined;
  const hasSession = body.sessionToken !== undefined;
  if (
    !isSafeSiteAnalyticsPath(body.path)
    || !validSiteTrafficSource(body.source)
    || hasVisitor !== hasSession
    || (hasVisitor && (typeof body.visitorToken !== "string"
      || !PROFILE_VISIT_TOKEN.test(body.visitorToken)))
    || (hasSession && (typeof body.sessionToken !== "string"
      || !PROFILE_VISIT_TOKEN.test(body.sessionToken)))
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
      visitorToken: hasVisitor ? body.visitorToken as string : undefined,
      sessionToken: hasSession ? body.sessionToken as string : undefined,
      source: body.source,
      userAgent: request.headers.get("user-agent") ?? "",
      database,
      hashKey,
    });
    if (!result.recorded) return fail("Štatistiky nie sú momentálne dostupné.", 503);

    // Stateless sampled maintenance: works for aggregate-only browser visits
    // without creating a visitor token, cookie or localStorage identifier.
    if (Math.random() < 1 / 64) {
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
