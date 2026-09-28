import {
  clearPartnerSessionCookie,
  deactivateCurrentPartnerAccount,
  isPartnerAuthPublicError,
} from "@/lib/partner-auth";
import { assertPartnerJsonMutation } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const body = await request.json() as Record<string, unknown>;
    await deactivateCurrentPartnerAccount({
      request,
      turnstileToken: body.turnstileToken,
    });
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
      const status = error.status >= 500 ? 503 : error.status;
      return Response.json(
        { error: status >= 500 ? "Deaktivácia momentálne nie je dostupná." : error.message },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    console.error(JSON.stringify({
      event: "partner_account_deactivate",
      result: "failed",
      error: error instanceof Error ? error.name : "unknown_error",
    }));
    return Response.json(
      { error: "Deaktivácia momentálne nie je dostupná." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
