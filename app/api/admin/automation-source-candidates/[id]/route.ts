import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { reviewAutomationSourceCandidate } from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const id = Number.parseInt((await params).id, 10);
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: "Neplatné ID kandidáta." }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  if (!["approve", "reject", "suppress"].includes(action)) {
    return Response.json({ error: "Neplatná candidate akcia." }, { status: 400 });
  }

  try {
    const candidate = await reviewAutomationSourceCandidate({
      id,
      action: action as "approve" | "reject" | "suppress",
      reviewerEmail: auth.user.email,
      notes: typeof body?.notes === "string" ? body.notes : null,
      suppressedDays: Number(body?.suppressedDays ?? 30),
    });
    return candidate
      ? Response.json({ candidate })
      : Response.json({ error: "Kandidát sa nenašiel." }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Kandidáta sa nepodarilo spracovať." }, { status: 409 });
  }
}
