import { geminiImportAgenda } from "./gemini-notion-provenance";
import { planGeminiPublishHandoff } from "./gemini-canonical-publish-handoff";
import { getGeminiDirectoryDraft } from "./gemini-notion-directory-review";
import { getGeminiAgendaDraft } from "./gemini-notion-agenda-review";
import { runNotionDirectorySyncSweep, type NotionDirectorySyncBindings } from "./notion-directory-sync";
import { runNotionEventsHelpSyncSweep, type NotionEventsHelpSyncBindings } from "./notion-events-help-sync";
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
  database: D1Database; bindings: Bindings; key: string; notionPageId: string; savedRevision: string;
}): Promise<GeminiCanonicalSaveResult> {
  const { database, bindings, key, notionPageId, savedRevision } = input;
  const agenda = geminiImportAgenda(key);
  if (!agenda || !savedRevision || !getGeminiCatalogItem(key) || !geminiValidNotionDraftId(notionPageId))
    return notionOnly();
  // The mutable Notion creator field or Psipedia ID cannot establish origin.
  const signed = await database.prepare(
    "SELECT notion_page_id FROM gemini_notion_created_pages " +
    "WHERE notion_page_id=? AND stable_key=? AND import_agenda=? LIMIT 1"
  ).bind(notionPageId, key, agenda).first<{ notion_page_id: string }>();
  if (!signed) return notionOnly();

  // Exclusion belongs to the original sync pipelines so scheduled and manual
  // imports contend for the same locks, not independent caller-only locks.
  const readDraft = async () => agenda === "directory"
    ? getGeminiDirectoryDraft(bindings, notionPageId)
    : (await getGeminiAgendaDraft(bindings, key, notionPageId)).draft;
  const before = await readDraft();
  if (before.lastEditedAt !== savedRevision) return { state: "NEEDS_REVIEW" };
  if (before.reviewState === "REJECTED" || before.reviewState === "PUBLISHED")
    return { state: "NEEDS_REVIEW" };
  const already = planGeminiPublishHandoff(key, before);
  if (already.kind === "NATIVE_EDITOR_REQUIRED")
    return { state: "NEEDS_REVIEW", editorUrl: already.editorUrl }; // Import raced this save; inspect canonical content.
  if (already.kind === "INVALID") return { state: "NEEDS_REVIEW" };

  if (agenda === "directory") {
    const result = await runNotionDirectorySyncSweep({
      database, bindings, targetPageId: notionPageId, expectedNotionRevision: savedRevision,
    });
    if (!result.enabled || !result.schemaReady || result.failed > 0 || result.createdFromNotion !== 1)
      return { state: "NEEDS_REVIEW" };
  } else {
    const result = await runNotionEventsHelpSyncSweep({
      database, bindings, mode: "sync",
      agendas: [agenda], targetPageId: notionPageId, expectedNotionRevision: savedRevision,
    });
    if (!result.enabled || !result.schemaReady || result.agendas.some(item => item.targetMissing) || result.totals.failed > 0 || result.totals.conflicts > 0 || result.totals.createdFromNotion !== 1)
      return { state: "NEEDS_REVIEW" };
  }
  const after = await readDraft();
  const handoff = planGeminiPublishHandoff(key, after);
  return handoff.kind === "NATIVE_EDITOR_REQUIRED"
    ? { state: "CANONICAL_DRAFT_READY", editorUrl: handoff.editorUrl }
    : { state: "NEEDS_REVIEW" };
}
