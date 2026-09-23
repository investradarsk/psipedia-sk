import { requirePartnerAccount } from "@/lib/partner-auth";
import { PartnerNewProfileError, submitPartnerNewProfile } from "@/lib/partner-new-profile";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({ cookieHeader: request.headers.get("cookie") });
    const body = await request.json() as Record<string, unknown>;
    const submission = await submitPartnerNewProfile({
      accountId: identity.accountId,
      resourceType: body.resourceType,
      profile: body.profile,
      confirmDuplicate: body.confirmDuplicate === true,
    });
    return Response.json({ success: true, submission }, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof PartnerNewProfileError) {
      return Response.json({
        error: error.message,
        code: error.code,
        ...(error.details && typeof error.details === "object" ? { details: error.details } : {}),
      }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    }
    const status = error instanceof PartnerSecurityError
      ? error.status
      : typeof (error as { status?: unknown })?.status === "number"
        ? (error as { status: number }).status
        : 503;
    return Response.json({
      error: status >= 500 ? "Návrh nového profilu momentálne nie je možné odoslať." : error instanceof Error ? error.message : "Požiadavka zlyhala.",
    }, { status, headers: { "Cache-Control": "private, no-store" } });
  }
}
