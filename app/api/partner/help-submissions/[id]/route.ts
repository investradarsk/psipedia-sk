import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerHelpCreateError, withdrawPartnerHelpCreate } from "@/lib/partner-help-create";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "WITHDRAW") throw new PartnerHelpCreateError("Neplatná požiadavka.");
    const submission = await withdrawPartnerHelpCreate({ accountId: identity.accountId, id });
    return Response.json({ success: true, submission }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PartnerHelpCreateError || error instanceof PartnerSecurityError ? error.status
      : typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 503;
    return Response.json({
      error: status >= 500 ? "Návrh sa nepodarilo stiahnuť." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
