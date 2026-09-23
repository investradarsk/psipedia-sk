import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerNewProfileError, scanPartnerNewProfileForAccount } from "@/lib/partner-new-profile";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const body = await request.json() as Record<string, unknown>;
    const result = await scanPartnerNewProfileForAccount({
      accountId: identity.accountId,
      resourceType: body.resourceType,
      profile: body.profile,
    });
    return Response.json({
      confidence: result.scan.confidence,
      candidates: result.partnerCandidates,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const status = error instanceof PartnerNewProfileError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 503;
    return Response.json({
      error: status >= 500 ? "Kontrolu duplicít momentálne nie je možné vykonať." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
