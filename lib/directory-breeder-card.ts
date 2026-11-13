import { canonicalBreedIdsSql } from "@/lib/breed-canonical";
import type { PublicDirectoryProfile } from "@/lib/directory";

const BREEDER_CATEGORY = "chovatelske-stanice";

/**
 * Fallback only: editorial breed names already stored on the profile.
 * Never confuse a breeding-status flag with a breed name.
 */
export function breederBreedSourceLabel(value: unknown): string {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => typeof item === "string" ? item.trim() : "").filter(Boolean))].join(", ");
  }
  if (typeof value !== "string") return "";
  const text = value.trim();
  if (!text || /^(?:aktívny chov|active breeding|áno|nie|yes|no)$/iu.test(text)) return "";
  if (text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      return Array.isArray(parsed) ? breederBreedSourceLabel(parsed) : "";
    } catch {
      return "";
    }
  }
  return text.replace(/\s*[;\n]+\s*/gu, ", ").replace(/\s+/gu, " ");
}

/**
 * One bounded read for every displayed breeder card, not N per-profile reads.
 * Canonically linked published breeds win over older editorial text. Unrelated
 * directory categories never query breed relationships.
 */
export async function attachBreederCardBreeds(
  database: D1Database,
  profiles: PublicDirectoryProfile[],
): Promise<PublicDirectoryProfile[]> {
  const breederIds = [...new Set(profiles
    .filter((profile) => profile.category === BREEDER_CATEGORY)
    .map((profile) => profile.id))];
  if (!breederIds.length) return profiles;

  try {
    const result = await database.prepare(`
      SELECT DISTINCT r.profile_id AS profileId, b.name AS breedName
      FROM breed_directory_relations r
      JOIN managed_breeds b ON b.id = r.breed_id
      WHERE r.profile_id IN (SELECT CAST(value AS INTEGER) FROM json_each(?))
        AND b.id IN (${canonicalBreedIdsSql})
      ORDER BY r.profile_id, b.name COLLATE NOCASE
    `).bind(JSON.stringify(breederIds)).all<{ profileId: number; breedName: string }>();

    const breedsByProfile = new Map<number, string[]>();
    for (const row of result.results ?? []) {
      const name = row.breedName?.trim();
      if (!name) continue;
      const names = breedsByProfile.get(row.profileId) ?? [];
      if (!names.includes(name)) names.push(name);
      breedsByProfile.set(row.profileId, names);
    }

    return profiles.map((profile) => {
      if (profile.category !== BREEDER_CATEGORY) return profile;
      const names = breedsByProfile.get(profile.id);
      return names?.length
        ? { ...profile, breedSummary: names.join(", ") }
        : profile;
    });
  } catch {
    // A missing optional relation projection cannot break public listings.
    // Keep only the actual editorial breed label, never invent a breed.
    return profiles;
  }
}
