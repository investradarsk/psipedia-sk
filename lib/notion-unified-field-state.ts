import type { FieldIdentity, ScopedFieldEdit } from "./notion-unified-field-sync.ts";

export type UnifiedFieldState = {
  version: number;
  updatedAt: string;
  baselineVersion?: string;
  baseline: unknown | undefined;
  notion: unknown | undefined;
  psipedia: unknown | undefined;
  notionEdit: ScopedFieldEdit | undefined;
  psipediaEdit: ScopedFieldEdit | undefined;
  status: "SYNCED" | "PENDING" | "REVIEW";
  reason: string | null;
};

type Row = {
  version: number;
  updated_at: string;
  baseline_version: string | null;
  baseline_json: string | null;
  notion_json: string | null;
  psipedia_json: string | null;
  notion_edit_json: string | null;
  psipedia_edit_json: string | null;
  status: UnifiedFieldState["status"];
  reason: string | null;
};

const key = (id: FieldIdentity) => [id.agenda, id.entityId, id.pageId, id.field];
const encode = (value: unknown): string | null =>
  value === undefined ? null : JSON.stringify(value);
const decode = (value: string | null): unknown =>
  value === null ? undefined : JSON.parse(value);

/** The caller must verify the live mapping and sync lock. An absent schema
 * is deliberately an error, not permission to fall back to blind replay. */
export async function readUnifiedFieldState(
  db: D1Database, id: FieldIdentity,
): Promise<UnifiedFieldState | null> {
  const row = await db.prepare(
    "SELECT version,updated_at,baseline_version,baseline_json,notion_json,psipedia_json,notion_edit_json,psipedia_edit_json,status,reason " +
    "FROM notion_unified_field_state WHERE agenda=? AND entity_id=? AND notion_page_id=? AND field_key=?",
  ).bind(...key(id)).first<Row>();
  if (!row) return null;
  return {
    version: row.version,
    updatedAt: row.updated_at,
    baselineVersion: row.baseline_version ?? undefined,
    baseline: decode(row.baseline_json),
    notion: decode(row.notion_json),
    psipedia: decode(row.psipedia_json),
    notionEdit: decode(row.notion_edit_json) as ScopedFieldEdit | undefined,
    psipediaEdit: decode(row.psipedia_edit_json) as ScopedFieldEdit | undefined,
    status: row.status,
    reason: row.reason,
  };
}

/** Optimistic compare-and-swap. Initial insertion also races safely.
 * A caller must not perform a remote write after losing this reservation.
 * A PENDING row is durable evidence, not proof that a transfer completed. */
export async function writeUnifiedFieldState(
  db: D1Database, id: FieldIdentity, expectedVersion: number | null,
  state: Omit<UnifiedFieldState, "version" | "updatedAt">,
): Promise<number | null> {
  const values = [
    state.baselineVersion ?? null, encode(state.baseline), encode(state.notion), encode(state.psipedia),
    encode(state.notionEdit), encode(state.psipediaEdit),
    state.status, state.reason, new Date().toISOString(),
  ];
  const row = expectedVersion === null
    ? await db.prepare(
        "INSERT INTO notion_unified_field_state " +
        "(agenda,entity_id,notion_page_id,field_key,baseline_version,baseline_json,notion_json,psipedia_json," +
        "notion_edit_json,psipedia_edit_json,status,reason,updated_at) " +
        "SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda=? AND entity_id=?) ON CONFLICT DO NOTHING RETURNING version",
      ).bind(...key(id), ...values,id.agenda,id.entityId).first<{version: number}>()
    : await db.prepare(
        "UPDATE notion_unified_field_state SET baseline_version=?,baseline_json=?,notion_json=?,psipedia_json=?," +
        "notion_edit_json=?,psipedia_edit_json=?,status=?,reason=?,updated_at=?,version=version+1 " +
        "WHERE agenda=? AND entity_id=? AND notion_page_id=? AND field_key=? AND version=? " +
        "AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence f WHERE f.agenda=notion_unified_field_state.agenda AND f.entity_id=notion_unified_field_state.entity_id) RETURNING version",
      ).bind(...values, ...key(id), expectedVersion).first<{version: number}>();
  return row?.version ?? null;
}
