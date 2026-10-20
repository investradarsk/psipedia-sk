import { geminiImportAgenda } from "./gemini-notion-provenance";
import { planGeminiPublishHandoff } from "./gemini-canonical-publish-handoff";
import { getGeminiDirectoryDraft } from "./gemini-notion-directory-review";
import { getGeminiAgendaDraft } from "./gemini-notion-agenda-review";
import { runNotionDirectorySyncSweep, type NotionDirectorySyncBindings } from "./notion-directory-sync";
import { runNotionEventsHelpSyncSweep, type NotionEventsHelpSyncBindings } from "./notion-events-help-sync";
import { acquireGeminiNotionLock } from "./gemini-notion-review-lock";
import { geminiValidNotionDraftId } from "./gemini-concept-manager";
import { getGeminiCatalogItem } from "./gemini-automation-catalog";

type Bindings = NotionDirectorySyncBindings & NotionEventsHelpSyncBindings & { DB?: D1Database };
export type GeminiCanonicalSaveResult = {
  state: "CANONICAL_DRAFT_READY" | "NOTION_ONLY" | "NEEDS_REVIEW";
  editorUrl?: string;
};
const notionOnly = (): GeminiCanonicalSaveResult => ({ state: "NOTION_ONLY" });

/** Reconcile exactly one signed Gemini-origin Notion save, never publish.
 * Reuses the original Directory/Events/Help sync and native D1 editors.
 * An uncertain result never causes a second remote create automatically.
 */
export async function reconcileGeminiSavedDraft(input: {
  database: D1Database; bindings: Bindings; key: string; notionPageId: string;
}): Promise<GeminiCanonicalSaveResult> {
  const { database, bindings, key, notionPageId } = input;
  const agenda = geminiImportAgenda(key);
  if (!agenda || !getGeminiCatalogItem(key) || !geminiValidNotionDraftId(notionPageId))
    return notionOnly();
  // The mutable Notion creator field or Psipedia ID cannot establish origin.
  const signed = await database.prepare(
    "SELECT notion_page_id FROM gemini_notion_created_pages " +
    "WHERE notion_page_id=? AND stable_key=? AND import_agenda=? LIMIT 1"
  ).bind(notionPageId, key, agenda).first<{ notion_page_id: string }>();
  if (!signed) return notionOnly();

  // Both ordinary and targeted sync use one existing D1 mapping/provenance ledger.
  // The cross-category manual import lock prevents simultaneous admin saves.
  const release = await acquireGeminiNotionLock(database, "gemini-canonical-import-" + agenda);
  if (!release) return { state: "NEEDS_REVIEW" };
  try {
    const readDraft = async () => agenda === "directory"
      ? getGeminiDirectoryDraft(bindings, notionPageId)
      : (await getGeminiAgendaDraft(bindings, key, notionPageId)).draft;
    const before = await readDraft();
    if (before.reviewState === "REJECTED" || before.reviewState === "PUBLISHED")
      return { state: "NEEDS_REVIEW" };
    const already = planGeminiPublishHandoff(key, before);
    if (already.kind === "ALREADY_PUBLISHED")
      return { state: "NEEDS_REVIEW" }; // Publishing requires native editor.
    if (already.kind === "NATIVE_EDITOR_REQUIRED")
      return { state: "CANONICAL_DRAFT_READY", editorUrl: already.editorUrl };
    if (already.kind === "INVALID") return { state: "NEEDS_REVIEW" };

    if (agenda === "directory") {
      const result = await runNotionDirectorySyncSweep({
        database, bindings, targetPageId: notionPageId,
      });
      if (!result.enabled || !result.schemaReady || result.failed > 0)
        return { state: "NEEDS_REVIEW" };
    } else {
      const result = await runNotionEventsHelpSyncSweep({
        database, bindings, mode: "sync", force: true,
        agendas: [agenda], targetPageId: notionPageId,
      });
      if (!result.schemaReady || result.totals.failed > 0 || result.totals.conflicts > 0)
        return { state: "NEEDS_REVIEW" };
    }
    const after = await readDraft();
    const handoff = planGeminiPublishHandoff(key, after);
    return handoff.kind === "NATIVE_EDITOR_REQUIRED"
      ? { state: "CANONICAL_DRAFT_READY", editorUrl: handoff.editorUrl }
      : { state: "NEEDS_REVIEW" };
  } finally {
    await release();
  }
}
