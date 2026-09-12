import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { getModerationSubmission, isFoundationSubmissionStatus, transitionModerationSubmission } from "@/lib/moderation-store";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  const { id } = await params;
  const item = await getModerationSubmission(id);
  return item ? Response.json(item, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "Nenájdené." }, { status: 404 });
}

export async function PATCH(request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return Response.json({ error: "Očakáva sa JSON." }, { status: 415 });
  const body = await request.json().catch(() => null) as { status?: unknown; reasonCode?: unknown } | null;
  if (!body || !isFoundationSubmissionStatus(body.status)) return Response.json({ error: "Neplatný stav." }, { status: 400 });
  if (body.reasonCode !== undefined && body.reasonCode !== null && (typeof body.reasonCode !== "string" || body.reasonCode.length > 80)) return Response.json({ error: "Neplatný dôvod." }, { status: 400 });
  const { id } = await params;
  const item = await transitionModerationSubmission({ id, toStatus: body.status, actorRef: user.email, reasonCode: typeof body.reasonCode === "string" ? body.reasonCode : null, requestId: request.headers.get("cf-ray") });
  return item ? Response.json(item, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "Nenájdené." }, { status: 404 });
}
