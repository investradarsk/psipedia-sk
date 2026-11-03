import {
  getAdminApiUser,
  requireAdminMutation,
  unauthorizedAdminResponse,
} from "@/lib/admin-auth";
import {
  listOwnerDecisions,
  saveOwnerDecision,
} from "@/lib/visual-library-owner-decision-store";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function errorResponse(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Operácia sa nepodarila.";
  const status = message === "KONFLIKT_VERZIE" ? 409
    : /Databáza nie je dostupná|Úložisko rozhodnutí/i.test(message) ? 503
    : 400;
  return Response.json({ error: message }, { status, headers: PRIVATE_HEADERS });
}

/** Admin-only queue. Never publishes, deletes or mutates public components. */
export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const url = new URL(request.url);
    const offsetValue = url.searchParams.get("offset");
    const limitValue = url.searchParams.get("limit");
    const offset = offsetValue === null ? 0 : Number(offsetValue);
    const limit = limitValue === null ? 25 : Number(limitValue);
    const result = await listOwnerDecisions({ offset, limit });
    return Response.json(result, { headers: PRIVATE_HEADERS });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("Neplatný obsah rozhodnutia.");
    }
    const saved = await saveOwnerDecision({
      revision: body.revision,
      draft: body.draft,
      updatedBy: auth.user!.email,
    });
    return Response.json({ decision: saved }, { headers: PRIVATE_HEADERS });
  } catch (error) { return errorResponse(error); }
}
