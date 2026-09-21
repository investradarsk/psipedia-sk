import {
  PARTNER_AUTH_GENERIC_RESPONSE,
  isPartnerAuthPublicError,
  requestPartnerMagicLink,
} from "@/lib/partner-auth";
import { assertPartnerJsonMutation } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await requestPartnerMagicLink({
      request,
      email: body.email,
      turnstileToken: body.turnstileToken,
    });
    return Response.json(result, {
      status: 202,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (isPartnerAuthPublicError(error)) {
      const publicMessage = error.status >= 500
        ? "Partner prihlásenie momentálne nie je dostupné."
        : error.message;
      return Response.json({ error: publicMessage }, {
        status: error.status,
        headers: { "Cache-Control": "private, no-store" },
      });
    }
    console.error(JSON.stringify({
      event: "partner_auth_request",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json(
      { error: "Partner prihlásenie momentálne nie je dostupné.", message: PARTNER_AUTH_GENERIC_RESPONSE },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
