import { env } from "cloudflare:workers";
import { getAdminApiUser, requireAdminMutation, unauthorizedAdminResponse } from "@/lib/admin-auth";
import {
  getGeminiDirectoryDraft,
  saveGeminiDirectoryDraft,
  reviewGeminiDirectoryDraft,
  GeminiNotionReviewError,
} from "@/lib/gemini-notion-directory-review";
import { geminiAgendaForKey, getGeminiAgendaDraft, mutateGeminiAgendaDraft, GeminiAgendaReviewError } from "@/lib/gemini-notion-agenda-review";
import { geminiValidNotionDraftId } from "@/lib/gemini-concept-manager";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { reconcileGeminiSavedDraft, type GeminiCanonicalSaveResult } from "@/lib/gemini-canonical-save-sync";

export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "no-store" };
type Props = { params: Promise<{ id: string }> };

function fail(error: unknown) {
  if (error instanceof GeminiAgendaReviewError) {
    const status = error.code === "CATEGORY" ? 400 : error.code === "NOT_FOUND" ? 404 :
      ["CONFLICT", "LOCKED", "STATE"].includes(error.code) ? 409 : 503;
    return Response.json({ error: error.code === "CONFLICT" ? "Koncept sa medzitým zmenil v Notione. Obnov ho." :
      error.code === "SCHEMA" ? "Chýba pole alebo povolený stav v Notion schéme. Zápis bol zablokovaný." :
      error.code === "LOCKED" ? "Prebieha iný zápis. Pred opakovaním over Notion." : "Koncept nemožno bezpečne upraviť." },
      { status, headers: HEADERS });
  }
  if (error instanceof GeminiNotionReviewError) {
    const status = error.code === "ID" || error.code === "CATEGORY" ? 400
      : error.code === "NOT_FOUND" ? 404
      : error.code === "CONFLICT" || error.code === "LOCKED" || error.code === "STATE" ? 409 : 503;
    return Response.json({
      error: error.code === "LOCKED"
        ? "Prebieha iný zápis alebo čaká na overenie neistý výsledok. Obnov zoznam; ak stav pretrváva, treba preveriť zámok podľa GEMINI-NOTION-REVIEW-2."
        : error.code === "CONFLICT"
        ? "Koncept sa medzitým zmenil v Notione. Obnov zoznam a otvor ho znovu."
        : error.code === "STATE"
          ? "Koncept už nie je možné upravovať alebo obsahuje neplatné údaje."
          : "Notion koncept sa nepodarilo spracovať.",
    }, { status, headers: HEADERS });
  }
  return Response.json({ error: "Notion neodpovedá. Skontroluj stav pred opakovaním uloženia." },
    { status: 503, headers: HEADERS });
}

