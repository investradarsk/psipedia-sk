import type { HelpEditorType } from "@/lib/partner-help-editor-fields";

/**
 * D1 search_text is derived from public searchable columns only.
 * A contact-only/photo-only save must never bind placeholders for an absent
 * search_text assignment or mutate unrelated fields.
 */
const columns: Record<HelpEditorType, readonly string[]> = {
  ADOPTION_DOG: ["name","breed_name","organization_name","city","region","description","color"],
  LOST_FOUND_DOG: ["dog_name","breed","color","city","region","description","short_description"],
  HELP_CASE: [],
};

export function helpSearchIndexAssignment(type: HelpEditorType, patch: Readonly<Record<string,unknown>>) {
  const searchable = columns[type];
  if (!searchable.some(column => Object.hasOwn(patch,column))) {
    return { sql: "", bindings: [] as unknown[] };
  }
  return {
    sql: "search_text=lower(" + searchable.map(column => `coalesce(?,coalesce(${column},''))`).join("||' '||") + ")",
    bindings: searchable.map(column => Object.hasOwn(patch,column) ? patch[column] : null),
  };
}
