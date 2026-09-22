import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { decidePartnerVerificationAdmin, PartnerClaimAdminError } from "@/lib/partner-claims-admin";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "VERIFY" && body.action !== "REJECT") {
      return Response.json({ error: "Neplatná verification akcia." }, { status: 400 });
    }
    return Response.json({
      verification: await decidePartnerVerificationAdmin({
        id,
        action: body.action,
        reviewNote: body.reviewNote,
        adminEmail: auth.user.email,
      }),
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Zmena zlyhala." }, {
      status: error instanceof PartnerClaimAdminError ? error.status : 400,
    });
  }
}
