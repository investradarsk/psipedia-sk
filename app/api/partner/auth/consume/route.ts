import {
  consumePartnerMagicLink,
  isPartnerAuthPublicError,
} from "@/lib/partner-auth";
import { assertPartnerJsonMutation } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const body = await request.json() as Record<string, unknown>;
    const result = await consumePartnerMagicLink({ token: body.token });
    return Response.json(
      { success: true, onboardingComplete: result.onboardingComplete },
      {
        status: 200,
        headers: {
          "Cache-Control": "private, no-store",
          "Set-Cookie": result.cookie,
        },
      },
    );
  } catch (error) {
    if (isPartnerAuthPublicError(error)) {
      const status = error.status >= 500 ? 503 : error.status;
      return Response.json(
        { error: status >= 500 ? "Prihlásenie momentálne nie je dostupné." : error.message },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(JSON.stringify({
      event: "partner_auth_consume",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json(
      { error: "Prihlásenie momentálne nie je dostupné." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
