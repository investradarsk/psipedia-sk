import { requirePartnerAccount } from "@/lib/partner-auth";
import { createPartnerClaim, PartnerClaimError } from "@/lib/partner-claims";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const body = await request.json() as Record<string, unknown>;
    const claim = await createPartnerClaim({
      accountId: identity.accountId,
      entityType: body.entityType,
      canonicalId: body.canonicalId,
      requestMessage: body.requestMessage,
    });
    return Response.json({ success: true, claim }, {
      status: claim.deduplicated ? 200 : 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof PartnerClaimError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 503;
    return Response.json({
      error: status >= 500 ? "Žiadosť momentálne nie je možné odoslať." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
