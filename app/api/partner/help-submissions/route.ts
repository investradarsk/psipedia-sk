import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerHelpCreateError, submitPartnerHelpCreate } from "@/lib/partner-help-create";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const body = await request.json() as Record<string, unknown>;
    const submission = await submitPartnerHelpCreate({
      accountId: identity.accountId, resourceType: body.resourceType, payload: body.payload,
    });
    return Response.json({ success: true, submission }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PartnerHelpCreateError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status : 503;
    if (status >= 500) console.error("Partner Help submission failed", error);
    return Response.json({
      error: status >= 500 ? "Návrh Pomoci psom sa momentálne nepodarilo odoslať." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
      code: error instanceof PartnerHelpCreateError ? error.code : undefined,
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
