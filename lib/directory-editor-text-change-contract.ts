/**
 * Last-mile protection for rich/plain-text inputs in the Directory editor.
 * A Lexical change may reach the save payload before its dirty-path callback.
 * Recover such an edit only if the original Admin form value is still the
 * current D1 value. Never use a stale form to overwrite a newer Notion edit.
 */
export type DirectoryTextEditField = "excerpt" | "description";
const FIELDS: readonly DirectoryTextEditField[] = ["excerpt", "description"];
const normalized = (value: string) => value.replace(/\r\n?/g, "\n").trim();

export function reconcileDirectorySubmittedTextFields(input: {
  current: Readonly<{ excerpt: string; description: string }>;
  submitted: Readonly<{ excerpt?: unknown; description?: unknown }>;
  original: unknown;
  editedPaths: readonly string[];
}): { editedPaths: string[]; conflicts: DirectoryTextEditField[]; recovered: DirectoryTextEditField[] } {
  const edited = new Set(input.editedPaths);
  const recovered: DirectoryTextEditField[] = [];
  const conflicts: DirectoryTextEditField[] = [];
  const original = input.original;
  if (!original || typeof original !== "object" || Array.isArray(original))
    return { editedPaths: [...edited], conflicts, recovered };
  const baseline = original as Record<string, unknown>;

  for (const field of FIELDS) {
    const oldValue = baseline[field];
    const submittedValue = input.submitted[field];
    if (typeof oldValue !== "string" || typeof submittedValue !== "string") continue;
    if (normalized(submittedValue) === normalized(oldValue)) continue;
    if (edited.has(field)) continue;
    if (normalized(input.current[field]) !== normalized(oldValue)) {
      conflicts.push(field);
    } else {
      edited.add(field);
      recovered.push(field);
    }
  }
  return { editedPaths: [...edited], conflicts, recovered };
}
