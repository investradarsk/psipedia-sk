import { isInternalTrafficRequest } from "@/lib/internal-traffic";
import { recordQualifiedArticleRead } from "@/lib/article-popularity";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 512;
const ARTICLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function sameOriginRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  const referer = request.headers.get("referer");

  if (fetchSite === "cross-site") return false;
  if (origin && origin !== requestUrl.origin) return false;
  if (!origin && referer) {
    try {
      if (new URL(referer).origin !== requestUrl.origin) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return Response.json({ error: "Cross-site request rejected." }, { status: 403 });
  }
  if (isInternalTrafficRequest(request)) {
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/json")) {
    return Response.json({ error: "Invalid content type." }, { status: 415 });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  let raw = "";
  try {
    raw = await request.text();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large." }, { status: 413 });
  }

  let articleSlug: unknown;
  try {
    const payload = JSON.parse(raw) as { articleSlug?: unknown };
    articleSlug = payload.articleSlug;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (
    typeof articleSlug !== "string"
    || articleSlug.length < 1
    || articleSlug.length > 120
    || articleSlug !== articleSlug.trim().toLowerCase()
    || !ARTICLE_SLUG.test(articleSlug)
  ) {
    return Response.json({ error: "Invalid article slug." }, { status: 400 });
  }

  try {
    const result = await recordQualifiedArticleRead({ articleSlug });
    if (!result.recorded) {
      if (result.reason === "article_unavailable") {
        return Response.json({ error: "Article not available." }, { status: 404 });
      }
      return Response.json({ error: "Popularity storage unavailable." }, { status: 503 });
    }
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Article popularity write failed", {
      articleSlug,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Popularity storage unavailable." }, { status: 503 });
  }
}
