import {
  consumeReviewAuthorMagicLink,
  isReviewAuthorAuthPublicError,
} from "@/lib/review-author-auth";
import { assertReviewAuthorJsonMutation } from "@/lib/review-author-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertReviewAuthorJsonMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await consumeReviewAuthorMagicLink({ request, token: body.token });
    return Response.json(
      { success: true },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": result.cookie,
        },
      },
    );
  } catch (error) {
    if (isReviewAuthorAuthPublicError(error)) {
      const status = error.status >= 500 ? 503 : error.status;
      return Response.json(
        { error: status >= 500 ? "Overenie odkazu momentálne nie je dostupné." : error.message },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(JSON.stringify({
      event: "review_author_auth_consume",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json(
      { error: "Overenie odkazu momentálne nie je dostupné." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
