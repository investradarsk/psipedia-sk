import {
  clearPartnerSessionCookie,
  isPartnerAuthPublicError,
  revokePartnerSession,
} from "@/lib/partner-auth";
import { assertPartnerJsonMutation } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    await revokePartnerSession({ cookieHeader: request.headers.get("cookie") });
    return Response.json(
      { success: true },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": clearPartnerSessionCookie(),
        },
      },
    );
  } catch (error) {
    if (isPartnerAuthPublicError(error)) {
      return Response.json(
        { error: error.status >= 500 ? "Odhlásenie momentálne nie je dostupné." : error.message },
        { status: error.status >= 500 ? 503 : error.status },
      );
    }
    console.error(JSON.stringify({
      event: "partner_auth_logout",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json({ error: "Odhlásenie momentálne nie je dostupné." }, { status: 503 });
  }
}
