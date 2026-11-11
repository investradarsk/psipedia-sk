import { getManagedEshopById, type ManagedEshop } from "./eshop-ratings.ts";
import { eshopAdminEditedFields } from "./notion-eshop-sync.ts";
import { isHelpFieldEventAgenda, changedAdminHelpFields } from "./notion-help-field-events.ts";
import { loadNotionBulkOrganizations, loadNotionBulkAdoptions, loadNotionBulkHelpCases, loadNotionBulkLostFound } from "./notion-bulk-sources.ts";
import type { ReconciliationValue } from "./notion-bulk-reconciliation.ts";
import { runNotionEshopSyncSweep, type NotionEshopSyncBindings } from "./notion-eshop-sync.ts";
import { syncOneAdminHelpRecord } from "./notion-targeted-admin-help.ts";
import type { NotionEventsHelpSyncBindings } from "./notion-events-help-sync.ts";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters.ts";
import type { EventNotionField } from "./notion-event-field-contract.ts";

export type TargetedNotionSaveBindings =
  NotionEshopSyncBindings & NotionEventsHelpSyncBindings & {
    DB?: D1Database;
    NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string;
  };

export type TargetedNotionSaveStatus = "disabled" | "unlinked" | "synced" | "pending";


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
  return currentHelpSnapshot(input.bindings.DB, input.agenda, input.entityId);
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
    const changedHelpFields = isHelpFieldEventAgenda(agenda) && input.beforeHelpSnapshot
      ? changedAdminHelpFields(
          agenda, input.beforeHelpSnapshot,
          (await currentHelpSnapshot(bindings.DB, agenda, entityId)) ?? input.beforeHelpSnapshot,
        )
      : undefined;
    return await syncOneAdminHelpRecord({
      database: bindings.DB, bindings, agenda, entityId,
      changedEventFields: input.changedEventFields,
      changedHelpFields,
    });
  } catch {
    // Admin edit must never be rolled back because a remote mirror failed.
    return "pending";
  }
}
