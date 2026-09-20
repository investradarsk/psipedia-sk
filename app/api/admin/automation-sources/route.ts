import { requireAutomationAdminMutation } from "@/lib/admin-automation-api";
import { parseAutomationSourceAdminInput } from "@/lib/data-automation-source-admin";
import { createAutomationSourceAdmin } from "@/lib/data-automation-source-store";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAutomationAdminMutation(request);
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = parseAutomationSourceAdminInput(body);
  if (!parsed.value) return Response.json({ error: parsed.error ?? "Neplatný zdroj." }, { status: 400 });

  try {
    const source = await createAutomationSourceAdmin(parsed.value);
    return Response.json({ source }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Zdroj sa nepodarilo vytvoriť.";
    const conflict = /unique|source_key/i.test(message);
    return Response.json({ error: conflict ? "Source key už existuje." : message }, { status: conflict ? 409 : 500 });
  }
}
