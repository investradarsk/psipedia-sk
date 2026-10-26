import { runNotionEshopSyncSweep, type NotionEshopSyncBindings } from "./notion-eshop-sync.ts";
import { syncOneAdminHelpRecord } from "./notion-targeted-admin-help.ts";
import type { NotionEventsHelpSyncBindings } from "./notion-events-help-sync.ts";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters.ts";

export type TargetedNotionSaveBindings =
  NotionEshopSyncBindings & NotionEventsHelpSyncBindings & {
    DB?: D1Database;
    NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string;
  };

export type TargetedNotionSaveStatus = "disabled" | "unlinked" | "synced" | "pending";

/**
 * Call ONLY after a successful canonical Admin save, never from a GET/DELETE.
 * Unmapped records are handled by the existing scheduled bootstrap, not here.
 * D1 remains authoritative if Notion is unavailable; do not leak provider errors.
 */
export async function syncSavedNotionRecord(input: {
  bindings: TargetedNotionSaveBindings;
  agenda: BidirectionalAgendaKey | "eshops";
  entityId: number;
}): Promise<TargetedNotionSaveStatus> {
  const { bindings, agenda, entityId } = input;
  if (bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true") return "disabled";
  if (!Number.isSafeInteger(entityId) || entityId <= 0) return "unlinked";
  if (!bindings.DB) return "pending";

  try {
    if (agenda === "eshops") {
      const result = await runNotionEshopSyncSweep({
        database: bindings.DB, bindings, targetShopId: entityId,
      });
      if (!result.enabled || !result.schemaReady || result.failed) return "pending";
      // No mapped page means no remote operation. Do not falsely claim success.
      return result.pulledFromNotion || result.pushedToNotion || result.unchanged
        ? "synced" : "unlinked";
    }
    return await syncOneAdminHelpRecord({
      database: bindings.DB, bindings, agenda, entityId,
    });
  } catch {
    // Admin edit must never be rolled back because a remote mirror failed.
    return "pending";
  }
}
