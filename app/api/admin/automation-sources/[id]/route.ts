import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { parseAutomationSourceAdminInput } from "@/lib/data-automation-source-admin";
import {
  reviewAutomationSource,
  setAutomationSourceEnabled,
  updateAutomationSourceAdmin,
} from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

function idFrom(value: string) {
  const id = Number.parseInt(value, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response || !auth.user) return auth.response!;

  const id = idFrom((await params).id);
  if (!id) return Response.json({ error: "Neplatné ID zdroja." }, { status: 400 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");

  try {
    if (action === "save") {
      const parsed = parseAutomationSourceAdminInput(body?.source);
      if (!parsed.value) return Response.json({ error: parsed.error ?? "Neplatný zdroj." }, { status: 400 });
      const source = await updateAutomationSourceAdmin(id, parsed.value);
      return source ? Response.json({ source }) : Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
    }

    if (action === "approve" || action === "reject") {
      const source = await reviewAutomationSource({
        id,
        action,
        reviewerEmail: auth.user.email,
        notes: typeof body?.notes === "string" ? body.notes : null,
      });
      return source ? Response.json({ source }) : Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
    }

    if (action === "enable" || action === "disable") {
      const source = await setAutomationSourceEnabled({ id, enabled: action === "enable" });
      return source ? Response.json({ source }) : Response.json({ error: "Zdroj sa nenašiel." }, { status: 404 });
    }

    return Response.json({ error: "Neplatná source akcia." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zdroj sa nepodarilo upraviť.";
    const status = /review_required|not_safe/i.test(message) ? 409 : /unique/i.test(message) ? 409 : 500;
    return Response.json({ error: message }, { status });
  }
}
