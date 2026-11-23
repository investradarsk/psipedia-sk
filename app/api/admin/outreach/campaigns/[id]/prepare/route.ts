import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { prepareOutreachCampaign } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response || !auth.user) return auth.response ?? unauthorizedAdminResponse();
  const user = auth.user;
  try {
    assertOutreachJsonMutation(request);
    const campaign = await prepareOutreachCampaign((await params).id, user.email);
    return Response.json({ campaign });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Kampaň sa nepodarilo pripraviť." }, { status: 409 });
  }
}
