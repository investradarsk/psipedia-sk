/** Newly added event SEO focus phrase in canonical Podujatia Notion data source.
 * The old whole-profile content hash never included this property. */
export const EVENT_NOTION_FOCUS_KEYWORD = "SEO kľúčové slovo";

export function withoutEventFocusKeyword<T>(
  snapshot: Record<string, T>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(snapshot).filter(([name]) => name !== EVENT_NOTION_FOCUS_KEYWORD),
  );
}

export function extendEventFocusKeywordBaseline(
  verifiedPrior: Record<string, unknown>,
): Record<string, unknown> {
  return Object.hasOwn(verifiedPrior, EVENT_NOTION_FOCUS_KEYWORD)
    ? { ...verifiedPrior }
    : { ...verifiedPrior, [EVENT_NOTION_FOCUS_KEYWORD]: "" };
}

/** An empty Notion property is missing data, never proof that an existing
 * canonical focus phrase should be deleted. */
export function ignoreUnverifiedEmptyNotionEventKeyword(
  notion: Record<string, unknown>,
  baseline: Record<string, unknown>,
): Record<string, unknown> {
  const prior = baseline[EVENT_NOTION_FOCUS_KEYWORD];
  const proposed = notion[EVENT_NOTION_FOCUS_KEYWORD];
  if (typeof prior === "string" && prior.trim() &&
      (typeof proposed !== "string" || !proposed.trim())) {
    return { ...notion, [EVENT_NOTION_FOCUS_KEYWORD]: prior };
  }
  return { ...notion };
}
