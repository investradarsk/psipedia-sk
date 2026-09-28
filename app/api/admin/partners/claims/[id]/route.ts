import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { approvePartnerClaimAdmin, PartnerClaimAdminError, rejectPartnerClaimAdmin } from "@/lib/partner-claims-admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action === "APPROVE") {
      return Response.json({ claim: await approvePartnerClaimAdmin({ id, adminEmail: auth.user.email }) });
    }
    if (body.action === "REJECT") {
      return Response.json({ claim: await rejectPartnerClaimAdmin({ id, decisionNote: body.decisionNote, adminEmail: auth.user.email }) });
    }
    return Response.json({ error: "Neplatná claim akcia." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Zmena zlyhala." }, {
      status: error instanceof PartnerClaimAdminError ? error.status : 400,
    });
  }
}
