import {
  isPartnerPasswordAuthPublicError,
  requireCurrentPartnerSessionToken,
  updatePartnerPassword,
} from "@/lib/partner-password-auth";
import { requirePartnerAccount } from "@/lib/partner-auth";
import { assertPartnerJsonMutation } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (isPartnerPasswordAuthPublicError(error)) {
    const status = error.status >= 500 ? 503 : error.status;
    return Response.json(
      { error: status >= 500 ? "Partner prihlásenie momentálne nie je dostupné." : error.message },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  console.error(JSON.stringify({
    event: "partner_password_auth",
    result: "failed",
    error: error instanceof Error ? error.name : "unknown_error",
  }));
  return Response.json(
    { error: "Partner prihlásenie momentálne nie je dostupné." },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const cookieHeader = request.headers.get("cookie");
    const identity = await requirePartnerAccount({ cookieHeader, allowIncompleteOnboarding: true });
    const currentSessionToken = requireCurrentPartnerSessionToken(cookieHeader);
    const body = await request.json() as Record<string, unknown>;
    const result = await updatePartnerPassword({
      accountId: identity.accountId,
      currentSessionToken,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      newPasswordConfirmation: body.newPasswordConfirmation,
    });
    return Response.json(result, { status: 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Error && "status" in error && typeof (error as {status?:unknown}).status === "number") {
      const status=(error as {status:number}).status;
      return Response.json(
        { error: status >= 500 ? "Heslo momentálne nie je možné zmeniť." : error.message },
        { status: status >= 500 ? 503 : status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    return errorResponse(error);
  }
}
