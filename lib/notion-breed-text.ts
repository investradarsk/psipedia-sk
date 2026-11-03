/**
 * Breed editorial texts must keep their paragraph breaks. The generic
 * Notion reader normalizes whitespace for search/metadata, which is not
 * appropriate for multi-paragraph FCI and veterinary content.
 */
export function notionBreedRichTextProperty(page: {
  properties?: Record<string, unknown>;
}, property: string): string {
  const entry = page.properties?.[property];
  if (!entry || typeof entry !== "object") return "";
  const pieces = (entry as Record<string, unknown>).rich_text;
  if (!Array.isArray(pieces)) return "";
  return pieces.map((piece: unknown) => {
    if (!piece || typeof piece !== "object") return "";
    const value = piece as Record<string, unknown>;
    if (typeof value.plain_text === "string") return value.plain_text;
    const text = value.text;
    if (text && typeof text === "object") {
      const content = (text as Record<string, unknown>).content;
      if (typeof content === "string") return content;
    }
    return "";
  }).join("").trim();
}
