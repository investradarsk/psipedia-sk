/**
 * Human-readable Notion mirror of canonical breeder links.
 * Plain text is never interpreted as an ID; unknown or ambiguous names
 * leave the existing relation selection intact, without blocking sync.
 */
export const BREEDER_NOTION_RELATION_FIELDS = {
  breedIds: "Prepojené plemená",
  clubIds: "Prepojené kluby",
} as const;

export type BreederRelationField = keyof typeof BREEDER_NOTION_RELATION_FIELDS;
export type BreederNameOption = { id: number; name: string };

export function normalizedBreederRelationName(value: string): string {
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("sk")
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Each line (or semicolon-separated value) names one existing entity. */
export function parseBreederRelationText(value: string): string[] {
  return [...new Set(value.split(/\r?\n|;/g).map(name => name.trim()).filter(Boolean))];
}

export function breederRelationChangedFields(
  properties: Record<string, unknown> | undefined,
  changedPropertyIds: readonly string[],
): BreederRelationField[] {
  const changed = new Set(changedPropertyIds);
  if (!changed.size) return [];
  return (Object.keys(BREEDER_NOTION_RELATION_FIELDS) as BreederRelationField[])
    .filter(field => {
      const name = BREEDER_NOTION_RELATION_FIELDS[field];
      const property = properties?.[name];
      const id = property && typeof property === "object"
        ? (property as { id?: unknown }).id : undefined;
      return changed.has(name) || (typeof id === "string" && changed.has(id));
    });
}

export function resolveBreederRelationText(
  value: string,
  options: readonly BreederNameOption[],
): { status: "empty" | "resolved" | "unmatched"; ids: number[]; unmatched: string[] } {
  const names = parseBreederRelationText(value);
  // An empty Notion cell never instructs Admin to erase valid links.
  if (!names.length) return { status: "empty", ids: [], unmatched: [] };
  const byName = new Map<string, number[]>();
  for (const option of options) {
    const key = normalizedBreederRelationName(option.name);
    byName.set(key, [...(byName.get(key) ?? []), option.id]);
  }
  const ids: number[] = [], unmatched: string[] = [];
  for (const name of names) {
    const matches = byName.get(normalizedBreederRelationName(name)) ?? [];
    if (matches.length !== 1) unmatched.push(name);
    else if (!ids.includes(matches[0])) ids.push(matches[0]);
  }
  // Never partially replace an existing selection when one name is unknown.
  if (unmatched.length || ids.length > 40)
    return { status: "unmatched", ids: [], unmatched };
  return { status: "resolved", ids, unmatched: [] };
}

export function formatBreederRelationText(
  ids: readonly number[],
  options: readonly BreederNameOption[],
): string | null {
  const byId = new Map(options.map(option => [option.id, option.name]));
  const names = ids.map(id => byId.get(id));
  // Missing canonical records must not silently delete an existing Notion value.
  if (names.some(name => !name)) return null;
  return [...new Set(names as string[])].sort((a, b) => a.localeCompare(b, "sk")).join("\n");
}

export function sameBreederRelationIds(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && [...a].sort((x, y) => x - y).every((id, i) => id === [...b].sort((x, y) => x - y)[i]);
}
