/** UI projection of the existing Notion editorial/publication lifecycle. */
export const geminiReviewLabels = {
  NEW: "Nový", IN_PROGRESS: "Rozpracovaný", APPROVED: "Schválený",
  REJECTED: "Odmietnutý", PUBLISHED: "Publikovaný", IMPORTED: "Importovaný koncept",
} as const;
export type GeminiReviewState = keyof typeof geminiReviewLabels;
export function geminiReviewState(input: {
  editorialState: string; psipediaStatus: string; psipediaId: string;
  reviewed: boolean; canonicalStatus?: string;
}): GeminiReviewState {
  if (input.canonicalStatus === "published") return "PUBLISHED";
  if (input.psipediaId) return "IMPORTED";
  if (input.editorialState === "Archív" || input.psipediaStatus === "Archív") return "REJECTED";
  if (input.editorialState === "Publikované" && input.psipediaStatus === "Publikované") return "APPROVED";
  return input.reviewed ? "IN_PROGRESS" : "NEW";
}
export function geminiReviewCounts(drafts: { reviewState: GeminiReviewState }[]) {
  const counts = Object.fromEntries(Object.keys(geminiReviewLabels).map(key => [key, 0])) as Record<GeminiReviewState, number>;
  for (const draft of drafts) counts[draft.reviewState]++;
  return counts;
}
