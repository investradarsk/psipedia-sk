/** 0162: independent short description for lost/found dog reports.
 *
 * Existing bidirectional mapping hashes predate this Notion property. Only
 * treat the historical value as empty when the old-schema snapshot validates
 * against the stored common hash. Never invent a baseline for unrelated edits.
 */
export const LOST_FOUND_SHORT_DESCRIPTION_FIELD = "Krátky popis";

export function withoutLostFoundShortDescription<T>(
  snapshot: Record<string, T>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([field]) => field !== LOST_FOUND_SHORT_DESCRIPTION_FIELD),
  );
}

export function extendLostFoundShortDescriptionBaseline<T>(
  verifiedPrior: Record<string, T>,
): Record<string, T | string> {
  return Object.hasOwn(verifiedPrior, LOST_FOUND_SHORT_DESCRIPTION_FIELD)
    ? { ...verifiedPrior }
    : { ...verifiedPrior, [LOST_FOUND_SHORT_DESCRIPTION_FIELD]: "" };
}

/**
 * A blank short description is a legitimate optional-field deletion only
 * when a verified non-empty common baseline exists and the opposite side
 * still holds that exact baseline. An unrelated missing value, concurrent
 * edit or first-time empty Notion property is NOT a deletion receipt.
 */
export function verifiedLostFoundShortDescriptionDeletes(
  baseline: Record<string, unknown> | null,
  notion: Record<string, unknown>,
  psipedia: Record<string, unknown>,
): ReadonlySet<string> {
  const prior = baseline?.[LOST_FOUND_SHORT_DESCRIPTION_FIELD];
  if (typeof prior !== "string" || !prior.trim()) return new Set();
  const remote = notion[LOST_FOUND_SHORT_DESCRIPTION_FIELD];
  const local = psipedia[LOST_FOUND_SHORT_DESCRIPTION_FIELD];
  if (typeof remote !== "string" || typeof local !== "string") return new Set();
  if (!remote.trim() && local === prior) {
    return new Set(["notion:" + LOST_FOUND_SHORT_DESCRIPTION_FIELD]);
  }
  if (!local.trim() && remote === prior) {
    return new Set(["psipedia:" + LOST_FOUND_SHORT_DESCRIPTION_FIELD]);
  }
  return new Set();
}
