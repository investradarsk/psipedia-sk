import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getOutreachAdminData, transitionOutreachCampaign } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const id = (await params).id;
  try {
    return Response.json(await getOutreachAdminData(id), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Kampaň sa nepodarilo načítať." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    assertOutreachJsonMutation(request);
    const body = await request.json() as { action?: unknown };
    if (!["pause", "resume", "cancel", "complete"].includes(String(body.action ?? ""))) {
      throw new Error("Neplatná akcia kampane.");
    }
    const campaign = await transitionOutreachCampaign(
      (await params).id,
      body.action as "pause" | "resume" | "cancel" | "complete",
      user.email,
    );
    return Response.json({ campaign });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Stav kampane sa nepodarilo zmeniť." }, { status: 409 });
  }
}
