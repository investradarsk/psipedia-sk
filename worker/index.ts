import { canonicalBreedRedirect } from "../lib/breed-canonical";
/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  BUCKET: R2Bucket;
  ADMIN_EMAILS?: string;
  AUTH_MODE?: "cloudflare-access";
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

type AccessJwtHeader = {
  alg?: string;
  kid?: string;
};

type AccessJwtPayload = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  name?: string;
  nbf?: number;
};

type AccessJwk = JsonWebKey & { kid?: string };
type CachedAccessJwks = { expiresAt: number; keys: AccessJwk[] };

const ACCESS_JWKS_TTL_MS = 5 * 60 * 1000;
const accessJwksCache = new Map<string, CachedAccessJwks>();

const ADMIN_AUTH_PATHS = ["/admin", "/api/admin"];
const ADMIN_AUTHORIZED_HEADER = "x-psipedia-admin-authorized";
const AUTH_PROVIDER_HEADER = "x-psipedia-auth-provider";
const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const PERCENT_ENCODED_UTF8 = "percent-encoded-utf-8";
const LEGACY_BREED_REDIRECTS: Readonly<Record<string, string>> = {
  "/plemena/anglicky-koker-spaniel": "/plemena/anglicky-kokerspaniel",
  "/plemena/beagle": "/plemena/bigl",
  "/plemena/madarska-vyzla": "/plemena/madarsky-kratkosrsty-stavac-vyzla",
};
const PUBLIC_HTML_CACHE_TTL_SECONDS = 45;

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const canonicalBreedPath = LEGACY_BREED_REDIRECTS[url.pathname];
    if (canonicalBreedPath) {
      url.pathname = canonicalBreedPath;
      return Response.redirect(url, 301);
    }

    const cache = publicHtmlCache(request, url);
    if (cache) {
      const cached = await cache.storage.match(cache.key);
      if (cached) return responseWithHeader(cached, "X-Psipedia-Cache", "HIT");
    }

    const breedMatch=url.pathname.match(/^\/plemena\/([a-z0-9-]+)$/);
    if(breedMatch&&env.DB){
      const target=await canonicalBreedRedirect(env.DB,breedMatch[1]);
      if(target){url.pathname=target;return Response.redirect(url,301);}
    }

    let appRequest = request;
    if (env.AUTH_MODE === "cloudflare-access" && isAdminAuthPath(url.pathname)) {
      if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
        return new Response("Cloudflare Access nie je nakonfigurovaný.", { status: 503 });
      }

      const identity = await verifyAccessIdentity(request, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
      if (!identity) {
        return new Response("Prístup do redakcie vyžaduje prihlásenie cez Cloudflare Access.", { status: 403 });
      }
      const headers = new Headers(request.headers);
      // These headers are internal trust signals. Discard any client-supplied
      // values before adding identity derived from the verified Access JWT.
      headers.delete(ADMIN_AUTHORIZED_HEADER);
      headers.delete(AUTH_PROVIDER_HEADER);
      headers.delete(USER_EMAIL_HEADER);
      headers.delete(USER_FULL_NAME_HEADER);
      headers.delete(USER_FULL_NAME_ENCODING_HEADER);
      headers.set(ADMIN_AUTHORIZED_HEADER, "1");
      headers.set(USER_EMAIL_HEADER, identity.email);
      headers.set(AUTH_PROVIDER_HEADER, "cloudflare-access");
      if (identity.name) {
        headers.set(USER_FULL_NAME_HEADER, encodeURIComponent(identity.name));
        headers.set(USER_FULL_NAME_ENCODING_HEADER, PERCENT_ENCODED_UTF8);
      }
      appRequest = new Request(request, { headers });
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(appRequest, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, appRequest.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(appRequest, env, ctx);
    if (isAdminAuthPath(url.pathname) || url.pathname.startsWith("/api/")) {
      return responseWithHeader(response, "Cache-Control", "private, no-store");
    }
    if (!cache || !isCacheableHtmlResponse(response)) return response;

    const cacheable = responseWithHeaders(response, {
      "Cache-Control": `public, max-age=0, s-maxage=${PUBLIC_HTML_CACHE_TTL_SECONDS}, stale-while-revalidate=30`,
      "CDN-Cache-Control": `public, max-age=${PUBLIC_HTML_CACHE_TTL_SECONDS}`,
      "X-Psipedia-Cache": "MISS",
    });
    ctx.waitUntil(cache.storage.put(cache.key, cacheable.clone()));
    return cacheable;
  },
};

