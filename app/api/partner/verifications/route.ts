import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerClaimError, requestPartnerVerification } from "@/lib/partner-claims";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const body = await request.json() as Record<string, unknown>;
    const verification = await requestPartnerVerification({
      accountId: identity.accountId,
      resourceId: body.resourceId,
      requestNote: body.requestNote,
    });
    return Response.json({ success: true, verification }, {
      status: verification.deduplicated ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof PartnerClaimError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 503;
    return Response.json({ error: status >= 500 ? "Žiadosť o overenie momentálne nie je dostupná." : error instanceof Error ? error.message : "Požiadavka zlyhala." }, {
      status, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
