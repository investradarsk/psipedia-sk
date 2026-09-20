import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { sendOutreachCampaignBatch } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    assertOutreachJsonMutation(request);
    const body = await request.json().catch(() => ({})) as { limit?: unknown };
    const limit = typeof body.limit === "number" ? body.limit : 25;
    const summary = await sendOutreachCampaignBatch((await params).id, user.email, limit);
    return Response.json({ summary });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Odoslanie sa nespustilo." }, { status: 409 });
  }
}
