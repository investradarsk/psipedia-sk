/** Missing values are never deletions. Explicit edits may clear blank,
 * null or empty list values. Default callers remain non-destructive.
 */
export function isTransferableBreedWorkCopyValue(value, explicitlyChanged = false) {
  if (value === undefined) return false;
  if (value === null) return explicitlyChanged;
  if (typeof value === "string" && !value.trim()) return explicitlyChanged;
  if (Array.isArray(value) && value.length === 0) return explicitlyChanged;
  return true;
}
