import {
  clearReviewAuthorSessionCookie,
  isReviewAuthorAuthPublicError,
  revokeReviewAuthorSession,
} from "@/lib/review-author-auth";
import { assertReviewAuthorJsonMutation } from "@/lib/review-author-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertReviewAuthorJsonMutation(request);
    await revokeReviewAuthorSession({ cookieHeader: request.headers.get("cookie") });
    return Response.json(
      { success: true },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": clearReviewAuthorSessionCookie(),
        },
      },
    );
  } catch (error) {
    if (isReviewAuthorAuthPublicError(error)) {
      return Response.json(
        { error: error.status >= 500 ? "Odhlásenie momentálne nie je dostupné." : error.message },
        { status: error.status >= 500 ? 503 : error.status },
      );
    }
    console.error(JSON.stringify({
      event: "review_author_auth_logout",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json({ error: "Odhlásenie momentálne nie je dostupné." }, { status: 503 });
  }
}
