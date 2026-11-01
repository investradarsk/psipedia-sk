import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  getVisualDraft, publishVisualDraft, saveVisualDraft, validatedBannerKey,
  allowedVisualPublishTargets,
} from "@/lib/visual-library-edit-store";

export const dynamic = "force-dynamic";

function parseVariant(value: string | null): number {
  if (value === null || !/^[0-2]$/.test(value)) throw new Error("Neplatný variant banneru.");
  return Number(value);
}
function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Operácia sa nepodarila.";
  return Response.json({ error: message }, {
    status: message === "KONFLIKT_VERZIE" ? 409 :
      /Úložisko vizuálnych návrhov|Databáza nie je dostupná/i.test(message) ? 503 : 400,
  });
}

export async function GET(request: Request) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    const variantIndex = parseVariant(url.searchParams.get("variant"));
    validatedBannerKey(id, variantIndex);
    const draft = await getVisualDraft(id, variantIndex);
    return Response.json({
      draft,
      target: allowedVisualPublishTargets[id]?.variant === variantIndex
        ? allowedVisualPublishTargets[id].url : null,
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    const input = await saveVisualDraft({
      id: body.id as string, variantIndex: body.variantIndex as number,
      revision: body.revision as number, draft: body.draft,
      updatedBy: auth.user!.email,
    });
    return Response.json({ draft: input }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await requireAdminMutation(request, { strictProvenance: true });
  if (auth.response) return auth.response;
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.action !== "publish" && body.action !== "revert") {
      throw new Error("Neplatná požiadavka.");
    }
    if (body.acknowledged !== true) {
      throw new Error("Pred publikovaním alebo vrátením zmien výslovne potvrď akciu.");
    }
    const input = await publishVisualDraft({
      id: body.id as string, variantIndex: body.variantIndex as number,
      revision: body.revision as number, confirmedUrl: body.confirmedUrl,
      publishedBy: auth.user!.email,
      action: body.action,
    });
    return Response.json({ draft: input }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return errorResponse(error); }
}
