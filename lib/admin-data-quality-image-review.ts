export type MediaReviewAction = "accept" | "reject";
export const MAX_IMAGE_REVIEW_BATCH = 50;
export type MediaReviewResult = {
  requested?: number;
  updated?: number;
  failed?: Array<{ id: number; error: string }>;
};
export function summarizeMediaReviewOutcome(
  action: MediaReviewAction,
  requestedIds: readonly number[],
  result: MediaReviewResult,
) {
  const requestedSet = new Set(requestedIds);
  const failed = (result.failed ?? []).filter(({ id }) => requestedSet.has(id));
  const requested = Math.min(requestedSet.size, Math.max(0, result.requested ?? requestedSet.size));
  const updated = Math.min(requested, Math.max(0, result.updated ?? 0));
  const tone = failed.length === 0 && updated === requested ? "success" as const :
    updated > 0 ? "partial" as const : "error" as const;
  const verb = action === "accept" ? "Schválené" : "Zamietnuté";
  const message = `${tone === "partial" ? "Čiastočný úspech. " : ""}${verb} obrázky: ${updated} z ${requested}.` +
    (failed.length ? ` Zlyhalo: ${failed.length}.` : "") +
    (action === "reject" && updated > 0 ? " Systém sa pokúša nájsť náhradných kandidátov." : "");
  return { failed, requested, updated, tone, message };
}
