import { env } from "cloudflare:workers";

export type ContentHistoryType = "section" | "section_visual";
export type ContentHistoryOperation = "INSERT" | "UPDATE" | "DELETE";
export type ContentHistoryRevision = {
  id: number;
  entityType: ContentHistoryType;
  entityKey: string;
  operation: ContentHistoryOperation;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  actor: string;
  occurredAt: string;
};
type RevisionRow = {
  id: number; entity_type: ContentHistoryType; entity_key: string;
  operation: ContentHistoryOperation; before_json: string | null; after_json: string | null;
  actor: string; occurred_at: string;
};

const SECTION_COLUMNS = [
  "slug", "label", "eyebrow", "description", "intro", "hero_config_json",
  "subpages_json", "position", "visible", "updated_at",
] as const;
const VISUAL_COLUMNS = [
  "visual_key", "section_slug", "subsection_slug", "image_url", "image_key",
  "alt_text", "desktop_x", "desktop_y", "desktop_zoom", "mobile_x",
  "mobile_y", "mobile_zoom", "updated_at",
] as const;

export class ContentHistoryError extends Error {
  constructor(message: string, public status = 409) { super(message); }
}
export function parseHistoryTarget(type: unknown, key: unknown): { entityType: ContentHistoryType; key: string } {
  if (type !== "section" && type !== "section_visual") throw new ContentHistoryError("Neznámy typ histórie.", 400);
  if (typeof key !== "string" || key.length < 1 || key.length > 120 ||
    !/^[a-z0-9][a-z0-9._-]*$/.test(key) || (type === "section" && !/^[a-z0-9-]+$/.test(key))) {
    throw new ContentHistoryError("Neplatný identifikátor sekcie alebo hlavičky.", 400);
  }
  return { entityType: type, key };
}
export function toHistoryRevision(row: RevisionRow): ContentHistoryRevision {
  return {
    id: row.id,
    entityType: row.entity_type, entityKey: row.entity_key,
    operation: row.operation,
    before: row.before_json ? JSON.parse(row.before_json) as Record<string, unknown> : null,
    after: row.after_json ? JSON.parse(row.after_json) as Record<string, unknown> : null,
    actor: row.actor, occurredAt: row.occurred_at,
  };
}

function dbBinding(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new ContentHistoryError("Úložisko histórie nie je dostupné.", 503);
  return binding;
}

export function historySnapshotSql(type: ContentHistoryType) {
  const cols = type === "section" ? SECTION_COLUMNS : VISUAL_COLUMNS;
  return "json_object(" + cols.map(col => `'${col}',${col}`).join(",") + ")";
}
function currentTable(type: ContentHistoryType) {
  return type === "section" ? { table: "portal_section_settings", keyCol: "slug" }
    : { table: "section_visuals", keyCol: "visual_key" };
}

/** Read history only from the canonical append-only D1 table, never from Notion. */
export async function listContentHistory(type: ContentHistoryType, key: string): Promise<ContentHistoryRevision[]> {
  const db = dbBinding();
  const result = await db.prepare(`SELECT id,entity_type,entity_key,operation,before_json,after_json,actor,occurred_at
    FROM admin_content_revision_history WHERE entity_type=? AND entity_key=?
    ORDER BY id DESC LIMIT 30`).bind(type, key).all<RevisionRow>();
  return result.results.map(toHistoryRevision);
}

export async function previewContentHistory(type: ContentHistoryType, key: string) {
  const revisions = await listContentHistory(type, key);
  const latest = revisions[0];
  if (!latest) return { revisions, canRestore: false };
  const { table, keyCol } = currentTable(type);
  const db = dbBinding();
  const snapshot = await db.prepare(`SELECT ${historySnapshotSql(type)} AS snapshot FROM ${table} WHERE ${keyCol}=? LIMIT 1`)
    .bind(key).first<{ snapshot: string }>();
  const canRestore = latest.before !== null || type === "section_visual" && latest.operation === "INSERT";
  return {
    revisions,
    canRestore: Boolean(canRestore && (snapshot?.snapshot ?? null) === (latest.after ? JSON.stringify(latest.after) : null)),
  };
}

/**
 * Restore strictly the latest D1 version if its current row still equals the
 * exact audited AFTER snapshot. A concurrent editor / sync makes CAS return 0.
 * A database trigger records the restoration as a fresh append-only event.
 * No Notion-projected business records or generic profile tables are touched.
 */
