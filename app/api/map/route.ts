import { env } from "cloudflare:workers";
import {
  MAP_CACHE_STALE_SECONDS,
  MAP_CACHE_TTL_SECONDS,
  MapQueryValidationError,
  parseMapQuery,
} from "@/lib/map-contract";
import { MapGeoUnavailableError, queryPublicMap } from "@/lib/map-query";
import { createD1RateLimitStore, deriveRateLimitKey, enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

type MapRouteBindings = {
  DB?: D1Database;
  PII_HASH_KEY?: string;
};

const MAP_RATE_LIMIT = 180;
const MAP_RATE_WINDOW_SECONDS = 60;

function jsonHeaders(cache = false) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (cache) {
    headers.set("Cache-Control", `public, max-age=0, s-maxage=${MAP_CACHE_TTL_SECONDS}, stale-while-revalidate=${MAP_CACHE_STALE_SECONDS}`);
    headers.set("CDN-Cache-Control", `public, max-age=${MAP_CACHE_TTL_SECONDS}`);
  } else {
    headers.set("Cache-Control", "no-store");
  }
  return headers;
}

function clientIp(request: Request) {
  const direct = request.headers.get("cf-connecting-ip")?.trim();
  if (direct) return direct;
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
}

async function mapRateLimit(request: Request) {
  const bindings = env as unknown as MapRouteBindings;
  const ip = clientIp(request);
  if (!bindings.DB || !bindings.PII_HASH_KEY || !ip) return null;
  try {
    const key = await deriveRateLimitKey("public-map", ip, bindings.PII_HASH_KEY);
    return await enforceRateLimit(
      createD1RateLimitStore(bindings.DB),
      key,
      MAP_RATE_LIMIT,
      MAP_RATE_WINDOW_SECONDS,
    );
  } catch {
    console.warn(JSON.stringify({ event: "map_api_rate_limit", result: "unavailable" }));
    return null;
  }
}

export async function GET(request: Request) {
  const startedAt = performance.now();
  try {
    const rate = await mapRateLimit(request);
    if (rate && !rate.allowed) {
      const headers = jsonHeaders(false);
      headers.set("Retry-After", String(Math.max(1, Math.ceil((Date.parse(rate.resetAt) - Date.now()) / 1000))));
      console.warn(JSON.stringify({ event: "map_api_request", status: 429 }));
      return Response.json(
        { error: { code: "MAP_RATE_LIMITED", message: "Too many map requests." } },
        { status: 429, headers },
      );
    }

    const query = parseMapQuery(new URL(request.url).searchParams);
    const result = await queryPublicMap(query);
    console.info(JSON.stringify({
      event: "map_api_request",
      status: 200,
      mode: result.mode,
      count: result.meta.count,
      matched: result.meta.matched,
      truncated: result.meta.truncated,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    }));
    return Response.json(result, { status: 200, headers: jsonHeaders(true) });
  } catch (error) {
    if (error instanceof MapQueryValidationError) {
      console.warn(JSON.stringify({ event: "map_api_request", status: 400, code: error.code }));
      return Response.json(
        { error: { code: error.code, message: error.message } },
        { status: 400, headers: jsonHeaders(false) },
      );
    }
    if (error instanceof MapGeoUnavailableError) {
      console.error(JSON.stringify({ event: "map_api_request", status: 503, code: error.code }));
      return Response.json(
        { error: { code: error.code, message: "Map geo subsystem is not available in this environment." } },
        { status: 503, headers: jsonHeaders(false) },
      );
    }
    console.error(JSON.stringify({
      event: "map_api_request",
      status: 500,
      code: "MAP_QUERY_FAILED",
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    }));
    return Response.json(
      { error: { code: "MAP_QUERY_FAILED", message: "Map query failed." } },
      { status: 500, headers: jsonHeaders(false) },
    );
  }
}
