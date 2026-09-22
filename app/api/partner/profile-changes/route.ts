import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerProfileChangeError, submitPartnerProfileChange } from "@/lib/partner-profile-changes";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.resourceId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.resourceId)) {
      throw new PartnerProfileChangeError("Neplatný Partner resource.");
    }
    const change = await submitPartnerProfileChange({
      accountId: identity.accountId,
      resourceId: body.resourceId,
      baseRevision: body.baseRevision,
      patch: body.patch,
    });
    return Response.json({ success: true, change }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const status = error instanceof PartnerProfileChangeError || error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 503;
    return Response.json({
      error: status >= 500 ? "Návrh zmien momentálne nie je možné odoslať." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
