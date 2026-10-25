import { runNotionEventsHelpSyncSweep, type NotionEventsHelpSyncBindings } from "./notion-events-help-sync.ts";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters.ts";

/**
 * Admin -> Notion only for existing verified mappings.
 * The ordinary hourly sweep still creates new Notion pages and verifies identity.
 * This hook does not enumerate or modify any other Notion page.
 */
export async function syncOneAdminHelpRecord(input: {
  database: D1Database;
  bindings: NotionEventsHelpSyncBindings & { NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string };
  agenda: BidirectionalAgendaKey;
  entityId: number;
}): Promise<"disabled" | "unlinked" | "synced" | "pending"> {
  if (input.bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED !== "true") return "disabled";
  if (!Number.isSafeInteger(input.entityId) || input.entityId < 1) return "unlinked";
  if (!["events", "organizations", "adoptions", "help-cases", "lost-found"].includes(input.agenda))
    return "unlinked";

  try {
    const mapping = input.agenda === "events"
      ? await input.database.prepare(
        "SELECT notion_page_id FROM event_notion_sync WHERE event_id=? LIMIT 1",
      ).bind(input.entityId).first<{ notion_page_id: string }>()
      : await input.database.prepare(
        "SELECT notion_page_id FROM notion_agenda_sync WHERE agenda=? AND entity_id=? LIMIT 1",
      ).bind(input.agenda, input.entityId).first<{ notion_page_id: string }>();
    if (!mapping?.notion_page_id) return "unlinked";
    const summary = await runNotionEventsHelpSyncSweep({
      database: input.database, bindings: input.bindings, mode: "sync",
      agendas: [input.agenda], targetPageId: mapping.notion_page_id, webhookMappedOnly: true,
    });
    return summary.totals.failed || summary.totals.conflicts || summary.totals.reviewRequired
      ? "pending" : "synced";
  } catch {
    // An already committed Admin edit cannot be rolled back by remote outage.
    return "pending";
  }
}
