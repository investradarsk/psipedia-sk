import { getManagedEshopById, type ManagedEshop } from "./eshop-ratings.ts";
import { eshopAdminEditedFields } from "./notion-eshop-sync.ts";
import { isHelpFieldEventAgenda, changedAdminHelpFields } from "./notion-help-field-events.ts";
import { loadNotionBulkOrganizations, loadNotionBulkAdoptions, loadNotionBulkHelpCases, loadNotionBulkLostFound } from "./notion-bulk-sources.ts";
import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";
import { runNotionEshopSyncSweep, type NotionEshopSyncBindings } from "./notion-eshop-sync.ts";
import { syncOneAdminHelpRecord } from "./notion-targeted-admin-help.ts";
import { isAdminNotionSyncLocked } from "./admin-notion-review-lock";
import { queueHelpNotionAdminChange, retryOneHelpNotionWriteback, readHelpNotionWritebackStatus } from "./notion-help-admin-outbox";
import type { NotionEventsHelpSyncBindings } from "./notion-events-help-sync.ts";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters.ts";
import type { EventNotionField } from "./notion-event-field-contract.ts";

export type TargetedNotionSaveBindings =
  NotionEshopSyncBindings & NotionEventsHelpSyncBindings & {
    DB?: D1Database;
    NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string;
  };

export type TargetedNotionSaveStatus = "disabled" | "unlinked" | "synced" | "pending" | "review";


type HelpSnapshot = Record<string, ReconciliationValue>;
type HelpAgenda = "organizations" | "adoptions" | "help-cases" | "lost-found";

async function currentHelpSnapshot(
  database: D1Database, agenda: HelpAgenda, entityId: number,
): Promise<HelpSnapshot | null> {
  const load = {
    organizations: loadNotionBulkOrganizations,
    adoptions: loadNotionBulkAdoptions,
    "help-cases": loadNotionBulkHelpCases,
    "lost-found": loadNotionBulkLostFound,
  }[agenda];
  const items = await load(database, entityId);
  const item = items.find(row => row.id === String(entityId));
  return item ? { ...item.properties } : null;
}

/** Read canonical BEFORE the Admin mutation to identify only truly edited fields. */
export async function captureHelpNotionSnapshot(input: {
  bindings: TargetedNotionSaveBindings;
  agenda: HelpAgenda;
  entityId: number;
}): Promise<HelpSnapshot | null> {
  if (!input.bindings.DB || !Number.isSafeInteger(input.entityId) || input.entityId < 1)
    return null;
  // A Notion snapshot probe must never make a normal Admin save fail.
  return currentHelpSnapshot(input.bindings.DB, input.agenda, input.entityId).catch(() => null);
}

/**
 * Call ONLY after a successful canonical Admin save, never from a GET/DELETE.
 * Unmapped records are handled by the existing scheduled bootstrap, not here.
 * D1 remains authoritative if Notion is unavailable; do not leak provider errors.
 */
export async function syncSavedNotionRecord(input: {
  bindings: TargetedNotionSaveBindings;
  agenda: BidirectionalAgendaKey | "eshops";
  entityId: number;
  changedEventFields?: readonly EventNotionField[];
  beforeHelpSnapshot?: HelpSnapshot | null;
  beforeEshop?: ManagedEshop | null;
}): Promise<TargetedNotionSaveStatus> {
  const { bindings, agenda, entityId } = input;
  if (bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true") return "disabled";
  if (!Number.isSafeInteger(entityId) || entityId <= 0) return "unlinked";
  if (!bindings.DB) return "pending";

  try {
    if (agenda === "eshops") {
      const current = input.beforeEshop ? await getManagedEshopById(entityId, bindings.DB) : null;
      const adminChangedFields = input.beforeEshop && current
        ? eshopAdminEditedFields(input.beforeEshop, current) : undefined;
      const result = await runNotionEshopSyncSweep({
        database: bindings.DB, bindings, targetShopId: entityId, adminChangedFields,
      });
      if (!result.enabled || !result.schemaReady || result.failed) return "pending";
      // No mapped page means no remote operation. Do not falsely claim success.
      return result.pulledFromNotion || result.pushedToNotion || result.unchanged
        ? "synced" : "unlinked";
    }
    // Without a verified BEFORE/AFTER canonical snapshot, a targeted Admin
    // save must not degrade to a whole-record Notion reconciliation. That
    // could re-import a stale Notion field over a just-committed D1 change.
    // New/unmapped records remain the existing bootstrap sweep's job.
    if (isHelpFieldEventAgenda(agenda)) {
      if (await isAdminNotionSyncLocked(bindings.DB,agenda,entityId)) return "disabled";
      if (!input.beforeHelpSnapshot) return "pending";
      const afterHelpSnapshot = await currentHelpSnapshot(bindings.DB, agenda, entityId);
      if (!afterHelpSnapshot) return "pending";
      const changedHelpFields = changedAdminHelpFields(
        agenda, input.beforeHelpSnapshot, afterHelpSnapshot,
      );
      if (!changedHelpFields.length) {
        return await readHelpNotionWritebackStatus(bindings.DB,bindings,agenda,entityId);
      }
      // This D1 receipt is committed BEFORE the Notion request.
      // Both direct saves and the minute cron use the identical guarded retry.
      const queued=await queueHelpNotionAdminChange({
        database:bindings.DB,agenda,entityId,
        before:input.beforeHelpSnapshot,after:afterHelpSnapshot,fields:changedHelpFields,
      });
      if (queued==="unlinked") return "unlinked";
      return await retryOneHelpNotionWriteback({
        database:bindings.DB,bindings,agenda,entityId,
      });
    }
    return await syncOneAdminHelpRecord({
      database: bindings.DB, bindings, agenda, entityId,
      changedEventFields: input.changedEventFields,
    });
  } catch {
    // Admin edit must never be rolled back because a remote mirror failed.
    return "pending";
  }
}
