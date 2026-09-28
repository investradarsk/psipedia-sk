import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { isArticleFeedbackStatus, updateArticleFeedbackStatus } from "@/lib/article-feedback-store";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: RouteProps) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Neplatné ID hodnotenia." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  if (!body || !isArticleFeedbackStatus(body.status)) {
    return Response.json({ error: "Neplatný stav hodnotenia." }, { status: 400 });
  }

  const feedback = await updateArticleFeedbackStatus(id, body.status);
  return feedback
    ? Response.json({ feedback }, { headers: { "cache-control": "no-store" } })
    : Response.json({ error: "Hodnotenie sa nenašlo alebo nevyžaduje pozornosť." }, { status: 404 });
}
