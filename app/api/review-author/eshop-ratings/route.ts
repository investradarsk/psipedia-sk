import { env } from "cloudflare:workers";
import {
  EshopRatingError,
  getEshopDatabase,
  normalizeEshopRating,
  upsertVerifiedEshopRating,
} from "@/lib/eshop-ratings";
import { requireReviewAuthor, ReviewAuthorAuthError } from "@/lib/review-author-auth";
import {
  assertReviewAuthorJsonMutation,
  enforceProfileReviewSubmissionRateLimits,
  ReviewAuthorSecurityError,
  verifyProfileReviewSubmissionTurnstile,
} from "@/lib/review-author-security";
import { profileReviewSubmissionEnabled } from "@/lib/submission-feature-flags";

export const dynamic = "force-dynamic";

type RuntimeBindings = { DB?: D1Database; TURNSTILE_SECRET_KEY?: string; PII_HASH_KEY?: string };

function required(value: string | undefined) {
  const clean = value?.trim();
  if (!clean) throw new EshopRatingError("Hodnotenie momentálne nie je dostupné.", 503, "SECURITY_CONFIGURATION");
  return clean;
}

function positiveId(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new EshopRatingError("E-shop nie je platný.", 400, "INVALID_ESHOP");
  return parsed;
}

function publicError(error: unknown) {
  if (error instanceof EshopRatingError) return { status: error.status, payload: { error: error.message, code: error.code, field: error.field } };
  if (error instanceof ReviewAuthorAuthError) return { status: error.status, payload: { error: error.message, code: "EMAIL_VERIFICATION_REQUIRED", field: null } };
  if (error instanceof ReviewAuthorSecurityError) return {
    status: error.status,
    payload: { error: error.message, code: error.status === 429 ? "RATE_LIMITED" : "SECURITY_CHECK_FAILED", field: error.status === 429 ? null : "turnstileToken" },
  };
  return null;
}

export async function POST(request: Request) {
  try {
    assertReviewAuthorJsonMutation(request);
    if (!profileReviewSubmissionEnabled()) throw new EshopRatingError("Hodnotenie e-shopov zatiaľ nie je verejne zapnuté.", 503, "SUBMISSION_DISABLED");

    const bindings = env as unknown as RuntimeBindings;
    const database = getEshopDatabase(bindings.DB);
    const reviewer = await requireReviewAuthor({ cookieHeader: request.headers.get("cookie"), database });

    let body: Record<string, unknown>;
    try { body = await request.json() as Record<string, unknown>; }
    catch { throw new EshopRatingError("Odoslané údaje nie sú platné.", 400, "INVALID_JSON"); }

    const eshopId = positiveId(body.eshopId);
    const ratings = normalizeEshopRating(body);
    const hashKey = required(bindings.PII_HASH_KEY);
    const turnstileSecret = required(bindings.TURNSTILE_SECRET_KEY);

    await enforceProfileReviewSubmissionRateLimits({ database, request, authorId: reviewer.authorId, hashKey });
    await verifyProfileReviewSubmissionTurnstile({
      database, request, token: typeof body.turnstileToken === "string" ? body.turnstileToken : "", secret: turnstileSecret,
    });

    const result = await upsertVerifiedEshopRating({ eshopId, authorId: reviewer.authorId, ratings, database });
    return Response.json({
      success: true,
      ratingId: result.id,
      created: result.created,
      message: result.created ? "Ďakujeme. Vaše hodnotenie bolo uložené." : "Vaše hodnotenie bolo aktualizované.",
    }, { status: result.created ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const known = publicError(error);
    if (known) return Response.json(known.payload, { status: known.status, headers: { "Cache-Control": "private, no-store" } });
    console.error(JSON.stringify({ event: "eshop_rating_submission", result: "failed", error: error instanceof Error ? error.name : "unknown_error" }));
    return Response.json({ error: "Hodnotenie sa momentálne nepodarilo uložiť.", code: "SUBMISSION_FAILED", field: null }, {
      status: 503, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
