import { verifyNotionWebhook, metadataOnlyChange, sameSource, UUID, EVENT_TYPES, type NotionWebhookEvent as WebhookEvent } from "@/lib/notion-webhook-contract";
import { env } from "cloudflare:workers";
import { runNotionDirectorySyncSweep } from "@/lib/notion-directory-sync";
import { runNotionBreedSyncSweep } from "@/lib/notion-breed-sync";
import { runNotionArticleSyncSweep } from "@/lib/notion-article-sync";
import { runNotionEshopSyncSweep } from "@/lib/notion-eshop-sync";
import { runNotionEventsHelpSyncSweep } from "@/lib/notion-events-help-sync";
import { notionRequest, type NotionPage, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";

/**
 * Public Notion subscription callback. Deliberately does NOT import or dispatch
 * Facebook image sync, Services V3 or the full hourly runners.
 *
 * Activation requires NOTION_WEBHOOK_SYNC_ENABLED=true and the one-time
 * verification token as NOTION_WEBHOOK_VERIFICATION_TOKEN (Cloudflare secret).
 * All signed events are rejected until the token is installed.
 */
export const dynamic = "force-dynamic";

type WebhookBindings = NotionSyncBindings & {
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
  let summary: { failed: number } | undefined;
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
    // Dynamic event/help targets are resolved only from existing verified D1
    // mappings, never from a title or a user-controlled Notion property.
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
    });
    if (result.totals.failed === 0 && (result.totals.conflicts || result.totals.reviewRequired))
      return "review-required";
    summary = { failed: result.totals.failed };
  } else {
    // Includes Facebook image source, Services V3 and unsupported pages.
    return "out-of-scope";
  }
  if (summary.failed > 0) throw new Error("NOTION_TARGETED_RECONCILIATION_FAILED");
  return "processed";
}

export async function POST(request: Request) {
  const bindings = env as unknown as WebhookBindings;
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json"))
    return new Response(null, { status: 415 });
  if (Number(request.headers.get("content-length") ?? "0") > 65_536)
    return new Response(null, { status: 413 });
  const body = await request.text();
  if (body.length > 65_536) return new Response(null, { status: 413 });
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { return new Response(null, { status: 400 }); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return new Response(null, { status: 400 });
  const data = parsed as WebhookEvent & { verification_token?: unknown };

  // Notion's one-time handshake is unsigned. During deliberate setup only,
  // the owner reads the token from restricted Cloudflare real-time logs, sets
  // it as a Worker secret, then disables the setup logging flag.
  if (typeof data.verification_token === "string") {
    if (bindings.NOTION_WEBHOOK_HANDSHAKE_LOG_ENABLED === "true"
        && /^secret_[A-Za-z0-9_-]{12,256}$/.test(data.verification_token)) {
      console.info("notion_webhook_one_time_verification_token", data.verification_token);
    }
    return new Response(null, { status: 204 });
  }

  if (bindings.NOTION_WEBHOOK_SYNC_ENABLED !== "true")
    return new Response(null, { status: 503 });
  if (!await verifyNotionWebhook(body, request.headers.get("x-notion-signature"),
      bindings.NOTION_WEBHOOK_VERIFICATION_TOKEN?.trim() ?? "")) {
    return new Response(null, { status: 401 });
  }
  if (bindings.NOTION_WEBHOOK_SUBSCRIPTION_ID
      && data.subscription_id !== bindings.NOTION_WEBHOOK_SUBSCRIPTION_ID)
    return new Response(null, { status: 403 });

  try {
    const result = await dispatchNotionPageChange(data, bindings);
    if (result === "not-configured") return new Response(null, { status: 503 });
    // No Notion payload, page title or person information is ever logged.
    return Response.json({ received: true, result }, { status: 200 });
  } catch {
    // Non-2xx asks Notion to retry transient failures. The hourly sweep remains
    // an independent recovery path; an uncertain response never confirms D1.
    console.error("notion_targeted_webhook_failed");
    return new Response(null, { status: 503 });
  }
}
