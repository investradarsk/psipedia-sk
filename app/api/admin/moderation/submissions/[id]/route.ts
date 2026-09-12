import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { adminAuditActorRef } from "@/lib/audit-identity";
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
  if (body.reasonCode !== undefined && body.reasonCode !== null && (typeof body.reasonCode !== "string" || !/^[a-z0-9_-]{1,80}$/i.test(body.reasonCode))) return Response.json({ error: "Neplatný kód dôvodu." }, { status: 400 });
  if (body.status === "REJECTED" && typeof body.reasonCode !== "string") return Response.json({ error: "Pri zamietnutí je povinný kód dôvodu." }, { status: 400 });
  const { id } = await params;
  try {
    const item = await transitionModerationSubmission({ id, toStatus: body.status, actorRef: await adminAuditActorRef(user.email), reasonCode: typeof body.reasonCode === "string" ? body.reasonCode : null, requestId: request.headers.get("cf-ray") });
    return item ? Response.json(item, { headers: { "cache-control": "no-store" } }) : Response.json({ error: "Nenájdené." }, { status: 404 });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid moderation state transition") return Response.json({ error: "Nepovolený prechod stavu." }, { status: 409 });
    console.error("Moderation transition failed.", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Operáciu sa nepodarilo dokončiť." }, { status: 503 });
  }
}
