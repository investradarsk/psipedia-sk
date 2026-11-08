import { breedProfileHref, canonicalBreedIdsSql } from "./breed-canonical.ts";
import type { PublicRelatedBreed } from "./content-relations";

/**
 * Explicit breeder relationships. Breeds reuse the canonical
 * breed_directory_relations table; clubs are stored as a private JSON string
 * alongside the breeder's existing metadata, without an additional D1 migration.
 */
export { BREEDER_CLUB_IDS_METADATA_KEY } from "./directory-profile-metadata.ts";
import { BREEDER_CLUB_IDS_METADATA_KEY, TRAINER_BREED_IDS_METADATA_KEY, TRAINER_CLUB_IDS_METADATA_KEY } from "./directory-profile-metadata.ts";

export type BreederRelationSelection = {
  breedIds: number[];
  clubIds: number[];
};
export type BreederRelationOption = { id: number; name: string; slug?: string; city?: string };
export type BreederPublicLink = { id: number; name: string; href: string };

function ids(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((id): id is number =>
    Number.isSafeInteger(id) && id > 0))].slice(0, 40);
}
function parseMetadataIds(sourceJson: string | null | undefined, key: string): number[] {
  if (!sourceJson) return [];
  try {
    const metadata: unknown = JSON.parse(sourceJson);
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
    const value = (metadata as Record<string, unknown>)[key];
    return ids(typeof value === "string" ? JSON.parse(value) : value);
  } catch { return []; }
}
export function parseBreederClubIds(sourceJson: string | null | undefined): number[] {
  return parseMetadataIds(sourceJson, BREEDER_CLUB_IDS_METADATA_KEY);
}
export function validateBreederRelations(value: unknown): BreederRelationSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Neplatné prepojenia.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.breedIds) || !Array.isArray(input.clubIds) ||
    input.breedIds.length > 40 || input.clubIds.length > 40)
    throw Error("Vyber najviac 40 plemien a 40 klubov.");
  const breedIds = ids(input.breedIds), clubIds = ids(input.clubIds);
  if (breedIds.length !== input.breedIds.length || clubIds.length !== input.clubIds.length)
    throw Error("Prepojenia obsahujú neplatné alebo duplicitné ID.");
  return { breedIds, clubIds };
}
type Database = D1Database;
type ProfileRow = { id: number; category: string; source_data_json: string; status: string };
async function breeder(database: Database, profileId: number): Promise<ProfileRow | null> {
  if (!Number.isSafeInteger(profileId) || profileId <= 0) return null;
  return database.prepare(
    "SELECT id,category,source_data_json,status FROM directory_profiles WHERE id=? LIMIT 1",
  ).bind(profileId).first<ProfileRow>();
}
export async function getBreederRelationSelection(
  database: Database, profileId: number,
): Promise<BreederRelationSelection | null> {
  const profile = await breeder(database, profileId);
  if (!profile || !["chovatelske-stanice", "treneri"].includes(profile.category)) return null;
  if (profile.category === "treneri") return {
    breedIds: parseMetadataIds(profile.source_data_json, TRAINER_BREED_IDS_METADATA_KEY),
    clubIds: parseMetadataIds(profile.source_data_json, TRAINER_CLUB_IDS_METADATA_KEY),
  };
  const res = await database.prepare(
    "SELECT breed_id AS id FROM breed_directory_relations WHERE profile_id=? ORDER BY breed_id",
  ).bind(profileId).all<{ id: number }>();
  return { breedIds: (res.results ?? []).map(r => r.id), clubIds: parseBreederClubIds(profile.source_data_json) };
}
export async function listBreederRelationOptions(database: Database) {
  const [breeds, clubs] = await database.batch([
    database.prepare(
      `SELECT id,name,slug FROM managed_breeds WHERE id IN (${canonicalBreedIdsSql}) ORDER BY name COLLATE NOCASE LIMIT 500`,
    ),
    database.prepare(
      "SELECT id,name,slug,city FROM directory_profiles WHERE category='chovatelske-kluby' AND status IN ('draft','published') ORDER BY name COLLATE NOCASE LIMIT 1000",
    ),
  ]);
  return {
    breeds: (breeds.results ?? []) as BreederRelationOption[],
    clubs: (clubs.results ?? []) as BreederRelationOption[],
  };
}
export async function saveBreederRelationSelection(
  database: Database, profileId: number, selection: BreederRelationSelection, actor: string,
) {
  const profile = await breeder(database, profileId);
  if (!profile || !["chovatelske-stanice", "treneri"].includes(profile.category) || profile.status === "archived")
    throw Error("Profil chovateľskej stanice alebo trénera sa nenašiel.");
  const chosen = validateBreederRelations(selection);
  // Every selected record must already exist. These checks never look up or
  // require web/Google/FCI evidence; they only prevent broken profile links.
  const [breedRows, clubRows] = await database.batch([
    database.prepare(
      "SELECT id FROM managed_breeds WHERE status='published' AND id IN (SELECT value FROM json_each(?))",
    ).bind(JSON.stringify(chosen.breedIds)),
    database.prepare(
      "SELECT id FROM directory_profiles WHERE category='chovatelske-kluby' AND status IN ('draft','published') AND id IN (SELECT value FROM json_each(?))",
    ).bind(JSON.stringify(chosen.clubIds)),
  ]);
  if ((breedRows.results ?? []).length !== chosen.breedIds.length ||
      (clubRows.results ?? []).length !== chosen.clubIds.length)
    throw Error("Niektoré vybrané plemená alebo kluby neexistujú.");
  const now = new Date().toISOString();
  if (profile.category === "treneri") {
    // Trainer links have their own metadata keys. Never reuse the breeder
    // relation_type or change breed_directory_relations for other profiles.
    const saved = await database.prepare(`UPDATE directory_profiles
      SET source_data_json=json_set(source_data_json, ?, ?, ?, ?), updated_at=?,updated_by=?
      WHERE id=? AND category='treneri' AND status <> 'archived' AND source_data_json=? RETURNING id`)
      .bind("$." + TRAINER_BREED_IDS_METADATA_KEY, JSON.stringify(chosen.breedIds),
        "$." + TRAINER_CLUB_IDS_METADATA_KEY, JSON.stringify(chosen.clubIds),
        now, actor, profileId, profile.source_data_json).first<{ id: number }>();
    if (!saved) throw Error("Prepojenia sa medzičasom zmenili. Načítaj profil a skús znova.");
    return chosen;
  }
  await database.batch([
    database.prepare("DELETE FROM breed_directory_relations WHERE profile_id=?").bind(profileId),
    ...chosen.breedIds.map(id => database.prepare(
      "INSERT INTO breed_directory_relations (breed_id,profile_id,relation_type,source,created_at,created_by) VALUES (?,?,'breeding-station','manual',?,?)",
    ).bind(id, profileId, now, actor)),
    database.prepare(
      "UPDATE directory_profiles SET source_data_json=json_set(source_data_json, ?, ?),updated_at=?,updated_by=? WHERE id=? AND category='chovatelske-stanice'",
    ).bind('$.' + BREEDER_CLUB_IDS_METADATA_KEY, JSON.stringify(chosen.clubIds), now, actor, profileId),
  ]);
  return chosen;
}
export async function listPublicBreederClubLinks(
  database: Database, profileId: number,
): Promise<BreederPublicLink[]> {
  const profile = await breeder(database, profileId);
  if (!profile || !["chovatelske-stanice", "treneri"].includes(profile.category)) return [];
  const clubIds = profile.category === "treneri"
    ? parseMetadataIds(profile.source_data_json, TRAINER_CLUB_IDS_METADATA_KEY)
    : parseBreederClubIds(profile.source_data_json);
  if (!clubIds.length) return [];
  const result = await database.prepare(
    "SELECT id,name,slug FROM directory_profiles WHERE category='chovatelske-kluby' " +
    "AND status='published' AND archived_at IS NULL AND id IN (SELECT value FROM json_each(?)) " +
    "ORDER BY name COLLATE NOCASE",
  ).bind(JSON.stringify(clubIds)).all<{ id: number; name: string; slug: string }>();
  return (result.results ?? []).map(row => ({
    id: row.id, name: row.name, href: "/adresar/chovatelske-kluby/" + row.slug,
  }));
}

