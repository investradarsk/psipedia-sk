import type { GeminiReviewState } from "./gemini-notion-review-state";
import { getGeminiCatalogItem } from "./gemini-automation-catalog";

/** A Notion UUID locates a draft; it is never an authorization credential. */
export function geminiValidNotionDraftId(value: string | null | undefined): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value);
}

export function geminiDraftDeepLink(stableKey: string, id: string): string | null {
  if (!getGeminiCatalogItem(stableKey) || !geminiValidNotionDraftId(id)) return null;
  return "/admin/automatizacie-gemini?stable_key=" +
    encodeURIComponent(stableKey) + "&draft_id=" + encodeURIComponent(id) +
    "#gemini-drafts-title";
}


/** Canonical routes come from verified D1 identity, never from Notion title/slug. */
const adminSections = {
  events: "podujatia",
  organizations: "organizacie",
  adoptions: "adopcie",
  "help-cases": "pomoc",
  "lost-found": "stratene-najdene",
} as const;

export type GeminiConceptIdentity = {
  psipediaId: string;
  canonicalVerified?: boolean;
  agenda?: keyof typeof adminSections;
};

export function geminiCanonicalEditorUrl(draft: GeminiConceptIdentity): string | null {
  if (draft.canonicalVerified !== true) return null;
  const id = draft.psipediaId;
  if (!/^[1-9][0-9]*$/.test(id) || !Number.isSafeInteger(Number(id))) return null;
  const section = draft.agenda ? adminSections[draft.agenda] : "adresar";
  return section ? "/admin/" + section + "/" + id : null;
}

export function geminiCanRejectConcept(draft: {
  reviewState: GeminiReviewState;
  psipediaId: string;
}) {
  return !draft.psipediaId && ["NEW", "IN_PROGRESS", "APPROVED"].includes(draft.reviewState);
}

/** Other agenda types have no reliable reason audit property in the existing schema. */
export function geminiSupportsRejectionReason(draft: { agenda?: string; psipediaId: string }) {
  return !draft.agenda || draft.agenda === "help-cases";
}

export function geminiConceptDate(value: string): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bratislava",
  }).format(parsed);
}

/** Local-only filter: API pagination can make this a subset of all Notion drafts. */
export function geminiConceptMatchesSearch(
  draft: { name: string; city?: string | null }, search: string,
): boolean {
  const fold = (value: string) => value.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk-SK");
  const query = fold(search.trim());
  return !query || fold(draft.name).includes(query) || fold(draft.city ?? "").includes(query);
}
