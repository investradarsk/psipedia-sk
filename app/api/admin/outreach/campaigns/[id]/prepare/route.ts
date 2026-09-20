import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { prepareOutreachCampaign } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    assertOutreachJsonMutation(request);
    const campaign = await prepareOutreachCampaign((await params).id, user.email);
    return Response.json({ campaign });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Kampaň sa nepodarilo pripraviť." }, { status: 409 });
  }
}
