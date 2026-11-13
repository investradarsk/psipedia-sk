import { BREED_NOTION_SCHEMA } from "./notion-breed-property-registry.ts";
import { notionBreedRichTextProperty } from "./notion-breed-text.ts";

/**
 * A present, explicitly edited Notion property is authoritative even if its
 * new value is blank, false, null or an empty list. Missing properties never
 * count as edits; legacy untargeted sweeps retain their old presence behavior
 * until a signed field event establishes the owner's latest action.
 */
export function breedNotionPresentFieldIds(page: {
  properties?: Record<string, unknown>;
}, changedPropertyIds: readonly string[] = []): ReadonlySet<string> {
  const props = page.properties ?? {};
  const explicitlyEdited = new Set(changedPropertyIds);
  const textOf = (pieces: unknown): string => {
    if (!Array.isArray(pieces)) return "";
    return pieces.map((piece: unknown) => {
      if (!piece || typeof piece !== "object") return "";
      const entry = piece as Record<string, unknown>;
      if (typeof entry.plain_text === "string") return entry.plain_text;
      const text = entry.text;
      return text && typeof text === "object" &&
        typeof (text as Record<string, unknown>).content === "string"
        ? (text as Record<string, string>).content : "";
    }).join("").trim();
  };
  const meaningful = (value: unknown): boolean => {
    if (value === null || value === undefined) return false;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "number") return Number.isFinite(value);
    if (typeof value === "boolean") return true;
    if (Array.isArray(value)) return value.some(meaningful);
    return typeof value === "object" &&
      Object.values(value as Record<string, unknown>).some(meaningful);
  };
  const filled = (name: string, type: string, id: string): boolean => {
    const value = props[name];
    if (!value || typeof value !== "object") return false;
    const entry = value as Record<string, unknown>;
    if (type === "checkbox") return typeof entry.checkbox === "boolean";
    if (type === "number") return typeof entry.number === "number" && Number.isFinite(entry.number);
    if (type === "date") return meaningful((entry.date as Record<string, unknown> | null)?.start);
    if (type === "url") return meaningful(entry.url);
    if (type === "select") return meaningful((entry.select as Record<string, unknown> | null)?.name);
    if (type === "title") return meaningful(textOf(entry.title));
    const text = notionBreedRichTextProperty(page, name);
    if (!text) return false;
    // An empty structured list is an empty source, not an instruction to clear.
    if (["gallery", "sports", "editorial.heroTraits"].includes(id)) {
      try { return meaningful(JSON.parse(text)); } catch { return true; }
    }
    return true;
  };
  const aggregate = (name: string): Record<string, unknown> => {
    const raw = notionBreedRichTextProperty(page, name);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  };
  const fci = aggregate("FCI štandard JSON");
  const editorial = aggregate("Redakčné sekcie JSON");
  const fields = new Set<string>();
  for (const entry of BREED_NOTION_SCHEMA) {
    if (entry.mode !== "content") continue;
    const physical = props[entry.notion] as { id?: unknown } | undefined;
    if (physical && (explicitlyEdited.has(entry.notion) ||
        (typeof physical.id === "string" && explicitlyEdited.has(physical.id)))) {
      fields.add(entry.id);
      continue;
    }
    if (filled(entry.notion, entry.type, entry.id)) {
      fields.add(entry.id);
      continue;
    }
    if (entry.id.startsWith("fciStandard.") &&
        meaningful(fci[entry.id.slice("fciStandard.".length)])) {
      fields.add(entry.id);
    }
    if (entry.id.startsWith("editorial.") &&
        meaningful(editorial[entry.id.slice("editorial.".length)])) {
      fields.add(entry.id);
    }
  }
  return fields;
}
