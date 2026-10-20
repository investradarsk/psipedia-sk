import { getGeminiCatalogItem } from "./gemini-automation-catalog";
import { geminiAgendaForKey } from "./gemini-notion-agenda-review";
import { geminiCanonicalEditorUrl } from "./gemini-concept-manager";
import type { GeminiReviewState } from "./gemini-notion-review-state";

/** Publication belongs to the verified native D1 editor, never to Notion review. */
export type GeminiPublishSubject = {
  category?: string; agenda?: string; stableKey?: string;
  psipediaId: string; canonicalVerified?: boolean; reviewState: GeminiReviewState;
};
export function planGeminiPublishHandoff(key: string, draft: GeminiPublishSubject) {
  const item = getGeminiCatalogItem(key);
  if (!item || draft.reviewState === "REJECTED") return { kind: "INVALID" as const };
  if (item.section === "directory") {
    if (draft.agenda || draft.category !== item.subcategory) return { kind: "INVALID" as const };
  } else if (draft.stableKey !== key || draft.agenda !== geminiAgendaForKey(key)) {
    return { kind: "INVALID" as const };
  }
  // A textual Notion Psipedia ID is not a verified canonical mapping.
  if (draft.psipediaId && !draft.canonicalVerified) return { kind: "INVALID" as const };
  if (!draft.psipediaId) return { kind: "IMPORT_REQUIRED" as const };
  const editorUrl = geminiCanonicalEditorUrl(draft);
  if (!editorUrl) return { kind: "INVALID" as const };
  return {
    kind: draft.reviewState === "PUBLISHED" ? "ALREADY_PUBLISHED" as const : "NATIVE_EDITOR_REQUIRED" as const,
    editorUrl,
  };
}
