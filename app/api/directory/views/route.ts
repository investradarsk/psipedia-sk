import { env } from "cloudflare:workers";
import { recordQualifiedDirectoryProfileView } from "@/lib/content-analytics";
import { isInternalTrafficRequest } from "@/lib/internal-traffic";
import {
  hasTrustedProfileViewOrigin,
  isLikelyCrawlerRequest,
  PROFILE_SLUG,
  PROFILE_VISIT_TOKEN,
} from "@/lib/profile-view-security";
import { createD1RateLimitStore, deriveRateLimitKey, enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512;
const PROFILE_COOLDOWN_SECONDS = 6 * 60 * 60;
const IP_RATE_WINDOW_SECONDS = 60;
const IP_RATE_LIMIT = 120;
const NO_STORE = { "Cache-Control": "private, no-store" };

type AnalyticsBindings = { DB?: D1Database; PII_HASH_KEY?: string };

function error(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

/**
 * A same-origin analytics write is neither a page render nor a public stats API.
 * Use the existing D1 rate limiter and secret-keyed HMAC: never persist raw
 * IP addresses or a reusable cross-profile browser identifier.
 */
export async function POST(request: Request) {
  if (isInternalTrafficRequest(request) || isLikelyCrawlerRequest(request)) {
    return new Response(null, { status: 204, headers: NO_STORE });
  }

  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return error("Neplatný formát požiadavky.", 415);
  }

  const length = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    return error("Príliš veľká požiadavka.", 413);
  }

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return error("Neplatná požiadavka.", 400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return error("Príliš veľká požiadavka.", 413);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return error("Neplatný JSON.", 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return error("Neplatná požiadavka.", 400);
  }
  const { profileId, profileSlug, visitToken } = payload as Record<string, unknown>;
  if (
    typeof profileId !== "number"
    || !Number.isSafeInteger(profileId)
    || profileId <= 0
    || typeof profileSlug !== "string"
    || profileSlug.length > 120
    || !PROFILE_SLUG.test(profileSlug)
    || typeof visitToken !== "string"
    || !PROFILE_VISIT_TOKEN.test(visitToken)
  ) {
    return error("Neplatný identifikátor profilu alebo návštevy.", 400);
  }

  if (!hasTrustedProfileViewOrigin(request, profileSlug)) {
    return error("Cudzia požiadavka bola zablokovaná.", 403);
  }

  const bindings = env as unknown as AnalyticsBindings;
  if (!bindings.DB || typeof bindings.DB.prepare !== "function" || !bindings.PII_HASH_KEY) {
    return error("Štatistiky nie sú momentálne dostupné.", 503);
  }

  try {
    const rateStore = createD1RateLimitStore(bindings.DB);

    // IP cap catches token rotation and high-volume scripting; the key is HMAC,
    // not the raw IP. Do not trust arbitrary X-Forwarded-For client headers.
    const ip = request.headers.get("cf-connecting-ip")?.trim();
    if (ip) {
      const ipKey = await deriveRateLimitKey("public-profile-view-ip", ip, bindings.PII_HASH_KEY);
      const cap = await enforceRateLimit(rateStore, ipKey, IP_RATE_LIMIT, IP_RATE_WINDOW_SECONDS);
      if (!cap.allowed) return error("Príliš veľa požiadaviek.", 429);
    }

    // Confirm canonical identity and publication state BEFORE reserving a
    // dedupe key; preview, draft, archived and nonexistent profiles never count.
    const profile = await bindings.DB.prepare(`
      SELECT slug FROM directory_profiles
      WHERE id = ? AND status = 'published'
      LIMIT 1
    `).bind(profileId).first<{ slug: string }>();

    if (!profile || profile.slug !== profileSlug) {
      return error("Profil nie je dostupný.", 404);
    }

    // Server-side six-hour dedupe is an atomic reuse of the existing security
    // rate-limit table. Fresh short-lived random tokens are scoped per profile.
    const tokenKey = await deriveRateLimitKey(
      "public-profile-view-event",
      `${profileId}:${visitToken}`,
      bindings.PII_HASH_KEY,
    );
    const seen = await enforceRateLimit(rateStore, tokenKey, 1, PROFILE_COOLDOWN_SECONDS);
    if (!seen.allowed) return new Response(null, { status: 204, headers: NO_STORE });

    const result = await recordQualifiedDirectoryProfileView({
      profileId,
      database: bindings.DB,
    });
    if (!result.recorded) {
      return error(
        result.reason === "profile_unavailable" ? "Profil nie je dostupný." : "Štatistiky nie sú momentálne dostupné.",
        result.reason === "profile_unavailable" ? 404 : 503,
      );
    }
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (cause) {
    console.error("Directory profile view tracking failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return error("Štatistiky nie sú momentálne dostupné.", 503);
  }
}
