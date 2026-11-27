import { UNIFIED_SYNC_AGENDAS, type UnifiedSyncAgenda } from "./notion-unified-field-sync.ts";

type Scope = { scope: string; profile_id: number };
export function unifiedManualScope(link: Scope) {
  const agenda = link.scope.startsWith("directory:") ? "directory" : link.scope;
  if (!UNIFIED_SYNC_AGENDAS.includes(agenda as UnifiedSyncAgenda) || !Number.isSafeInteger(link.profile_id) || link.profile_id <= 0) {
    throw Error("TRANSFER_V2_SCOPE_INVALID");
  }
  return { agenda: agenda as UnifiedSyncAgenda, entityId: String(link.profile_id) };
}

/** Never delete state rows (CAS versions must not reset). Invalidate prior
 * observations, proofs and historic fallback for this exact record. */
function invalidationStatements(database: D1Database, agenda: UnifiedSyncAgenda, entityId: string, token: string) {
  const now = new Date().toISOString();
  const owned = "EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda=? AND entity_id=? AND owner_token=?)";
  const owner = [agenda, entityId, token];
  // Scope invalidation itself must be conditional on the current fence owner.
  // A stale release must not invalidate somebody else's active reservation.
  return [
    database.prepare(
      "INSERT INTO notion_unified_scope_invalidation(agenda,entity_id,invalidated_at) SELECT ?,?,? WHERE " + owned +
      " ON CONFLICT(agenda,entity_id) DO UPDATE SET invalidated_at=excluded.invalidated_at"
    ).bind(agenda, entityId, now, ...owner),
    database.prepare(
      "UPDATE notion_unified_field_state SET baseline_version=NULL,baseline_json=NULL,notion_json=NULL,psipedia_json=NULL," +
      "notion_edit_json=NULL,psipedia_edit_json=NULL,status='REVIEW',reason='SCOPE_INVALIDATED',version=version+1," +
      "updated_at=?,recovery_after=NULL WHERE agenda=? AND entity_id=? AND " + owned
    ).bind(now, agenda, entityId, ...owner),
    database.prepare("DELETE FROM notion_unified_admin_field_edits WHERE agenda=? AND entity_id=? AND " + owned)
      .bind(agenda, entityId, ...owner),
  ];
}

export async function acquireUnifiedManualFence(database: D1Database, link: Scope) {
  const {agenda, entityId} = unifiedManualScope(link);
  const token = crypto.randomUUID();
  // Atomic with ordinary reservation CAS. Do not steal a pending field,
  // even if its transport lease is expired: it needs observed recovery.
  const claimed = await database.prepare(
    "INSERT INTO notion_unified_manual_fence(agenda,entity_id,owner_token,started_at) " +
    "SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM notion_unified_field_state WHERE agenda=? AND entity_id=? AND status='PENDING') " +
    "ON CONFLICT DO NOTHING RETURNING owner_token"
  ).bind(agenda, entityId, token, new Date().toISOString(), agenda, entityId).first<{owner_token:string}>();
  if (claimed?.owner_token !== token) throw Error("TRANSFER_V2_SCOPE_BUSY");
  // If invalidation fails, keep the fence. Uncertain state must not reopen
  // automatic mutations. The diagnostic panel exposes this blocker.
  const result = await database.batch(invalidationStatements(database, agenda, entityId, token));
  if (result.some(row => !row.success) || result[0]?.meta.changes !== 1) throw Error("TRANSFER_V2_INVALIDATION_FAILED");
  return {agenda, entityId, token};
}

export async function releaseUnifiedManualFence(database: D1Database, fence: Awaited<ReturnType<typeof acquireUnifiedManualFence>>) {
  const {agenda, entityId, token} = fence;
  const result = await database.batch([
    ...invalidationStatements(database, agenda, entityId, token),
    database.prepare("DELETE FROM notion_unified_manual_fence WHERE agenda=? AND entity_id=? AND owner_token=?").bind(agenda, entityId, token),
  ]);
  if (result.some(row => !row.success) || result[0]?.meta.changes !== 1 || result.at(-1)?.meta.changes !== 1) throw Error("TRANSFER_V2_FENCE_RELEASE_FAILED");
}
