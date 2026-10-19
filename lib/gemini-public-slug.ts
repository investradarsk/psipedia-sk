/** Public slugs for provenance-verified Gemini Notion imports only.
 * Immutable Notion page ID is a collision-resistant suffix, not a public "gemini" prefix.
 * An existing human-assigned non-Gemini slug is never silently renamed.
 */
const TABLES = {
  directory: "directory_profiles",
  events: "managed_events",
  organizations: "help_organizations",
  adoptions: "adoption_dogs",
  "help-cases": "help_cases",
  "lost-found": "lost_found_dog_reports",
} as const;
export type GeminiSlugAgenda = keyof typeof TABLES;
export function normalizeGeminiPublicSlug(value: string): string {
  return value.trim().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
export function geminiNeedsPublicSlug(value: string): boolean {
  return !value.trim() || /^gemini-/i.test(value.trim());
}
export function geminiPublicSlug(name: string, city: string, pageId: string, fullId = false): string {
  const id = pageId.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(id)) throw Error("GEMINI_PUBLIC_SLUG_INVALID_PROVENANCE");
  const suffix = fullId ? id : id.slice(0, 12);
  const parts = [normalizeGeminiPublicSlug(name), normalizeGeminiPublicSlug(city)].filter(Boolean);
  const base = (parts.join("-") || "profil").slice(0, 89 - suffix.length).replace(/-+$/g, "");
  return base + "-" + suffix;
}
/** Choose a stable candidate, then the full ID if a collision already exists.
 * The database UNIQUE slug constraint remains the final concurrent-writer guard.
 * Never adopt, overwrite or rename an unrelated canonical row.
 */
export async function resolveGeminiPublicSlug(
  database: Pick<D1Database, "prepare">,
  agenda: GeminiSlugAgenda,
  args: { requestedSlug: string; name: string; city: string; notionPageId: string },
): Promise<string> {
  if (!geminiNeedsPublicSlug(args.requestedSlug)) return args.requestedSlug.trim();
  const table = TABLES[agenda];
  for (const expanded of [false, true]) {
    const slug = geminiPublicSlug(args.name, args.city, args.notionPageId, expanded);
    const exists = await database.prepare(`SELECT 1 AS found FROM ${table} WHERE slug=? LIMIT 1`)
      .bind(slug).first<{ found: number }>();
    if (!exists) return slug;
  }
  throw Error("GEMINI_PUBLIC_SLUG_CONFLICT");
}