export async function restoreContentRevision(
  type: ContentHistoryType, key: string, revisionId: number, actor: string,
): Promise<{ restored: boolean; id: number }> {
  if (!Number.isSafeInteger(revisionId) || revisionId <= 0) throw new ContentHistoryError("Neplatná verzia.", 400);
  const db = dbBinding();
  const row = await db.prepare(`SELECT id,entity_type,entity_key,operation,before_json,after_json,actor,occurred_at
    FROM admin_content_revision_history WHERE id=? AND entity_type=? AND entity_key=?
    AND id=(SELECT MAX(id) FROM admin_content_revision_history WHERE entity_type=? AND entity_key=?)
    LIMIT 1`).bind(revisionId, type, key, type, key).first<RevisionRow>();
  if (!row) throw new ContentHistoryError("Toto už nie je posledná zmena. Obnov históriu.");
  const revision = toHistoryRevision(row);
  const now = new Date().toISOString();
  const currentSql = historySnapshotSql(type);
  const latestGuard = `(SELECT MAX(id) FROM admin_content_revision_history WHERE entity_type=? AND entity_key=?)=?`;
  const after = row.after_json;
  const before = row.before_json;
  let changed: { id: string } | null = null;

  if (type === "section") {
    if (revision.operation !== "UPDATE" || !before || !after) {
      throw new ContentHistoryError("Táto zmena sekcie sa nedá bezpečne vrátiť.");
    }
    // Restoring an individual section leaves other rows and their newer data untouched.
    changed = await db.prepare(`UPDATE portal_section_settings SET
      label=json_extract(?,'$.label'), eyebrow=json_extract(?,'$.eyebrow'),
      description=json_extract(?,'$.description'), intro=json_extract(?,'$.intro'),
      hero_config_json=json_extract(?,'$.hero_config_json'),
      subpages_json=json_extract(?,'$.subpages_json'),
      position=json_extract(?,'$.position'), visible=json_extract(?,'$.visible'),
      updated_at=?, updated_by=?
      WHERE slug=? AND ${currentSql}=? AND ${latestGuard}
      RETURNING slug AS id`).bind(
      before, before, before, before, before, before, before, before,
      now, actor, key, after, type, key, revisionId,
    ).first<{ id: string }>();
  } else if (revision.operation === "UPDATE" && before && after) {
    const cols = VISUAL_COLUMNS.filter(col => col !== "visual_key" && col !== "updated_at");
    const updates = cols.map(col => `${col}=json_extract(?,'$.${col}')`).join(",");
    changed = await db.prepare(`UPDATE section_visuals SET ${updates}, updated_at=?,updated_by=?
      WHERE visual_key=? AND ${currentSql}=? AND ${latestGuard}
      RETURNING visual_key AS id`).bind(
      ...cols.map(() => before), now, actor, key, after, type, key, revisionId,
    ).first<{ id: string }>();
  } else if (revision.operation === "INSERT" && after && !before) {
    changed = await db.prepare(`DELETE FROM section_visuals
      WHERE visual_key=? AND ${currentSql}=? AND ${latestGuard}
      RETURNING visual_key AS id`).bind(key, after, type, key, revisionId).first<{ id: string }>();
  } else if (revision.operation === "DELETE" && before && !after) {
    // Recreate only if the original key is still absent; never overwrite a newer visual.
    const cols = VISUAL_COLUMNS.filter(col => col !== "updated_at");
    const fields = cols.map(col => `json_extract(?,'$.${col}')`).join(",");
    changed = await db.prepare(`INSERT INTO section_visuals (${cols.join(",")},updated_at,updated_by)
      SELECT ${fields},?,?
      WHERE NOT EXISTS(SELECT 1 FROM section_visuals WHERE visual_key=?)
      AND ${latestGuard}
      RETURNING visual_key AS id`).bind(
      ...cols.map(() => before), now, actor, key, type, key, revisionId,
    ).first<{ id: string }>();
  } else {
    throw new ContentHistoryError("Túto zmenu nie je možné bezpečne vrátiť.");
  }

  if (!changed) throw new ContentHistoryError("Záznam sa od poslednej revízie zmenil. Žiadne údaje neboli prepísané.");
  return { restored: true, id: revisionId };
}
