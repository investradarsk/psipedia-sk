import { env } from "cloudflare:workers";
import { getAdminApiUser, unauthorizedAdminResponse } from "@/lib/admin-auth";
import { notionRequest } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";

export const dynamic = "force-dynamic";

type Bindings = {
  DB?: D1Database;
  NOTION_API_TOKEN?: string;
  NOTION_WEBHOOK_SYNC_ENABLED?: string;
  NOTION_WEBHOOK_INBOX_ENABLED?: string;
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
};
type LinkedRecord = {
  notion_page_id: string;
  content_hash: string;
  last_synced_at: string | null;
  notion_last_edited_time: string | null;
  psipedia_updated_at: string | null;
};
type InboxRecord = {
  event_type: string;
  status: string;
  attempts: number;
  received_at: number;
  updated_at: number;
  next_attempt_at: number | null;
  outcome: string | null;
  last_error_code: string | null;
};
type NotionPage = {
  id: string;
  parent?: { type?: string; data_source_id?: string };
  archived?: boolean;
  in_trash?: boolean;
  last_edited_time?: string;
  properties?: Record<string, { rich_text?: Array<{
    plain_text?: string;
    text?: { content?: string };
  }> }>;
};

const json = (value: unknown, status = 200) => Response.json(value, {
  status,
  headers: { "Cache-Control": "private, no-store" },
});

function propertyText(page: NotionPage, name: string): string | null {
  const raw = page.properties?.[name];
  if (!raw || !Array.isArray(raw.rich_text)) return null;
  return raw.rich_text.map(value => value.plain_text ?? value.text?.content ?? "").join("");
}

function timestamp(value: number | null) {
  return value !== null && Number.isFinite(value) ? new Date(value * 1000).toISOString() : null;
}

/**
 * Read-only, Admin-authenticated one-record diagnostic. Does not acknowledge
 * a webhook, change a sync baseline, edit a Notion page, or expose contact PII.
 */
export async function GET(request: Request) {
  if (!(await getAdminApiUser())) return unauthorizedAdminResponse();
  const profileId = Number(new URL(request.url).searchParams.get("profileId"));
  if (!Number.isSafeInteger(profileId) || profileId <= 0) {
    return json({ error: "INVALID_PROFILE_ID" }, 400);
  }
  const bindings = env as unknown as Bindings;
  if (!bindings.DB) return json({ error: "DB_UNAVAILABLE" }, 503);
  try {
    const db = bindings.DB;
    const [source, mapping, canonical] = await Promise.all([
      db.prepare("SELECT data_source_id AS id FROM notion_agenda_targets WHERE agenda='lost-found' LIMIT 1")
        .first<{ id: string }>(),
      db.prepare("SELECT notion_page_id,content_hash,last_synced_at,notion_last_edited_time,psipedia_updated_at " +
        "FROM notion_agenda_sync WHERE agenda='lost-found' AND entity_id=? LIMIT 1")
        .bind(profileId).first<LinkedRecord>(),
      db.prepare("SELECT short_description AS short_description,updated_at FROM lost_found_dog_reports WHERE id=? LIMIT 1")
        .bind(profileId).first<{ short_description: string; updated_at: string }>(),
    ]);
    if (!canonical) return json({ error: "PROFILE_NOT_FOUND" }, 404);
    const inbox = mapping ? await db.prepare(
      "SELECT event_type,status,attempts,received_at,updated_at,next_attempt_at,outcome,last_error_code " +
      "FROM notion_webhook_inbox WHERE page_id=? " +
      "ORDER BY received_at DESC, updated_at DESC LIMIT 8",
    ).bind(mapping.notion_page_id).all<InboxRecord>() : null;

    const diagnostic: Record<string, unknown> = {
      profileId,
      linked: Boolean(mapping),
      targetConfigured: Boolean(source?.id),
      webhookEnabled: bindings.NOTION_WEBHOOK_SYNC_ENABLED === "true",
      inboxEnabled: bindings.NOTION_WEBHOOK_INBOX_ENABLED === "true",
      inboundSyncEnabled: bindings.NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED === "true",
      canonicalShortDescriptionPresent: Boolean(canonical.short_description),
      canonicalUpdatedAt: canonical.updated_at,
      mappedLastSyncedAt: mapping?.last_synced_at ?? null,
      mappedNotionLastEditedAt: mapping?.notion_last_edited_time ?? null,
      inboxEvents: (inbox?.results ?? []).map(row => ({
        type: row.event_type,
        status: row.status,
        attempts: row.attempts,
        receivedAt: timestamp(row.received_at),
        processedAt: timestamp(row.updated_at),
        nextAttemptAt: timestamp(row.next_attempt_at),
        outcome: row.outcome,
        errorCode: row.last_error_code,
      })),
      notionCheck: "NOT_CHECKED",
    };

    // One GET against a verified linked Notion page; compare only the public
    // short-description field and do not echo any values or private properties.
    if (mapping && source?.id && bindings.NOTION_API_TOKEN?.trim()) {
      try {
        const page = await notionRequest<NotionPage>(
          { NOTION_API_TOKEN: bindings.NOTION_API_TOKEN },
          "/pages/" + encodeURIComponent(mapping.notion_page_id),
          { method: "GET" },
          { retryTransient: false },
        );
        if (page.id !== mapping.notion_page_id ||
          !notionPageBelongsToDataSource(page, source.id)) {
          diagnostic.notionCheck = "SOURCE_IDENTITY_MISMATCH";
        } else {
          const notionShort = propertyText(page, "Krátky popis");
          diagnostic.notionCheck = notionShort === null ? "SHORT_DESCRIPTION_UNAVAILABLE" : "OK";
          diagnostic.notionShortDescriptionPresent = Boolean(notionShort?.trim());
          diagnostic.shortDescriptionMatches = notionShort === null ? null :
            notionShort.trim() === (canonical.short_description ?? "").trim();
          diagnostic.notionLastEditedAt = page.last_edited_time ?? null;
        }
      } catch {
        diagnostic.notionCheck = "NOTION_READ_FAILED";
      }
    }
    return json(diagnostic);
  } catch {
    return json({ error: "LOST_FOUND_SYNC_DIAGNOSTIC_FAILED" }, 503);
  }
}