/** Show every selected canonical, published breed, not the generic six-item teaser. */
export async function listPublicBreederBreedLinks(
  database: Database, profileId: number,
): Promise<PublicRelatedBreed[]> {
  const profile = await breeder(database, profileId);
  if (!profile || !["chovatelske-stanice", "treneri"].includes(profile.category)) return [];
  if (profile.category === "treneri") {
    const breedIds = parseMetadataIds(profile.source_data_json, TRAINER_BREED_IDS_METADATA_KEY);
    if (!breedIds.length) return [];
    const rows = await database.prepare(
      `SELECT id,name,slug,image_url,fci_group FROM managed_breeds
       WHERE id IN (${canonicalBreedIdsSql}) AND id IN (SELECT value FROM json_each(?))
       ORDER BY fci_group,name COLLATE NOCASE LIMIT 40`,
    ).bind(JSON.stringify(breedIds)).all<{
      id: number; name: string; slug: string; image_url: string | null; fci_group: number;
    }>();
    return (rows.results ?? []).map(row => ({
      id: row.id, name: row.name, slug: row.slug,
      href: breedProfileHref(row.slug), imageUrl: row.image_url, fciGroup: row.fci_group,
    }));
  }
  const rows = await database.prepare(
    `SELECT DISTINCT b.id,b.name,b.slug,b.image_url,b.fci_group
     FROM breed_directory_relations r
     JOIN managed_breeds b ON b.id=r.breed_id
     WHERE r.profile_id=? AND b.id IN (${canonicalBreedIdsSql})
     ORDER BY b.fci_group,b.name COLLATE NOCASE LIMIT 40`,
  ).bind(profileId).all<{
    id: number; name: string; slug: string; image_url: string | null; fci_group: number;
  }>();
  return (rows.results ?? []).map(row => ({
    id: row.id, name: row.name, slug: row.slug,
    href: breedProfileHref(row.slug), imageUrl: row.image_url, fciGroup: row.fci_group,
  }));
}
