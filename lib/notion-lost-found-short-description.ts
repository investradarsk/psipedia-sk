/**
 * Migration 0162 added the lost/found short description to D1, while old
 * bidirectional Notion snapshots did not contain this already-existing Notion
 * property. Reconcile the new field without invalidating an authenticated
 * pre-0162 baseline for any other field.
 */
export const LOST_FOUND_SHORT_DESCRIPTION_FIELD = "Krátky popis";

export function withoutLostFoundShortDescription<T>(
  values: Record<string, T>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(values).filter(([field]) => field !== LOST_FOUND_SHORT_DESCRIPTION_FIELD),
  );
}

/**
 * Only use with a baseline independently authenticated by its stored hash.
 * The old sync never wrote this field, so both sides have to be compared
 * against an initial empty sync baseline, not against an invented value.
 */
export function extendLostFoundShortDescriptionBaseline<T>(
  authenticatedPrevious: Record<string, T>,
): Record<string, T | string> {
  return {
    ...authenticatedPrevious,
    [LOST_FOUND_SHORT_DESCRIPTION_FIELD]:
      authenticatedPrevious[LOST_FOUND_SHORT_DESCRIPTION_FIELD] ?? "",
  };
}
