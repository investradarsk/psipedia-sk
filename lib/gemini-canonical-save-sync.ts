import { geminiImportAgenda } from "./gemini-notion-provenance";
import { planGeminiPublishHandoff } from "./gemini-canonical-publish-handoff";
import { getGeminiDirectoryDraft } from "./gemini-notion-directory-review";
import { getGeminiAgendaDraft } from "./gemini-notion-agenda-review";
import { runNotionDirectorySyncSweep, type NotionDirectorySyncBindings } from "./notion-directory-sync";
import { runNotionEventsHelpSyncSweep, type NotionEventsHelpSyncBindings } from "./notion-events-help-sync";
import { geminiValidNotionDraftId } from "./gemini-concept-manager";
import { getGeminiCatalogItem } from "./gemini-automation-catalog";
import { verifiedPrivateGeminiEditor } from "./gemini-import-d1-verification";
import { recoverOwnerConfirmedLegacyLocks } from "./gemini-stale-lock-recovery";

type Bindings = NotionDirectorySyncBindings & NotionEventsHelpSyncBindings & { DB?: D1Database };
export type GeminiCanonicalSaveResult = {
  state: "CANONICAL_DRAFT_READY" | "NOTION_ONLY" | "NEEDS_REVIEW";
  editorUrl?: string;
  issue?: string;
};
const notionOnly = (): GeminiCanonicalSaveResult => ({ state: "NOTION_ONLY", issue: "ORIGIN_NOT_VERIFIED" });
/** Classify safely; never return provider error bodies or private Notion fields. */
function safeImportIssue(input: string): string {
  if (/429|rate.limit|too many requests/i.test(input)) return "NOTION_RATE_LIMIT";
  if (/403|forbidden|unauthoriz/i.test(input)) return "NOTION_PERMISSION";
  if (/notion.*(timeout|fetch|network)|network_error/i.test(input)) return "NOTION_NETWORK";
  if (/DUPLICATE_CONFLICT|DUPLICATE/i.test(input)) return "DUPLICATE";
  if (/GEMINI_PRIVATE_DRAFT_REQUIRED/i.test(input)) return "PRIVATE_STATUS_REQUIRED";
  if (/GEMINI_CATEGORY_MISMATCH/i.test(input)) return "CATEGORY_MISMATCH";
  if (/GEMINI_SAVED_REVISION_CHANGED/i.test(input)) return "NOTION_REVISION_CHANGED";
  if (/GEMINI_CANONICAL_DRAFT_INCOMPLETE/i.test(input)) return "REQUIRED_IDENTITY";
  if (/GEMINI_LOST_FOUND_TYPE_REQUIRED|GEMINI_HELP_CATEGORY_REQUIRED/i.test(input)) return "REQUIRED_CATEGORY";
  if (/LOCKED|LOCK/i.test(input)) return "IMPORT_BUSY";
  if (/schema|target_missing|SCHEMA/i.test(input)) return "SYNC_SCHEMA";
  if (/Neplatn|neplatn|VALIDAT|invalid/i.test(input)) return "INVALID_DATA";
  return "D1_NOT_CONFIRMED";
}

/** Reconcile exactly one signed Gemini-origin Notion save, never publish.
 * Reuses the original Directory/Events/Help sync and native D1 editors.
 * An uncertain result never causes a second remote create automatically.
 */
