import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { reviewAutomationFinding } from "@/lib/data-automation-store";
import type { AutomationReviewAction } from "@/lib/data-automation";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

const actions = new Set<AutomationReviewAction>(["start-review", "approve", "reject", "ignore", "suppress"]);

export async function PUT(request: Request, { params }: Props) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) {
    return Response.json({ error: "Neplatné ID findingu." }, { status: 400 });
  }

  const body = await request.json().catch(() => null) as {
    action?: unknown;
    notes?: unknown;
    suppressedDays?: unknown;
  } | null;
  if (!body || typeof body.action !== "string" || !actions.has(body.action as AutomationReviewAction)) {
    return Response.json({ error: "Neplatná review akcia." }, { status: 400 });
  }

  const notes = typeof body.notes === "string" ? body.notes : null;
  let suppressedUntil: string | null = null;
  if (body.action === "suppress") {
    const days = Number(body.suppressedDays ?? 30);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      return Response.json({ error: "Suppression musí byť 1 až 365 dní." }, { status: 400 });
    }
    suppressedUntil = new Date(Date.now() + days * 86_400_000).toISOString();
  }

  try {
    const finding = await reviewAutomationFinding({
      id,
      action: body.action as AutomationReviewAction,
      reviewerEmail: user.email,
      notes,
      suppressedUntil,
    });
    return finding
      ? Response.json({ finding }, { headers: { "cache-control": "no-store" } })
      : Response.json({ error: "Finding sa nenašiel." }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Finding sa nepodarilo spracovať." },
      { status: 409 },
    );
  }
}
