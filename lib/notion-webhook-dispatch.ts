import { metadataOnlyChange, sameSource, UUID, EVENT_TYPES, type NotionWebhookEvent as WebhookEvent } from "@/lib/notion-webhook-contract";
import { runNotionDirectorySyncSweep } from "@/lib/notion-directory-sync";
import { runNotionBreedSyncSweep } from "@/lib/notion-breed-sync";
import { runNotionArticleSyncSweep } from "@/lib/notion-article-sync";
import { runNotionEshopSyncSweep } from "@/lib/notion-eshop-sync";
import { runNotionEventsHelpSyncSweep } from "@/lib/notion-events-help-sync";
import { notionRequest, type NotionPage, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";

/** Targeted, owner-verified reconciliation for a single signed Notion page event. */

export type WebhookBindings = NotionSyncBindings & {
  DB?: D1Database;
  NOTION_WEBHOOK_SYNC_ENABLED?: string;
  NOTION_WEBHOOK_VERIFICATION_TOKEN?: string;
  NOTION_WEBHOOK_HANDSHAKE_LOG_ENABLED?: string;
  NOTION_WEBHOOK_SUBSCRIPTION_ID?: string;
  NOTION_DIRECTORY_SYNC_ENABLED?: string;
  NOTION_DIRECTORY_DATA_SOURCE_ID?: string;
  NOTION_BREED_SYNC_ENABLED?: string;
  NOTION_BREEDS_DATA_SOURCE_ID?: string;
  NOTION_ARTICLE_SYNC_ENABLED?: string;
  NOTION_ARTICLES_DATA_SOURCE_ID?: string;
  NOTION_ESHOP_SYNC_ENABLED?: string;
  NOTION_ESHOPS_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
};

type OwnedPage = NotionPage & {
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
};

export async function dispatchNotionPageChange(event: WebhookEvent, bindings: WebhookBindings) {
  if (!bindings.DB || !bindings.NOTION_API_TOKEN) return "not-configured";
  const id = event.entity?.id ?? "";
  if (!UUID.test(id) || (event.entity?.type !== "page" && event.entity?.entity_type !== "page"))
    return "ignored";
  if (!EVENT_TYPES.has(event.type ?? "")) return "ignored";

  // A single GET also proves source ownership. Never trust an ID or category
  // just because it appeared in a signed event from this connection.
  const page = await notionRequest<OwnedPage>(bindings, "/pages/" + encodeURIComponent(id));
  if (page.id !== id || page.archived || page.in_trash) return "ignored";
  if (metadataOnlyChange(event, page)) return "metadata-only";

  const sourceId = page.parent?.data_source_id;
  // All agenda runners must be configured before a webhook is acknowledged.
  // Missing schema/provider failure is retried by Notion; intentionally
  // disabled agendas are reported explicitly, never falsely "processed".
  let summary: {
    enabled: boolean; failed: number; schemaReady?: boolean;
    scanned?: number; notionScanned?: number;
  } | undefined;
  if (sameSource(sourceId, bindings.NOTION_DIRECTORY_DATA_SOURCE_ID)
      && notionPageBelongsToDataSource(page, bindings.NOTION_DIRECTORY_DATA_SOURCE_ID!)) {
    summary = await runNotionDirectorySyncSweep({
      database: bindings.DB, bindings, targetPageId: id,
    });
  } else if (sameSource(sourceId, bindings.NOTION_BREEDS_DATA_SOURCE_ID)
      && notionPageBelongsToDataSource(page, bindings.NOTION_BREEDS_DATA_SOURCE_ID!)) {
    summary = await runNotionBreedSyncSweep({
      database: bindings.DB, bindings, targetPageId: id,
    });
  } else if (sameSource(sourceId, bindings.NOTION_ARTICLES_DATA_SOURCE_ID)
      && notionPageBelongsToDataSource(page, bindings.NOTION_ARTICLES_DATA_SOURCE_ID!)) {
    summary = await runNotionArticleSyncSweep({
      database: bindings.DB, bindings, targetPageId: id,
    });
  } else if (sameSource(sourceId, bindings.NOTION_ESHOPS_DATA_SOURCE_ID)
      && notionPageBelongsToDataSource(page, bindings.NOTION_ESHOPS_DATA_SOURCE_ID!)) {
    summary = await runNotionEshopSyncSweep({
      database: bindings.DB, bindings, targetPageId: id,
    });
  } else if (bindings.NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED === "true") {
    // Dynamic event/help targets come from canonical D1 agenda configuration,
    // never from a page title or a Notion-editable category. Unmapped pages
    // may enter ONLY the existing private-draft / human-Ready import gate.
    const table = await bindings.DB.prepare(
      "SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='notion_agenda_targets' LIMIT 1",
    ).first<{ ok: number }>();
    if (!table) return "out-of-scope";
    const agenda = await bindings.DB.prepare(
      "SELECT agenda FROM notion_agenda_targets " +
      "WHERE replace(lower(data_source_id),'-','') = replace(lower(?),'-','') LIMIT 1",
    ).bind(sourceId ?? "").first<{ agenda: string }>();
    const allowed = ["events", "organizations", "adoptions", "help-cases", "lost-found"] as const;
    if (!agenda || !allowed.some(value => value === agenda.agenda)) return "out-of-scope";
    const result = await runNotionEventsHelpSyncSweep({
      database: bindings.DB, bindings, mode: "sync",
      agendas: [agenda.agenda as (typeof allowed)[number]],
      targetPageId: id, webhookMappedOnly: true,
      // Signed, owner-verified one-page delivery: unmapped Ready pages and
      // trusted Gemini private drafts may now be imported immediately.
      // Admin targeted writeback still does NOT enable this option.
      webhookImportUnmapped: true,
    });
    if (!result.enabled) return "disabled";
    if (!result.schemaReady || result.agendas.length !== 1 ||
        result.agendas[0].targetMissing || !result.agendas[0].dataSourceId) {
      throw new Error("NOTION_TARGETED_AGENDA_UNAVAILABLE");
    }
    if (result.totals.failed === 0 && (result.totals.conflicts || result.totals.reviewRequired))
      return "review-required";
    summary = {
      enabled: result.enabled, schemaReady: result.schemaReady,
      failed: result.totals.failed, scanned: result.totals.scanned,
    };
  } else {
    // Includes Facebook image source, Services V3 and unsupported pages.
    return "out-of-scope";
  }
  if (!summary) throw new Error("NOTION_TARGETED_NO_RESULT");
  if (!summary.enabled) return "disabled";
  if (summary.schemaReady === false) throw new Error("NOTION_TARGETED_SCHEMA_UNAVAILABLE");
  if (summary.failed > 0) throw new Error("NOTION_TARGETED_RECONCILIATION_FAILED");
  if (summary.scanned === 0 || summary.notionScanned === 0) return "deferred";
  return "processed";
}

