import {
  getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse,
} from "@/lib/admin-auth";
import {
  getVisualComponentProposal, saveVisualComponentProposal,
} from "@/lib/visual-library-component-proposal-store";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Operácia sa nepodarila.";
  return Response.json({ error: message }, {
    status: message === "KONFLIKT_VERZIE" ? 409 :
      /Databáza nie je dostupná|Úložisko vizuálnych návrhov/i.test(message) ? 503 : 400,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** The non-banner editor intentionally does not have a publish endpoint.
 * All writes are protected admin-only drafts that public pages never read.
 */
export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const id = new URL(request.url).searchParams.get("id");
    const draft = await getVisualComponentProposal(id);
    return Response.json({ draft }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const draft = await saveVisualComponentProposal({
      id: body.id, revision: body.revision,
      draft: body.draft, updatedBy: auth.user!.email,
    });
    return Response.json({ draft }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
