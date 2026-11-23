import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { approvePartnerClaimAdmin, PartnerClaimAdminError, rejectPartnerClaimAdmin, revokePartnerHelpClaimAdmin } from "@/lib/partner-claims-admin";
import { PartnerHelpClaimError } from "@/lib/partner-help-claims";
import { PartnerSingleManagerConflictError, isPartnerSingleManagerConstraintError } from "@/lib/partner-single-manager";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "APPROVE") {
      return Response.json({ claim: await approvePartnerClaimAdmin({ id, adminEmail: auth.user.email,
        reporterIdentityVerified: body.reporterIdentityVerified }) });
    }
    if (body.action === "REVOKE") {
      return Response.json({ claim: await revokePartnerHelpClaimAdmin({id,adminEmail:auth.user.email,decisionNote:body.decisionNote}) });
    }
    if (body.action === "REJECT") {
      return Response.json({ claim: await rejectPartnerClaimAdmin({ id, decisionNote: body.decisionNote, adminEmail: auth.user.email }) });
    }
    return Response.json({ error: "Neplatná claim akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Zmena zlyhala." }, {
      status: error instanceof PartnerClaimAdminError || error instanceof PartnerSingleManagerConflictError || error instanceof PartnerHelpClaimError
        ? error.status : isPartnerSingleManagerConstraintError(error) ? 409 : 400,
    });
  }
}
