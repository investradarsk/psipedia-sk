import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { getGeminiDirectoryDraft, GeminiNotionReviewError } from "@/lib/gemini-notion-directory-review";
import { geminiAgendaForKey, getGeminiAgendaDraft, GeminiAgendaReviewError } from "@/lib/gemini-notion-agenda-review";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { geminiValidNotionDraftId } from "@/lib/gemini-concept-manager";
import { planGeminiPublishHandoff } from "@/lib/gemini-canonical-publish-handoff";

export const dynamic = "force-dynamic";
const NO_STORE = { "cache-control": "no-store" };
type Props = { params: Promise<{ id: string }> };

/** Legacy URL: verify a handoff only. Never confuse Notion approval with D1 publishing. */
export async function POST(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    if (!geminiValidNotionDraftId(id) || !body || typeof body !== "object" || Array.isArray(body))
      return Response.json({ error: "Neplatná identita alebo požiadavka." }, { status: 400, headers: NO_STORE });
    const input = body as Record<string, unknown>;
    if (input.confirm !== true || typeof input.lastEditedAt !== "string" || !input.lastEditedAt)
      return Response.json({ error: "Vyžaduje sa potvrdenie a aktuálna verzia konceptu." }, { status: 400, headers: NO_STORE });
    const key = new URL(request.url).searchParams.get("stable_key") ?? "";
    if (!getGeminiCatalogItem(key))
      return Response.json({ error: "Chýba platná kategória konceptu." }, { status: 400, headers: NO_STORE });
    const draft = geminiAgendaForKey(key)
      ? (await getGeminiAgendaDraft(env, key, id)).draft
      : await getGeminiDirectoryDraft(env, id);
    if (draft.lastEditedAt !== input.lastEditedAt)
      return Response.json({ error: "Koncept sa zmenil. Obnov editor; nepublikovalo sa." }, { status: 409, headers: NO_STORE });
    const handoff = planGeminiPublishHandoff(key, draft);
    if (handoff.kind === "INVALID")
      return Response.json({ error: "Kategória alebo D1 identita nebola overená." }, { status: 409, headers: NO_STORE });
    if (handoff.kind === "IMPORT_REQUIRED")
      return Response.json({ status: "IMPORT_REQUIRED", published: false,
        error: "Najprv bezpečne dokonči import do jediného neverejného D1 konceptu. Nič sa nepublikovalo." },
        { status: 409, headers: NO_STORE });
    return Response.json({
      status: handoff.kind, editorUrl: handoff.editorUrl,
      published: handoff.kind === "ALREADY_PUBLISHED",
    }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof GeminiNotionReviewError || error instanceof GeminiAgendaReviewError) {
      const code = error.code;
      const status = code === "ID" || code === "CATEGORY" ? 400 : code === "NOT_FOUND" ? 404 :
        ["CONFLICT", "LOCKED", "STATE"].includes(code) ? 409 : 503;
      return Response.json({ error: "Notion alebo D1 identitu nemožno bezpečne overiť. Nič sa nepublikovalo." },
        { status, headers: NO_STORE });
    }
    return Response.json({ error: "Výsledok overenia je neistý. Pred opakovaním skontroluj záznam." },
      { status: 503, headers: NO_STORE });
  }
}
