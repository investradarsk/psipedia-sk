import { requirePartnerAccount, isPartnerAuthPublicError } from "@/lib/partner-auth";
import { PartnerContactProfileError, upsertPartnerContactProfile } from "@/lib/partner-contact-profile";
import { assertPartnerJsonMutation, PartnerSecurityError } from "@/lib/partner-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    assertPartnerJsonMutation(request);
    const identity = await requirePartnerAccount({
      cookieHeader: request.headers.get("cookie"),
      allowIncompleteOnboarding: true,
    });
    const body = await request.json() as Record<string, unknown>;
    const profile = await upsertPartnerContactProfile({
      accountId: identity.accountId,
      contactName: body.contactName,
      phone: body.phone,
      relationship: body.relationship,
    });
    return Response.json(
      { success: true, completedAt: profile?.completedAt ?? null },
      { status: 200, headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const status = error instanceof PartnerContactProfileError || error instanceof PartnerSecurityError || isPartnerAuthPublicError(error)
      ? error.status
      : 503;
    return Response.json(
      { error: status >= 500 ? "Kontaktné údaje momentálne nie je možné uložiť." : error instanceof Error ? error.message : "Požiadavka zlyhala." },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
