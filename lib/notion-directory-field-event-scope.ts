/**
 * Immediate field-level updates for all ten service categories.
 * Explicit blank edits are real clears; missing fields remain unchanged.
 */
export const DIRECTORY_EVENT_PILOT_CATEGORIES = [
  "veterinari",
  "kynologicke-kluby",
  "fyzioterapia",
  "dalsie-sluzby",
] as const;

export function isDirectoryEventPilotCategory(category: string): boolean {
  return (DIRECTORY_EVENT_PILOT_CATEGORIES as readonly string[]).includes(category);
}

/** One canonical list for webhook delivery, field adapters and Admin writes. */
export const DIRECTORY_FIELD_EVENT_CATEGORIES = [
  "chovatelske-stanice", "treneri", "chovatelske-kluby",
  "kynologicke-kluby", "veterinari", "fyzioterapia",
  "dalsie-sluzby", "salony-a-sluzby", "hotely-a-opatrovanie",
  "vencenie",
] as const;

export type DirectoryFieldEventCategory = typeof DIRECTORY_FIELD_EVENT_CATEGORIES[number];

export function isDirectoryFieldEventCategory(category: string): category is DirectoryFieldEventCategory {
  return (DIRECTORY_FIELD_EVENT_CATEGORIES as readonly string[]).includes(category);
}

/**
 * Property edits must name at least one edited Notion property.
 * Without those IDs we cannot safely infer which field was changed or
 * whether an empty field is an intentional delete. Keep the event pending
 * for review instead of acknowledging a no-op as a successful import.
 */
export function directoryPropertyEventMissingChangedIds(
  eventType: string | undefined,
  changedIds: readonly string[] | undefined,
): boolean {
  return eventType === "page.properties_updated" &&
    (!Array.isArray(changedIds) ||
      !changedIds.some(id => typeof id === "string" && id.trim().length > 0));
}
