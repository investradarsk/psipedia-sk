import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerProfileChangeError, withdrawPartnerProfileChange } from "@/lib/partner-profile-changes";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new PartnerProfileChangeError("Neplatný návrh.");
    const change = await withdrawPartnerProfileChange({ accountId: identity.accountId, id });
    return Response.json({ success: true, change }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PartnerProfileChangeError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 503;
    return Response.json({
      error: status >= 500 ? "Návrh momentálne nie je možné zrušiť." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
