import { requirePartnerAdminMutation } from "@/lib/partner-admin-api";
import { changePartnerMembershipAdmin } from "@/lib/partner-admin-store";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartnerAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as { role?: "OWNER" | "MANAGER" | "EDITOR"; revoke?: boolean };
    const { id } = await params;
    await changePartnerMembershipAdmin({
      membershipId: id,
      role: body.role,
      revoke: body.revoke,
      adminEmail: auth.user.email,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Prístup sa nepodarilo upraviť." }, { status: 400 });
  }
}
