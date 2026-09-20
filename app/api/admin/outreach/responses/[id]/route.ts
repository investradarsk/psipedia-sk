import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { reviewOutreachResponse } from "@/lib/outreach-store";
import { assertOutreachJsonMutation } from "@/lib/outreach-security";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  try {
    assertOutreachJsonMutation(request);
    const body = await request.json() as { status?: unknown };
    if (body.status !== "APPROVED" && body.status !== "REJECTED") throw new Error("Neplatný review stav.");
    const response = await reviewOutreachResponse((await params).id, body.status, user.email);
    return Response.json({ response });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Odpoveď sa nepodarilo posúdiť." }, { status: 409 });
  }
}