export async function GET(request: Request, { params }: Props) {
  if (!await getAdminApiUser()) return unauthorizedAdminResponse();
  try {
    const { id } = await params;
    const key = new URL(request.url).searchParams.get("stable_key") ?? "";
    if (!geminiValidNotionDraftId(id))
      return Response.json({ error: "Neplatná identita konceptu." }, { status: 400, headers: HEADERS });
    if (key) {
      const item = getGeminiCatalogItem(key);
      if (!item) return Response.json({ error: "Neznáma kategória." }, { status: 400, headers: HEADERS });
      if (geminiAgendaForKey(key))
        return Response.json({ draft: (await getGeminiAgendaDraft(env, key, id)).draft }, { headers: HEADERS });
      const draft = await getGeminiDirectoryDraft(env, id);
      if (item.section !== "directory" || draft.category !== item.subcategory)
        return Response.json({ error: "Koncept nepatrí do kategórie." }, { status: 404, headers: HEADERS });
      return Response.json({ draft }, { headers: HEADERS });
    }
    // Legacy authenticated directory editor requests without a category still work.
    return Response.json({ draft: await getGeminiDirectoryDraft(env, id) }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}

export async function PUT(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const key = new URL(request.url).searchParams.get("stable_key") ?? "";
    const item = key ? getGeminiCatalogItem(key) : null;
    if (!geminiValidNotionDraftId(id) || (key && !item))
      return Response.json({ error: "Neplatné ID alebo neznáma kategória konceptu." }, { status: 400, headers: HEADERS });
    if (item?.section === "directory") {
      const current = await getGeminiDirectoryDraft(env, id);
      if (current.category !== item.subcategory ||
          (body && typeof body === "object" && !Array.isArray(body) &&
            "category" in body && (body as { category: unknown }).category !== item.subcategory))
        return Response.json({ error: "Koncept nepatrí do požadovanej kategórie. Zápis sa nevykonal." },
          { status: 409, headers: HEADERS });
    }
    const isAgenda = Boolean(item && geminiAgendaForKey(key));
    const draft = isAgenda
      ? await mutateGeminiAgendaDraft(env, key, id, body, auth.user.email)
      : await saveGeminiDirectoryDraft(env, id, body, auth.user.email);
    // An explicit user save may also persist the same signed concept as a
    // private canonical D1 draft through the original one-page sync pipeline.
    // A Notion save remains truthful even when D1 reconciliation is blocked.
    const stableKey = isAgenda ? key
      : "category" in draft ? "directory." + draft.category : "";
    let canonicalSave: GeminiCanonicalSaveResult = { state: "NOTION_ONLY" };
    const database = (env as unknown as { DB?: D1Database }).DB;
    if (database && getGeminiCatalogItem(stableKey)) {
      try {
        canonicalSave = await reconcileGeminiSavedDraft({
          database,
          bindings: env as unknown as Parameters<typeof reconcileGeminiSavedDraft>[0]["bindings"],
          key: stableKey, notionPageId: id, savedRevision: draft.lastEditedAt,
        });
      } catch {
        // Never auto-retry a potentially completed Notion/D1 write.
        canonicalSave = { state: "NEEDS_REVIEW" };
      }
    }
    return Response.json({ draft, canonicalSave }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request, { params }: Props) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  try {
    const body = await request.json();
    if (!body || !["reject", "restore", "approve"].includes(body.action) || body.confirm !== true)
      return Response.json({ error: "Vyžaduje sa výslovné potvrdenie." }, { status: 400, headers: HEADERS });
    const { id } = await params;
    const key = new URL(request.url).searchParams.get("stable_key") ?? "";
    const item = key ? getGeminiCatalogItem(key) : null;
    if (!geminiValidNotionDraftId(id) || (key && !item))
      return Response.json({ error: "Neplatné ID alebo neznáma kategória konceptu." }, { status: 400, headers: HEADERS });
    if (item?.section === "directory") {
      const current = await getGeminiDirectoryDraft(env, id);
      if (current.category !== item.subcategory)
        return Response.json({ error: "Koncept nepatrí do požadovanej kategórie. Zápis sa nevykonal." },
          { status: 409, headers: HEADERS });
    }
    const isAgenda = Boolean(key && geminiAgendaForKey(key));
    const draft = isAgenda
      ? await mutateGeminiAgendaDraft(env, key, id, body, auth.user.email)
      : await reviewGeminiDirectoryDraft(env, id, body, auth.user.email);
    // "Pripraviť na import" must not stop at a Notion status change.
    // Only the same signed, targeted private-D1 reconciliation as Save can
    // authorize a native editor link. A blocked import is reported, not retried
    // blindly and never treated as a publication.
    let canonicalSave: GeminiCanonicalSaveResult = { state: "NOTION_ONLY" };
    if (isAgenda && body.action === "approve") {
      const database = (env as unknown as { DB?: D1Database }).DB;
      if (database) {
        try {
          canonicalSave = await reconcileGeminiSavedDraft({
            database,
            bindings: env as unknown as Parameters<typeof reconcileGeminiSavedDraft>[0]["bindings"],
            key, notionPageId: id, savedRevision: draft.lastEditedAt,
          });
        } catch {
          canonicalSave = { state: "NEEDS_REVIEW" };
        }
      }
    }
    return Response.json({ draft, canonicalSave }, { headers: HEADERS });
  } catch (error) { return fail(error); }
}
