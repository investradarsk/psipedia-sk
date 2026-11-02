import { env } from "cloudflare:workers";
import { requireAdminMutation } from "@/lib/admin-auth";
import { getGeminiCatalogItem } from "@/lib/gemini-automation-catalog";
import { geminiValidNotionDraftId } from "@/lib/gemini-concept-manager";
import { geminiAgendaForKey, getGeminiAgendaDraft } from "@/lib/gemini-notion-agenda-review";
import { getGeminiDirectoryDraft } from "@/lib/gemini-notion-directory-review";
import { notionRequest } from "@/lib/notion-sync-shared";

export const dynamic = "force-dynamic";
const HEADERS = { "cache-control": "no-store" };

/** Archive a Notion-only Gemini concept; NEVER delete mapped D1 profiles. */
export async function DELETE(request: Request) {
  const auth = await requireAdminMutation(request);
  if (auth.response) return auth.response;
  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body))
    return Response.json({ error: "Neplatná požiadavka." }, { status: 400, headers: HEADERS });
  const row = body as Record<string, unknown>;
  const key = typeof row.stableKey === "string" ? row.stableKey : "";
  const id = typeof row.pageId === "string" ? row.pageId : "";
  const revision = typeof row.revision === "string" ? row.revision : "";
  const item = getGeminiCatalogItem(key);
  if (row.confirm !== "TRASH_NOTION_ONLY_GEMINI_CONCEPT" || !item ||
      !geminiValidNotionDraftId(id) || !revision || revision.length > 100)
    return Response.json({ error: "Potvrď konkrétny Gemini koncept." }, { status: 400, headers: HEADERS });
  const db = (env as unknown as { DB?: D1Database }).DB;
  if (!db) return Response.json({ error: "D1 nie je dostupná." }, { status: 503, headers: HEADERS });
  try {
    const agenda = geminiAgendaForKey(key);
    const draft = agenda ? (await getGeminiAgendaDraft(env, key, id)).draft
      : await getGeminiDirectoryDraft(env, id);
    if (!agenda && (!("category" in draft) || draft.category !== item.subcategory))
      return Response.json({ error: "Kategória záznamu nesúhlasí." }, { status: 409, headers: HEADERS });
    if (draft.lastEditedAt !== revision || draft.canonicalVerified || draft.psipediaId ||
        draft.reviewState === "PUBLISHED")
      return Response.json({ error: "Profil už existuje v Psipedii alebo sa zmenil. Otvor jeho editor." },
        { status: 409, headers: HEADERS });

    // Inspect canonical mappings independently of the list projection, so a
    // stale Notion ID or a published D1 profile cannot be trashed by mistake.
    const mappingSql = agenda === "events"
      ? "SELECT event_id AS id FROM event_notion_sync WHERE notion_page_id=? LIMIT 1"
      : agenda === null
        ? "SELECT directory_profile_id AS id FROM directory_notion_sync WHERE notion_page_id=? LIMIT 1"
        : "SELECT entity_id AS id FROM notion_agenda_sync WHERE agenda=? AND notion_page_id=? LIMIT 1";
    const params = agenda && agenda !== "events" ? [agenda, id] : [id];
    const mapping = await db.prepare(mappingSql).bind(...params).first<{ id: number }>();
    const imported = await db.prepare(
      "SELECT canonical_entity_id FROM gemini_notion_created_pages WHERE notion_page_id=? AND import_agenda=? LIMIT 1"
    ).bind(id, agenda ?? "directory").first<{ canonical_entity_id: number | null }>();
    if (mapping || (imported && imported.canonical_entity_id !== null))
      return Response.json({ error: "Záznam už má D1 identitu; cez tabuľku sa nedá vymazať." },
        { status: 409, headers: HEADERS });

    // Notion API does not permanently delete pages: in_trash allows recovery.
    await notionRequest(env, "/pages/" + encodeURIComponent(id),
      { method: "PATCH", body: JSON.stringify({ in_trash: true }) });
    return Response.json({ trashed: true }, { headers: HEADERS });
  } catch {
    return Response.json({ error: "Odstránenie nebolo potvrdené. Obnov zoznam pred opakovaním." },
      { status: 503, headers: HEADERS });
  }
}
