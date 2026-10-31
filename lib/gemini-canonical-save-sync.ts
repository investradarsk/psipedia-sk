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
  /** Explicit authenticated Admin action only: accept one exact legacy Gemini evidence page. */
  ownerConfirmedLegacy?: boolean;
}): Promise<GeminiCanonicalSaveResult> {
  const { database, bindings, key, notionPageId, savedRevision, ownerConfirmedLegacy = false } = input;
  const agenda = geminiImportAgenda(key);
  if (!agenda || !savedRevision || !getGeminiCatalogItem(key) || !geminiValidNotionDraftId(notionPageId))
    return notionOnly();
  // The mutable Notion creator field or Psipedia ID cannot establish origin.
  const signed = await database.prepare(
    "SELECT notion_page_id FROM gemini_notion_created_pages " +
    "WHERE notion_page_id=? AND stable_key=? AND import_agenda=? LIMIT 1"
  ).bind(notionPageId, key, agenda).first<{ notion_page_id: string }>();
  if (!signed && !ownerConfirmedLegacy) return notionOnly();

  // Exclusion belongs to the original sync pipelines so scheduled and manual
  // imports contend for the same locks, not independent caller-only locks.
  const readDraft = async () => agenda === "directory"
    ? getGeminiDirectoryDraft(bindings, notionPageId)
    : (await getGeminiAgendaDraft(bindings, key, notionPageId)).draft;
  const before = await readDraft();
  // A pre-signature Notion concept can enter canonical D1 only after a
  // human has explicitly approved it in the authenticated Gemini editor.
  // Signed callback provenance is never fabricated for legacy pages.
  const reviewedLegacy = !signed &&
    ((ownerConfirmedLegacy && (agenda === "directory" ||
      ("attribution" in before && before.attribution === "EVIDENCE_SIGNATURE_ONLY"))) ||
      (before.reviewState === "APPROVED" && "attribution" in before &&
        before.attribution === "EVIDENCE_SIGNATURE_ONLY"));
  if (!signed && !reviewedLegacy) return notionOnly();
  if (before.lastEditedAt !== savedRevision) return { state: "NEEDS_REVIEW" };
  if (before.reviewState === "REJECTED" || before.reviewState === "PUBLISHED")
    return { state: "NEEDS_REVIEW" };
  const already = planGeminiPublishHandoff(key, before);
  if (already.kind === "NATIVE_EDITOR_REQUIRED")
    // The one-to-one D1 mapping is already verified. A failed Notion mirror
    // must not hide an existing private canonical draft from its owner.
    return { state: "CANONICAL_DRAFT_READY", editorUrl: already.editorUrl };
  if (already.kind === "INVALID") return { state: "NEEDS_REVIEW" };

  try {
    if (agenda === "directory") {
      const result = await runNotionDirectorySyncSweep({
        database, bindings, targetPageId: notionPageId, expectedNotionRevision: savedRevision,
        reviewedLegacy,
      });
      if (!result.enabled || !result.schemaReady) return { state: "NEEDS_REVIEW" };
    } else {
      const result = await runNotionEventsHelpSyncSweep({
        database, bindings, mode: "sync",
        agendas: [agenda], targetPageId: notionPageId, expectedNotionRevision: savedRevision,
        reviewedLegacy,
      });
      if (!result.enabled || !result.schemaReady) return { state: "NEEDS_REVIEW" };
    }
  } catch {
    // A network/Notion/write-back failure can happen AFTER the canonical D1
    // INSERT and identity mapping. Never infer success from the exception;
    // independently verify that the draft exists in D1 below.
  }
  // A sync receipt (failed/conflicted/created count) is not the publication
  // gate. Only an independently verified, private D1 mapping grants editing.
  // If no mapped draft exists, remain in review and never fabricate an editor.
  const after = await readDraft().catch(() => null);
  if (!after) return { state: "NEEDS_REVIEW" };
  // A concurrent Notion publication/rejection is not evidence of a private
  // canonical draft. Require manual D1 verification instead of reporting READY.
  if (after.reviewState === "PUBLISHED" || after.reviewState === "REJECTED")
    return { state: "NEEDS_REVIEW" };
  const handoff = planGeminiPublishHandoff(key, after);
  return handoff.kind === "NATIVE_EDITOR_REQUIRED"
    ? { state: "CANONICAL_DRAFT_READY", editorUrl: handoff.editorUrl }
    : { state: "NEEDS_REVIEW" };
}
