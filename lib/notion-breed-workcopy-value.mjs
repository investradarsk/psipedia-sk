/** Empty Notion cells are NOT deletion instructions for canonical breed profiles.
 * False and zero are deliberately kept: they are explicit valid values.
 * Missing or whitespace-only text, null, and empty arrays never clear D1.
 */
export function isTransferableBreedWorkCopyValue(value) {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}
