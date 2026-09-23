import { env } from "cloudflare:workers";
import {
  createPendingProfileReview,
  getProfileReviewSubmissionDatabase,
  normalizeProfileReviewSubmission,
  ProfileReviewSubmissionError,
  requireProfileReviewSubmissionReviewer,
  resolveProfileReviewSubmissionTarget,
} from "@/lib/profile-review-submission";
import {
  assertReviewAuthorJsonMutation,
  enforceProfileReviewSubmissionRateLimits,
  ReviewAuthorSecurityError,
  verifyProfileReviewSubmissionTurnstile,
} from "@/lib/review-author-security";
import { profileReviewSubmissionEnabled } from "@/lib/submission-feature-flags";

export const dynamic = "force-dynamic";

type RuntimeBindings = {
  DB?: D1Database;
  TURNSTILE_SECRET_KEY?: string;
  PII_HASH_KEY?: string;
};

function requiredBinding(value: string | undefined) {
  const clean = value?.trim();
  if (!clean) throw new ProfileReviewSubmissionError("Odoslanie recenzie momentálne nie je dostupné.", 503, "SECURITY_CONFIGURATION");
  return clean;
}

function publicError(error: unknown) {
  if (error instanceof ProfileReviewSubmissionError) {
    return {
      status: error.status,
      payload: { error: error.message, code: error.code, field: error.field },
    };
  }
  if (error instanceof ReviewAuthorSecurityError) {
    return {
      status: error.status,
      payload: {
        error: error.message,
        code: error.status === 429 ? "RATE_LIMITED" : "SECURITY_CHECK_FAILED",
        field: error.status === 429 ? null : "turnstileToken",
      },
    };
  }
  return null;
}

export async function POST(request: Request) {
  try {
    assertReviewAuthorJsonMutation(request);

    if (!profileReviewSubmissionEnabled()) {
      throw new ProfileReviewSubmissionError(
        "Možnosť odoslať profilovú recenziu zatiaľ nie je verejne zapnutá.",
        503,
        "SUBMISSION_DISABLED",
      );
    }

    const bindings = env as unknown as RuntimeBindings;
    const database = getProfileReviewSubmissionDatabase(bindings.DB);
    const reviewer = await requireProfileReviewSubmissionReviewer({
      cookieHeader: request.headers.get("cookie"),
      database,
    });

    let body: Record<string, unknown>;
    try {
      body = await request.json() as Record<string, unknown>;
    } catch {
      throw new ProfileReviewSubmissionError("Odoslané údaje nie sú platné.", 400, "INVALID_JSON");
    }

    const target = await resolveProfileReviewSubmissionTarget(body.resourceId, database);
    const hashKey = requiredBinding(bindings.PII_HASH_KEY);
    const turnstileSecret = requiredBinding(bindings.TURNSTILE_SECRET_KEY);

    await enforceProfileReviewSubmissionRateLimits({
      database,
      request,
      authorId: reviewer.authorId,
      hashKey,
    });

    await verifyProfileReviewSubmissionTurnstile({
      database,
      request,
      token: typeof body.turnstileToken === "string" ? body.turnstileToken : "",
      secret: turnstileSecret,
    });

    const normalized = normalizeProfileReviewSubmission({
      target,
      overallRating: body.overallRating,
      body: body.body,
      serviceMonth: body.serviceMonth,
      ratingSchemaVersion: body.ratingSchemaVersion,
      dimensions: body.dimensions,
    });

    const result = await createPendingProfileReview({
      request,
      reviewer,
      target,
      normalized,
      database,
    });

    return Response.json({
      success: true,
      reviewId: result.reviewId,
      status: result.status,
      profileHref: result.profileHref,
      message: "Ďakujeme za recenziu. Po kontrole ju môžeme zverejniť na profile.",
    }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const known = publicError(error);
    if (known) {
      return Response.json(known.payload, {
        status: known.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }

    console.error(JSON.stringify({
      event: "profile_review_submission",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json({
      error: "Recenziu sa momentálne nepodarilo odoslať.",
      code: "SUBMISSION_FAILED",
      field: null,
    }, {
      status: 503,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
