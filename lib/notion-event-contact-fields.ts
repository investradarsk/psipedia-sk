/**
 * Notion fields introduced alongside D1 event contacts/admission migration 0160.
 * Historical per-profile hashes did not include them, so adding the fields must
 * not invalidate a previously verified baseline for unrelated event properties.
 */
export const EVENT_NOTION_CONTACT_FIELDS = [
  "Telefón organizátora",
  "E-mail organizátora",
  "Vstupné",
] as const;

export function withoutEventContactFields<T>(
  snapshot: Record<string, T>,
): Record<string, T> {
  const removed = new Set<string>(EVENT_NOTION_CONTACT_FIELDS);
  return Object.fromEntries(
    Object.entries(snapshot).filter(([name]) => !removed.has(name)),
  );
}

/**
 * The three Notion properties were just created empty. For historical
 * snapshots verified against the old stored hash, absence of a new property
 * has a known initial value of "", not an unknown old value.
 */
export function extendEventContactBaseline(
  verifiedPrior: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...verifiedPrior };
  for (const field of EVENT_NOTION_CONTACT_FIELDS) {
    if (!Object.hasOwn(merged, field)) merged[field] = "";
  }
  return merged;
}

/**
 * Empty text sent from Notion is not a deletion receipt. If the last common
 * value was nonempty, ignore this Notion blank and mirror the canonical value
 * back. A previously blank value is retained to allow the initial backfill or
 * an explicit new Notion value to go through the normal three-way merge.
 */
export function ignoreUnverifiedEmptyNotionEventContacts(
  notion: Record<string, unknown>,
  baseline: Record<string, unknown>,
): Record<string, unknown> {
  const safe = { ...notion };
  for (const field of EVENT_NOTION_CONTACT_FIELDS) {
    const prior = baseline[field];
    if (typeof prior === "string" && prior.trim() &&
      (typeof safe[field] !== "string" || !safe[field].trim())) {
      safe[field] = prior;
    }
  }
  return safe;
}
