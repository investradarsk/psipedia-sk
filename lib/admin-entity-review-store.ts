import { env } from "cloudflare:workers";

export const adminReviewEntityTypes = [
  "EVENT",
  "HELP_CASE",
  "ADOPTION",
  "LOST_FOUND",
  "ORGANIZATION",
] as const;

export type AdminReviewEntityType = (typeof adminReviewEntityTypes)[number];

export type AdminEntityReview = {
  reviewed: boolean;
  reviewedAt: string;
  reviewedBy: string;
};

type ReviewRow = {
  entity_id: number;
  reviewed_at: string;
  reviewed_by: string;
};

type RuntimeBindings = { DB?: D1Database };

const entityTable: Record<AdminReviewEntityType, string> = {
  EVENT: "managed_events",
  HELP_CASE: "help_cases",
  ADOPTION: "adoption_dogs",
  LOST_FOUND: "lost_found_dog_reports",
  ORGANIZATION: "help_organizations",
};

function getDatabase(database?: D1Database) {
  const bound = (env as unknown as RuntimeBindings).DB;
  const resolved = database ?? (bound && typeof bound.prepare === "function" ? bound : null);
  if (!resolved) throw new Error("Databáza administrácie nie je pripojená.");
  return resolved;
}

export function isAdminReviewEntityType(value: unknown): value is AdminReviewEntityType {
  return typeof value === "string" && (adminReviewEntityTypes as readonly string[]).includes(value);
}

function isMissingReviewTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*admin_entity_reviews/i.test(message);
}

export async function getAdminEntityReview(
  entityType: AdminReviewEntityType,
  entityId: number,
  database?: D1Database,
): Promise<AdminEntityReview> {
  if (!Number.isSafeInteger(entityId) || entityId <= 0) return { reviewed: false, reviewedAt: "", reviewedBy: "" };
  try {
    const row = await getDatabase(database).prepare(`
      SELECT entity_id, reviewed_at, reviewed_by
      FROM admin_entity_reviews
      WHERE entity_type = ? AND entity_id = ?
      LIMIT 1
    `).bind(entityType, entityId).first<ReviewRow>();
    return row
      ? { reviewed: true, reviewedAt: row.reviewed_at, reviewedBy: row.reviewed_by }
      : { reviewed: false, reviewedAt: "", reviewedBy: "" };
  } catch (error) {
    if (isMissingReviewTable(error)) return { reviewed: false, reviewedAt: "", reviewedBy: "" };
    throw error;
  }
}

export async function listReviewedAdminEntityIds(
  entityType: AdminReviewEntityType,
  entityIds: number[],
  database?: D1Database,
): Promise<number[]> {
  const ids = [...new Set(entityIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  try {
    const placeholders = ids.map(() => "?").join(",");
    const result = await getDatabase(database).prepare(`
      SELECT entity_id, reviewed_at, reviewed_by
      FROM admin_entity_reviews
      WHERE entity_type = ? AND entity_id IN (${placeholders})
    `).bind(entityType, ...ids).all<ReviewRow>();
    return result.results.map((row) => Number(row.entity_id)).filter((id) => Number.isSafeInteger(id) && id > 0);
  } catch (error) {
    if (isMissingReviewTable(error)) return [];
    throw error;
  }
}

export async function adminReviewEntityExists(
  entityType: AdminReviewEntityType,
  entityId: number,
  database?: D1Database,
) {
  if (!Number.isSafeInteger(entityId) || entityId <= 0) return false;
  const table = entityTable[entityType];
  const row = await getDatabase(database).prepare(`SELECT id FROM ${table} WHERE id = ? LIMIT 1`).bind(entityId).first<{ id: number }>();
  return Boolean(row);
}

export async function setAdminEntityReviewed(
  entityType: AdminReviewEntityType,
  entityId: number,
  reviewed: boolean,
  reviewedBy: string,
  database?: D1Database,
): Promise<AdminEntityReview> {
  const db = getDatabase(database);
  if (!Number.isSafeInteger(entityId) || entityId <= 0) throw new Error("Neplatné ID záznamu.");
  if (!(await adminReviewEntityExists(entityType, entityId, db))) throw new Error("Záznam sa nenašiel.");

  if (!reviewed) {
    try {
      await db.prepare("DELETE FROM admin_entity_reviews WHERE entity_type = ? AND entity_id = ?")
        .bind(entityType, entityId).run();
    } catch (error) {
      if (!isMissingReviewTable(error)) throw error;
      throw new Error("Najprv je potrebné nasadiť migráciu admin_entity_reviews.");
    }
    return { reviewed: false, reviewedAt: "", reviewedBy: "" };
  }

  const reviewedAt = new Date().toISOString();
  try {
    await db.prepare(`
      INSERT INTO admin_entity_reviews (entity_type, entity_id, reviewed_at, reviewed_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(entity_type, entity_id) DO UPDATE SET
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by
    `).bind(entityType, entityId, reviewedAt, reviewedBy).run();
  } catch (error) {
    if (!isMissingReviewTable(error)) throw error;
    throw new Error("Najprv je potrebné nasadiť migráciu admin_entity_reviews.");
  }

  return { reviewed: true, reviewedAt, reviewedBy };
}