function publicHtmlCache(request: Request, url: URL): { storage: Cache; key: Request } | null {
  if (request.method !== "GET" || url.search || isAdminAuthPath(url.pathname)) return null;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/") || url.pathname.startsWith("/_")) return null;
  if (request.headers.has("authorization") || request.headers.has("cookie") || request.headers.has("cf-access-jwt-assertion")) return null;
  const accept = request.headers.get("accept") ?? "";
  if (accept && !accept.includes("text/html") && !accept.includes("*/*")) return null;
  const storage = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  return storage ? { storage, key: new Request(url.toString(), { method: "GET" }) } : null;
}

function isCacheableHtmlResponse(response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  return response.status === 200
    && contentType.includes("text/html")
    && !response.headers.has("set-cookie");
}

function responseWithHeader(response: Response, name: string, value: string): Response {
  return responseWithHeaders(response, { [name]: value });
}

function responseWithHeaders(response: Response, values: Record<string, string>): Response {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(values)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isAdminAuthPath(pathname: string): boolean {
  return ADMIN_AUTH_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

async function verifyAccessIdentity(
  request: Request,
  configuredTeamDomain: string,
  expectedAudience: string,
): Promise<{ email: string; name: string | null } | null> {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) return null;

  const teamDomain = normalizeAccessTeamDomain(configuredTeamDomain);
  if (!teamDomain) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodeJwtPart<AccessJwtHeader>(parts[0]);
    const payload = decodeJwtPart<AccessJwtPayload>(parts[1]);
    if (header.alg !== "RS256" || !header.kid || !payload.email) return null;

    const now = Math.floor(Date.now() / 1000);
    const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!audiences.includes(expectedAudience)) return null;
    if (payload.iss !== teamDomain.origin) return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (typeof payload.nbf === "number" && payload.nbf > now) return null;

    let keys = await getAccessJwks(teamDomain);
    let jwk = keys.find((candidate): candidate is AccessJwk =>
      isAccessJwk(candidate) && candidate.kid === header.kid,
    );
    if (!jwk) {
      keys = await getAccessJwks(teamDomain, true);
      jwk = keys.find((candidate): candidate is AccessJwk =>
        isAccessJwk(candidate) && candidate.kid === header.kid,
      );
    }
    if (!jwk) return null;

    const publicKey = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = decodeBase64Url(parts[2]);
    const signedData = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", publicKey, signature, signedData);
    if (!valid) return null;

    return {
      email: payload.email.trim().toLowerCase(),
      name: typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : null,
    };
  } catch (error) {
    console.error(JSON.stringify({
      message: "Cloudflare Access JWT verification failed",
      error: error instanceof Error ? error.message : String(error),
    }));
    return null;
  }
}

async function getAccessJwks(teamDomain: URL, forceRefresh = false): Promise<AccessJwk[]> {
  const cacheKey = teamDomain.origin;
  const cached = accessJwksCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.keys;

  const certsResponse = await fetch(new URL("/cdn-cgi/access/certs", teamDomain), {
    headers: { Accept: "application/json" },
  });
  if (!certsResponse.ok) return [];

  const jwks: unknown = await certsResponse.json();
  if (!isRecord(jwks) || !Array.isArray(jwks.keys)) return [];
  const keys = jwks.keys.filter(isAccessJwk);
  accessJwksCache.set(cacheKey, { expiresAt: Date.now() + ACCESS_JWKS_TTL_MS, keys });
  return keys;
}

function normalizeAccessTeamDomain(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    if (!url.hostname.endsWith(".cloudflareaccess.com")) return null;
    if (url.username || url.password || url.port || (url.pathname !== "/" && url.pathname !== "")) return null;
    return new URL(url.origin);
  } catch {
    return null;
  }
}

function decodeJwtPart<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function decodeBase64Url(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAccessJwk(value: unknown): value is AccessJwk {
  return isRecord(value) && typeof value.kty === "string" && typeof value.kid === "string";
}

export default worker;
