import { env } from "cloudflare:workers";

export const FACEBOOK_SHARE_MARKER_TYPES = [
  "article", "directory", "events", "breeds", "organization", "adoption", "lost_found", "help_case",
] as const;
export type FacebookShareMarkerType = typeof FACEBOOK_SHARE_MARKER_TYPES[number];

type Database = Pick<D1Database, "prepare">;

function getDb(): Database {
  const binding = (env as unknown as {DB?: D1Database}).DB;
  if (!binding) throw new Error("Databáza evidencie Facebook zdieľaní nie je dostupná.");
  return binding;
}

/** Map canonical public records to one stable key regardless of list page/category.
 * Some Help categories live in different D1 tables, so the group alone is not a unique identity. */
export function facebookShareMarkerType(group: string, category = ""): FacebookShareMarkerType | null {
  if (group === "article") return "article";
  if (group === "directory") return "directory";
  if (group === "events") return "events";
  if (group === "breeds") return "breeds";
  if (group === "help") {
    if (category === "utulky") return "organization";
    if (category === "adopcia") return "adoption";
    if (category === "stratene-psy" || category === "najdene-psy") return "lost_found";
    if (["docasna-opatera","zbierky","dobrovolnictvo","urgentne-pripady"].includes(category))
      return "help_case";
  }
  return null;
}
function isMissingMigration(error: unknown) {
  return error instanceof Error && /no such table:\s*facebook_content_share_markers/i.test(error.message);
}

/** A single bounded D1 read per picker page. Does not change what can be selected. */
export async function readFacebookShareMarkers(
  type: FacebookShareMarkerType,
  ids: number[],
  database: Database = getDb(),
): Promise<{ available: boolean; marked: Set<number> }> {
  const validIds = [...new Set(ids.filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 50);
  if (!validIds.length) return { available: true, marked: new Set() };
  const placeholders = validIds.map(() => "?").join(",");
  try {
    const result = await database.prepare(
      "SELECT entity_id FROM facebook_content_share_markers WHERE content_type=? AND entity_id IN (" + placeholders + ")"
    ).bind(type, ...validIds).all<{ entity_id: number }>();
    return { available: true, marked: new Set(result.results.map(row => Number(row.entity_id))) };
  } catch (error) {
    // Creating the PR never applies the D1 migration. Keep the existing picker usable.
    if (isMissingMigration(error)) return { available: false, marked: new Set() };
    throw error;
  }
}

export async function setFacebookShareMarker(
  type: FacebookShareMarkerType,
  id: number,
  marked: boolean,
  actor: string,
  database: Database = getDb(),
) {
  if (!FACEBOOK_SHARE_MARKER_TYPES.includes(type) || !Number.isSafeInteger(id) || id <= 0)
    throw new Error("Neplatná položka evidencie.");
  if (marked) {
    await database.prepare(
      "INSERT INTO facebook_content_share_markers(content_type,entity_id,marked_at,marked_by) " +
      "VALUES(?,?,?,?) ON CONFLICT(content_type,entity_id) DO UPDATE SET " +
      "marked_at=excluded.marked_at,marked_by=excluded.marked_by"
    ).bind(type, id, new Date().toISOString(), actor).run();
  } else {
    await database.prepare(
      "DELETE FROM facebook_content_share_markers WHERE content_type=? AND entity_id=?"
    ).bind(type, id).run();
  }
}
