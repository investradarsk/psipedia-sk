import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { listCanonicalAutomationUpdateSuggestions } from "@/lib/data-automation-update-review";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getAdminApiUser();
  if (!user) return unauthorizedAdminResponse();

  const params = new URL(request.url).searchParams;
  const entityType = params.get("entityType");
  const rawId = params.get("canonicalEntityId");
  const canonicalEntityId = rawId && /^\d+$/.test(rawId) ? Number(rawId) : NaN;

  if ((entityType !== "DIRECTORY" && entityType !== "EVENT") ||
    !Number.isSafeInteger(canonicalEntityId) || canonicalEntityId < 1) {
    return Response.json({ error: "Neplatný typ alebo ID profilu." }, { status: 400 });
  }

  try {
    const suggestions = await listCanonicalAutomationUpdateSuggestions({ entityType, canonicalEntityId });
    return Response.json({ suggestions }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("admin_editor_suggestions_read_failed", {
      entityType,
      canonicalEntityId,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: "Návrhy automatizácie sa nepodarilo načítať." }, {
      status: 500,
      headers: { "Cache-Control": "private, no-store" },
    });
  }
}
