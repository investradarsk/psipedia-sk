import { UNIFIED_SYNC_AGENDAS, type UnifiedSyncAgenda } from "./notion-unified-field-sync.ts";
import { manualMappingEditorHref } from "./notion-manual-transfer-mapping.ts";

type Counts = { synced: number; pending: number; review: number; profiles: number; lastRecordedAt: string | null };
type Issue = { agenda: UnifiedSyncAgenda; entityId: string; editorHref: string | null; field: string; status: "PENDING" | "REVIEW"; reason: string; updatedAt: string; retryAfter: string | null };
export type UnifiedDiagnostics = {
  enabled: boolean;
  schemaReady: boolean;
  readOnly: true;
  rows: Array<Counts & { agenda: UnifiedSyncAgenda }>;
  issues: Issue[];
  truncated: boolean;
  manualFences: number | null;
  checkedAt: string;
};
const safeCode = (value: unknown) => typeof value === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(value) ? value : "UNCLASSIFIED";
const safeField = (value: unknown) => typeof value === "string" && value.length <= 160 && !/[\r\n<>]/.test(value) ? value : "UNKNOWN_FIELD";

/** SQL journal evidence and local editor paths. No remote GET, token, raw
 * values, or Notion page IDs. Unknown schema must not look like zero conflicts. */
export async function readUnifiedDiagnostics(database: D1Database, enabled: boolean): Promise<UnifiedDiagnostics> {
  const result: UnifiedDiagnostics = {
    enabled, schemaReady: false, readOnly: true, rows: [], issues: [], truncated: false,
    manualFences: null, checkedAt: new Date().toISOString(),
  };
  try {
    const required = await database.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('notion_unified_field_state','notion_unified_admin_field_edits','notion_unified_recovery_cursor','notion_unified_scope_invalidation','notion_unified_manual_fence')"
    ).all<{ name: string }>();
    if (!required.success || required.results.length !== 5) return result;
    const [counts, issues, fences] = await database.batch([
      database.prepare(
        "SELECT agenda,SUM(status='SYNCED') AS synced,SUM(status='PENDING') AS pending,SUM(status='REVIEW') AS review," +
        "COUNT(DISTINCT entity_id) AS profiles,MAX(updated_at) AS lastRecordedAt FROM notion_unified_field_state GROUP BY agenda"
      ),
      database.prepare(
        "SELECT agenda,entity_id,field_key,status,reason,updated_at,recovery_after FROM notion_unified_field_state " +
        "WHERE status IN ('PENDING','REVIEW') ORDER BY CASE status WHEN 'REVIEW' THEN 0 ELSE 1 END,updated_at DESC,agenda,entity_id,field_key LIMIT 51"
      ),
      database.prepare("SELECT COUNT(*) AS n FROM notion_unified_manual_fence"),
    ]);
    if (!counts.success || !issues.success || !fences.success) return result;
    const byAgenda = new Map((counts.results as Array<Counts & { agenda: UnifiedSyncAgenda }>).map(row => [row.agenda, row]));
    const rows = UNIFIED_SYNC_AGENDAS.map(agenda => byAgenda.get(agenda) ?? {
      agenda, synced: 0, pending: 0, review: 0, profiles: 0, lastRecordedAt: null,
    });
    const raw = issues.results as Array<{agenda: UnifiedSyncAgenda; entity_id: string; field_key: string; status: Issue["status"]; reason: string | null; updated_at: string; recovery_after: string | null}>;
    return {...result, schemaReady: true, rows, truncated: raw.length > 50,
      manualFences: Number((fences.results[0] as {n: number})?.n ?? 0),
      issues: raw.slice(0, 50).map(row => {
        const entityId = /^\d+$/.test(row.entity_id) ? row.entity_id : "";
        return {
          agenda: row.agenda,
          entityId,
          editorHref: manualMappingEditorHref(row.agenda, Number(entityId)),
          field: safeField(row.field_key),
          status: row.status,
          reason: row.status === "PENDING" && !row.reason ? "AWAITING_CONFIRMATION" : safeCode(row.reason),
          updatedAt: row.updated_at,
          retryAfter: row.recovery_after,
        };
      }),
    };
  } catch { return result; }
}
