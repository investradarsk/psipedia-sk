/**
 * Deliberately limited rollout of immediate, per-field Directory updates.
 * Other categories retain the existing reconciliation pipeline.
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

export function isDirectoryFieldEventCategory(category: string): boolean {
  return category === "chovatelske-stanice" ||
    category === "treneri" ||
    category === "salony-a-sluzby" ||
    isDirectoryEventPilotCategory(category);
}