export async function reconcileGeminiSavedDraft(input: {
  database: D1Database; bindings: Bindings; key: string; notionPageId: string; savedRevision: string;
  /** Explicit authenticated Admin action only: accept one exact legacy Gemini evidence page. */
  ownerConfirmedLegacy?: boolean;
  /** Server-only Notion evidence already fetched and revision-validated by the authenticated owner route. */
  validatedDraft?: Awaited<ReturnType<typeof getGeminiDirectoryDraft>> |
    Awaited<ReturnType<typeof getGeminiAgendaDraft>>["draft"];
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
  if (!signed && agenda === "directory" && !ownerConfirmedLegacy) return notionOnly();

  // Exclusion belongs to the original sync pipelines so scheduled and manual
  // imports contend for the same locks, not independent caller-only locks.
  const readDraft = async () => agenda === "directory"
    ? getGeminiDirectoryDraft(bindings, notionPageId)
    : (await getGeminiAgendaDraft(bindings, key, notionPageId)).draft;
  const before = input.validatedDraft ?? await readDraft();
  // A pre-signature Notion concept can enter canonical D1 only after a
  // human has explicitly approved it in the authenticated Gemini editor.
  // Signed callback provenance is never fabricated for legacy pages.
  const reviewedLegacy = !signed &&
    ((ownerConfirmedLegacy && (agenda === "directory" ||
      ("attribution" in before && before.attribution === "EVIDENCE_SIGNATURE_ONLY"))) ||
      (before.reviewState === "APPROVED" && "attribution" in before &&
        before.attribution === "EVIDENCE_SIGNATURE_ONLY"));
  if (!signed && !reviewedLegacy) return notionOnly();
  // A server-supplied snapshot is not a bypass: it must be the same Notion
  // page and category already validated by the owner API.
  if (before.id !== notionPageId ||
      (agenda === "directory" ? !("category" in before) ||
          before.category !== getGeminiCatalogItem(key)?.subcategory
        : !("agenda" in before) || before.agenda !== agenda ||
          !("stableKey" in before) || before.stableKey !== key))
    return { state: "NEEDS_REVIEW", issue: "ORIGIN_NOT_VERIFIED" };
  if (before.lastEditedAt !== savedRevision) return { state: "NEEDS_REVIEW", issue: "NOTION_REVISION_CHANGED" };
  if (before.reviewState === "REJECTED" || before.reviewState === "PUBLISHED")
    return { state: "NEEDS_REVIEW" };
  const already = planGeminiPublishHandoff(key, before);
  if (already.kind === "NATIVE_EDITOR_REQUIRED")
    // The one-to-one D1 mapping is already verified. A failed Notion mirror
    // must not hide an existing private canonical draft from its owner.
    return { state: "CANONICAL_DRAFT_READY", editorUrl: already.editorUrl };
  if (already.kind === "INVALID") return { state: "NEEDS_REVIEW" };

  // Legacy imports could have been blocked by permanent locks left by a
  // previous failed pre-insert operation. Only the authenticated owner path
  // is allowed to attempt recovery, after checking D1 for orphaned drafts.
  if (ownerConfirmedLegacy) {
    const existing = await verifiedPrivateGeminiEditor(database, agenda, notionPageId)
      .catch(() => null);
    if (existing) return { state: "CANONICAL_DRAFT_READY", editorUrl: existing };
    const recovery = await recoverOwnerConfirmedLegacyLocks(database, agenda, notionPageId);
    if (recovery.state === "ACTIVE_LOCK") return { state: "NEEDS_REVIEW", issue: "IMPORT_LOCK_BUSY" };
    if (recovery.state === "UNMAPPED_CANONICAL") return { state: "NEEDS_REVIEW", issue: "POSSIBLE_ORPHAN" };
    if (recovery.state === "LOCK_CHECK_FAILED") return { state: "NEEDS_REVIEW", issue: "IMPORT_LOCK_CHECK" };
  }
  let issue = "D1_NOT_CONFIRMED";
  let syncUnavailable = false;
  try {
    if (agenda === "directory") {
      const result = await runNotionDirectorySyncSweep({
        database, bindings, targetPageId: notionPageId, expectedNotionRevision: savedRevision,
        reviewedLegacy,
      });
      if (!result.enabled) { issue = "SYNC_DISABLED"; syncUnavailable = true; }
      else if (!result.schemaReady) { issue = "SYNC_SCHEMA"; syncUnavailable = true; }
      else if (result.failed) issue = "SYNC_FAILED";
    } else {
      const result = await runNotionEventsHelpSyncSweep({
        database, bindings, mode: "sync",
        agendas: [agenda], targetPageId: notionPageId, expectedNotionRevision: savedRevision,
        reviewedLegacy,
      });
      if (!result.enabled) { issue = "SYNC_DISABLED"; syncUnavailable = true; }
      else if (!result.schemaReady) { issue = "SYNC_SCHEMA"; syncUnavailable = true; }
      else {
        const item = result.agendas.find(entry => entry.agenda === agenda);
        if (item?.targetMissing) issue = "SYNC_TARGET_MISSING";
        else if (item?.errors?.length) issue = safeImportIssue(item.errors[0].message);
        else if (item?.conflictDetails?.length) issue = safeImportIssue(item.conflictDetails[0].reason);
      }
    }
  } catch (error) {
    // A Notion timeout can occur AFTER the canonical INSERT. Never guess
    // from the exception whether D1 created the record.
    issue = safeImportIssue(error instanceof Error ? error.message : String(error));
  }
  // Canonical D1 mapping + real private row, not Notion's eventually updated
  // Psipedia ID, is the authoritative import acknowledgement.
  const verifiedEditor = await verifiedPrivateGeminiEditor(database, agenda, notionPageId)
    .catch(() => null);
  if (verifiedEditor)
    return { state: "CANONICAL_DRAFT_READY", editorUrl: verifiedEditor };
  // A disabled sync or missing D1 schema cannot bootstrap a new identity.
  // Do not confuse a stale Notion marker with a successful import.
  if (syncUnavailable) return { state: "NEEDS_REVIEW", issue };
  // Fallback keeps existing verified Notion/legacy mapping behavior, but
  // provider rate limits must no longer hide a confirmed D1 draft.
  const after = await readDraft().catch(() => null);
  if (!after) return { state: "NEEDS_REVIEW", issue };
  // A concurrent Notion publication/rejection is not evidence of a private
  // canonical draft. Require manual D1 verification instead of reporting READY.
  if (after.reviewState === "PUBLISHED" || after.reviewState === "REJECTED")
    return { state: "NEEDS_REVIEW" };
  const handoff = planGeminiPublishHandoff(key, after);
  return handoff.kind === "NATIVE_EDITOR_REQUIRED"
    ? { state: "CANONICAL_DRAFT_READY", editorUrl: handoff.editorUrl }
    : { state: "NEEDS_REVIEW", issue };
}
