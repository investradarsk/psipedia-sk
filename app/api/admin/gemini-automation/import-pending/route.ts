import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { geminiAgendaForKey, getGeminiAgendaDraft } from "@/lib/gemini-notion-agenda-review";
import { getGeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import { geminiValidNotionDraftId } from "@/lib/gemini-concept-manager";
import { reconcileGeminiSavedDraft } from "@/lib/gemini-canonical-save-sync";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };

/**
 * One exact page per authenticated owner action. This endpoint is never
 * a public webhook and cannot write a published canonical entity.
 * Existing per-page and per-agenda locks remain in the original importer.
 */
export async function POST(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  const payload: unknown = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return Response.json({ error: "Neplatná požiadavka." }, { status: 400, headers: NO_STORE });
  const body = payload as Record<string, unknown>;
  const key = typeof body.stableKey === "string" ? body.stableKey : "";
  const pageId = typeof body.pageId === "string" ? body.pageId : "";
  const revision = typeof body.revision === "string" ? body.revision : "";
  const category = getGeminiCatalogItem(key);
  if (body.confirm !== "IMPORT_PRIVATE_GEMINI_DRAFT" || !category ||
      !geminiValidNotionDraftId(pageId) || !revision ||
      revision.length > 100) {
    return Response.json({ error: "Vyžaduje sa potvrdenie platného Gemini konceptu." },
      { status: 400, headers: NO_STORE });
  }
  const bindings = env as unknown as Parameters<typeof reconcileGeminiSavedDraft>[0]["bindings"];
  const database = (env as unknown as { DB?: D1Database }).DB;
  if (!database) return Response.json({ error: "D1 nie je pripojená." },
    { status: 503, headers: NO_STORE });
  try {
    // Validate origin and target category from the REAL Notion data source,
    // not editable values supplied by the browser.
    const agenda = geminiAgendaForKey(key);
    const draft = agenda
      ? (await getGeminiAgendaDraft(bindings, key, pageId)).draft
      : await getGeminiDirectoryDraft(bindings, pageId);
    if ((!agenda && (!("category" in draft) || draft.category !== category.subcategory)) ||
        draft.lastEditedAt !== revision || draft.reviewState === "REJECTED" ||
        draft.reviewState === "PUBLISHED" || (draft.psipediaId && !draft.canonicalVerified)) {
      return Response.json({ error: "Koncept sa zmenil alebo má neoverenú identitu. Obnov zoznam." },
        { status: 409, headers: NO_STORE });
    }
    const result = await reconcileGeminiSavedDraft({
      database, bindings, key, notionPageId: pageId,
      savedRevision: revision, ownerConfirmedLegacy: true, validatedDraft: draft,
    });
    // Every failed import returns one safe reason code to the admin UI.
    // A 200 response means the request was handled, NOT that D1 was created.
    return Response.json({ ...result, imported: result.state === "CANONICAL_DRAFT_READY" },
      { headers: NO_STORE });
  } catch {
    // Do not disclose private Notion data, provider tokens or raw bodies.
    return Response.json({ error: "Prenos sa nepotvrdil. Obnov stav pred opakovaním." },
      { status: 503, headers: NO_STORE });
  }
}
