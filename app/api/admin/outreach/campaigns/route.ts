import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { createOutreachCampaign, getOutreachAdminData } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    return Response.json(await getOutreachAdminData(), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Outreach sa nepodarilo načítať." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    assertOutreachJsonMutation(request);
    const payload = await request.json() as Record<string, unknown>;
    const campaign = await createOutreachCampaign(payload, user.email);
    return Response.json({ campaign }, { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Kampaň sa nepodarilo vytvoriť." }, { status: 400 });
  }
}
