import {
  REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE,
  isReviewAuthorAuthPublicError,
  requestReviewAuthorMagicLink,
} from "@/lib/review-author-auth";
import { assertReviewAuthorJsonMutation } from "@/lib/review-author-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertReviewAuthorJsonMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await requestReviewAuthorMagicLink({
      request,
      email: body.email,
      turnstileToken: body.turnstileToken,
      returnTo: body.returnTo,
    });
    return Response.json(result, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (isReviewAuthorAuthPublicError(error)) {
      const publicMessage = error.status >= 500
        ? "Overenie e-mailu momentálne nie je dostupné."
        : error.message;
      return Response.json({ error: publicMessage }, {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    console.error(JSON.stringify({
      event: "review_author_auth_request",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json(
      { error: "Overenie e-mailu momentálne nie je dostupné.", message: REVIEW_AUTHOR_AUTH_GENERIC_RESPONSE },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
