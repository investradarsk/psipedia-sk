import type { GeminiImportAgenda } from "./gemini-import-d1-verification";

/** Owner-triggered legacy repair, NOT a cron/automatic lease expiry.
 * A lock may survive an uncertain INSERT. We only reclaim an old lock if
 * no canonical draft created since it was acquired lacks its D1 mapping.
 * False positives stop the retry instead of risking duplicate profiles.
 */
export type LegacyLockRecovery =
  | { state: "CLEAR" | "RECOVERED"; recovered: number }
  | { state: "ACTIVE_LOCK" | "UNMAPPED_CANONICAL" | "LOCK_CHECK_FAILED"; recovered: 0 };

const references: Record<GeminiImportAgenda, { table: string; join: string; key: string }> = {
  directory: { table: "directory_profiles", join: "directory_notion_sync", key: "directory_profile_id" },
  events: { table: "managed_events", join: "event_notion_sync", key: "event_id" },
  organizations: { table: "help_organizations", join: "notion_agenda_sync", key: "entity_id" },
  adoptions: { table: "adoption_dogs", join: "notion_agenda_sync", key: "entity_id" },
  "help-cases": { table: "help_cases", join: "notion_agenda_sync", key: "entity_id" },
  "lost-found": { table: "lost_found_dog_reports", join: "notion_agenda_sync", key: "entity_id" },
};
const AGE_MS = 15 * 60 * 1000;
const canonical = (id: string) => id.replaceAll("-", "").toLowerCase();

export async function recoverOwnerConfirmedLegacyLocks(
  database: D1Database, agenda: GeminiImportAgenda, notionPageId: string,
): Promise<LegacyLockRecovery> {
  const globalId = canonical(agenda === "directory"
    ? "directory-import" : "gemini-canonical-import-" + agenda);
  const pageId = canonical(notionPageId);
  const ids = [...new Set([globalId, pageId])];
  try {
    const locks: { id: string; owner: string; created_at: string }[] = [];
    for (const id of ids) {
      const lock = await database.prepare(
        "SELECT notion_page_id AS id, owner, created_at FROM gemini_notion_review_locks WHERE notion_page_id=?"
      ).bind(id).first<{ id: string; owner: string; created_at: string }>();
      if (lock) locks.push(lock);
    }
    if (!locks.length) return { state: "CLEAR", recovered: 0 };
    // A recent lock may be held by an active worker. Never override it.
    const now = Date.now();
    if (locks.some(lock => !Number.isFinite(Date.parse(lock.created_at)) ||
      now - Date.parse(lock.created_at) < AGE_MS))
      return { state: "ACTIVE_LOCK", recovered: 0 };

    const ref = references[agenda];
    // Any unlinked D1 record from the time of a lock may be an orphan created
    // before a lost response. Require human reconciliation rather than retry.
    for (const lock of locks) {
      const agendaClause = agenda === "directory" || agenda === "events"
        ? "" : " AND m.agenda='" + agenda + "'";
      const possibleOrphan = await database.prepare(
        `SELECT 1 AS found FROM ${ref.table} d
         LEFT JOIN ${ref.join} m ON m.${ref.key}=d.id${agendaClause}
         WHERE d.created_at>=? AND m.${ref.key} IS NULL LIMIT 1`
      ).bind(lock.created_at).first<{ found: number }>();
      if (possibleOrphan) return { state: "UNMAPPED_CANONICAL", recovered: 0 };
    }
    // Compare and delete owner+timestamp so a concurrent lock refresh cannot
    // accidentally be deleted by this recovery attempt.
    let recovered = 0;
    for (const lock of locks) {
      const deleted = await database.prepare(
        "DELETE FROM gemini_notion_review_locks WHERE notion_page_id=? AND owner=? AND created_at=?"
      ).bind(lock.id, lock.owner, lock.created_at).run();
      recovered += deleted.meta.changes;
    }
    return { state: "RECOVERED", recovered };
  } catch {
    return { state: "LOCK_CHECK_FAILED", recovered: 0 };
  }
}
