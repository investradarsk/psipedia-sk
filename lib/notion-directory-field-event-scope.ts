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

export function isDirectoryFieldEventCategory(category: string): boolean {
  return [
    "veterinari", "treneri", "kynologicke-kluby", "chovatelske-kluby",
    "chovatelske-stanice", "salony-a-sluzby", "hotely-a-opatrovanie",
    "vencenie", "fyzioterapia", "dalsie-sluzby",
  ].includes(category);
}
