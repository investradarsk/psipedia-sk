/**
 * Last-mile protection for rich/plain-text inputs in the Directory editor.
 * A Lexical change may reach the save payload before its dirty-path callback.
 * Recover such an edit only if the original Admin form value is still the
 * current D1 value. Never use a stale form to overwrite a newer Notion edit.
 */
export type DirectoryTextEditField = "excerpt" | "description";
const FIELDS: readonly DirectoryTextEditField[] = ["excerpt", "description"];
const normalized = (value: string) => value.replace(/\r\n?/g, "\n").trim();

/** Use Lexical's latest committed snapshot at Save time, never a stale
 * React render value. If the field was never mounted, React owns the value. */
export function readDirectoryEditorTextForSave(
  stateValue: string, liveReader?: (() => string) | null,
): string {
  return liveReader ? liveReader() : stateValue;
}

/**
 * Preserve the stored D1 value for an untouched editor. Lexical may normalize
 * historic paragraph text on mount; that is NOT permission to rewrite it.
 * Actual input (including an explicit clear) always reads committed Lexical.
 */
export function selectDirectoryTextForSave(input: {
  original: string | undefined;
  stateValue: string;
  liveReader?: (() => string) | null;
  explicitlyEdited: boolean;
}): string {
  if (!input.explicitlyEdited && input.original !== undefined) return input.original;
  return readDirectoryEditorTextForSave(input.stateValue, input.liveReader);
}

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
    // Even an explicitly dirty Admin field cannot silently overwrite a
    // different Notion/D1 edit that arrived after the form was opened.
    if (normalized(input.current[field]) !== normalized(oldValue) &&
        normalized(input.current[field]) !== normalized(submittedValue)) {
      conflicts.push(field);
      continue;
    }
    if (edited.has(field) || normalized(input.current[field]) === normalized(submittedValue)) continue;
    edited.add(field);
    recovered.push(field);
  }
  return { editedPaths: [...edited], conflicts, recovered };
}
