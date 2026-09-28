import { requirePartnerAccount } from "@/lib/partner-auth";
import { cancelPartnerClaim, PartnerClaimError } from "@/lib/partner-claims";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const { id } = await params;
    const claim = await cancelPartnerClaim({ accountId: identity.accountId, claimId: id });
    return Response.json({ success: true, claim }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PartnerClaimError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 503;
    return Response.json({ error: status >= 500 ? "Zrušenie žiadosti momentálne nie je dostupné." : error instanceof Error ? error.message : "Požiadavka zlyhala." }, {
      status, headers: { "Cache-Control": "private, no-store" },
    });
  }
}
