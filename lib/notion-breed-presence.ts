import { BREED_NOTION_SCHEMA } from "./notion-breed-property-registry.ts";
import { notionBreedRichTextProperty } from "./notion-breed-text.ts";

/**
 * An absent API property is not an explicit deletion. A present empty Notion
 * property is a genuine clear. Nested FCI/editorial leaves may also arrive
 * through the aggregate JSON field on older data-source schemas.
 */
export function breedNotionPresentFieldIds(page: {
  properties?: Record<string, unknown>;
}): ReadonlySet<string> {
  const props = page.properties ?? {};
  const present = (key: string) => Boolean(
    props[key] && typeof props[key] === "object"
  );
  function aggregate(name: string): Record<string, unknown> {
    if (!present(name)) return {};
    const raw = notionBreedRichTextProperty(page, name);
    if (!raw) return {};
    try {
      const parsed: unknown = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  const fci = aggregate("FCI štandard JSON");
  const editorial = aggregate("Redakčné sekcie JSON");
  const fields = new Set<string>();
  for (const entry of BREED_NOTION_SCHEMA) {
    if (entry.mode !== "content") continue;
    if (present(entry.notion)) {
      fields.add(entry.id);
      continue;
    }
    if (entry.id.startsWith("fciStandard.") &&
        Object.prototype.hasOwnProperty.call(fci, entry.id.slice(12))) {
      fields.add(entry.id);
    }
    if (entry.id.startsWith("editorial.") &&
        Object.prototype.hasOwnProperty.call(editorial, entry.id.slice(10))) {
      fields.add(entry.id);
    }
  }
  return fields;
}
