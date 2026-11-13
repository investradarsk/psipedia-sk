/**
 * Safety barrier between an Admin form snapshot and the current D1 contacts.
 *
 * A dirty-path diff against an old editor baseline is NOT proof the user
 * edited a contact. Require the input's own interaction receipt. A contact
 * edited after a newer D1 change is a conflict, never a last-write-wins clear.
 * This module does not call Notion or write to D1.
 */
export const DIRECTORY_CONTACT_SAVE_FIELDS = [
  "websiteUrl", "publicPhone", "publicEmail", "facebookUrl", "instagramUrl",
] as const;
export type DirectoryContactSaveField = typeof DIRECTORY_CONTACT_SAVE_FIELDS[number];

const isContact = (field: string): field is DirectoryContactSaveField =>
  (DIRECTORY_CONTACT_SAVE_FIELDS as readonly string[]).includes(field);

export function scopeAdminContactSave(input: {
  editedPaths: readonly string[];
  interactedFields: unknown;
  originalValues: unknown;
  currentValues: Record<DirectoryContactSaveField, string>;
  submitted: Record<string, unknown>;
}) {
  const interacted = new Set(
    Array.isArray(input.interactedFields)
      ? input.interactedFields.filter((value): value is DirectoryContactSaveField =>
        typeof value === "string" && isContact(value))
      : [],
  );
  const previous = input.originalValues && typeof input.originalValues === "object" &&
    !Array.isArray(input.originalValues)
    ? input.originalValues as Record<string, unknown>
    : null;
  const candidates = new Set<string>(input.editedPaths);
  for (const field of interacted) {
    // React's dirty diff could lag behind a last-keystroke event. The actual
    // contact input event, together with a changed original value, is enough.
    const original = previous?.[field];
    if (typeof original === "string" &&
        typeof input.submitted[field] === "string" &&
        original !== input.submitted[field]) candidates.add(field);
  }

  // Outdated Admin bundles cannot silently erase contacts using full-form
  // snapshots. They must be refreshed before intentionally editing contacts.
  const incompatible = [...candidates].some(field => isContact(field)) &&
    (!Array.isArray(input.interactedFields) || !previous);

  const editedPaths = [...candidates].filter(field => !isContact(field) || interacted.has(field));
  const conflicts: DirectoryContactSaveField[] = [];
  const explicitClears: DirectoryContactSaveField[] = [];
  for (const field of editedPaths) {
    if (!isContact(field)) continue;
    const original = previous?.[field];
    const requested = input.submitted[field];
    if (typeof original !== "string" || typeof requested !== "string") {
      conflicts.push(field);
      continue;
    }
    const live = input.currentValues[field] ?? "";
    if (live !== original && live !== requested) {
      conflicts.push(field);
      continue;
    }
    if (!requested.trim()) explicitClears.push(field);
  }
  return { editedPaths, explicitClears, conflicts, incompatible };
}
