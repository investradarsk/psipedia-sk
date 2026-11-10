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
