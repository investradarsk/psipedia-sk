import type { GeminiReviewState } from "./gemini-notion-review-state";

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
  agenda?: keyof typeof adminSections;
};

export function geminiCanonicalEditorUrl(draft: GeminiConceptIdentity): string | null {
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
export function geminiSupportsRejectionReason(draft: { agenda?: string }) {
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
