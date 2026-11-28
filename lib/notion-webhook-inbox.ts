import { UUID, type NotionWebhookEvent } from "./notion-webhook-contract.ts";

const MAX_ATTEMPTS = 12;
const CLAIM_SECONDS = 600;
const COMPLETED_RETENTION_SECONDS = 7 * 24 * 3600;
function retryCode(outcome: NotionWebhookInboxResult | "failed") {
  if (outcome === "remote-deleted") return "NOTION_REMOTE_DELETED";
  if (outcome === "failed") return "DISPATCH_FAILED";
  if (outcome === "disabled") return "NOTION_SYNC_DISABLED";
  if (outcome === "not-configured") return "NOTION_SYNC_NOT_CONFIGURED";
  if (outcome === "deferred") return "RECONCILIATION_DEFERRED";
  return "NEEDS_REVIEW";
}
export type NotionWebhookInboxResult =
  | "processed" | "ignored" | "metadata-only" | "out-of-scope"
  | "review-required" | "remote-deleted" | "deferred" | "disabled" | "not-configured";

type InboxRow = {
  event_key: string; page_id: string; event_type: string;
  changed_properties_json: string; attempts: number;
};

export async function enqueueNotionWebhook(
  database: D1Database, event: NotionWebhookEvent, rawBody: string,
): Promise<void> {
  const pageId = event.entity?.id;
  if (!pageId || !UUID.test(pageId)) throw new Error("NOTION_WEBHOOK_ENTITY_INVALID");
  // Notion supplies a stable event ID. The hash is a deterministic retry-safe fallback.
  const key = event.id && UUID.test(event.id) ? event.id.toLowerCase()
    : "sha256-" + [...new Uint8Array(await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(rawBody)))].map(n => n.toString(16).padStart(2, "0")).join("");
  const changed = Array.isArray(event.data?.updated_properties)
    ? event.data.updated_properties.filter((id): id is string =>
        typeof id === "string" && id.length <= 128).slice(0, 100)
    : [];
  // Versioned envelope retains signed event provenance without a new schema.
  // Old queued arrays remain readable; never attach this time to a later GET value.
  const envelope = { version: 2, properties: changed,
    id: event.id && UUID.test(event.id) ? event.id : undefined,
    timestamp: typeof event.timestamp === "string" && event.timestamp.length <= 64 &&
      Number.isFinite(Date.parse(event.timestamp)) ? event.timestamp : undefined,
    subscriptionId: event.subscription_id && UUID.test(event.subscription_id) ? event.subscription_id : undefined,
  };
  // D1 COMMIT must succeed BEFORE returning HTTP 200. No property values are stored.
  const saved=await database.prepare(
    "INSERT INTO notion_webhook_inbox " +
    "(event_key,page_id,event_type,changed_properties_json) VALUES (?,?,?,?) ON CONFLICT(event_key) DO NOTHING",
  ).bind(key, pageId.toLowerCase(), event.type, JSON.stringify(envelope)).run();
  if((saved as {success?:boolean}).success===false)throw Error("NOTION_WEBHOOK_INBOX_WRITE_FAILED");
}

export async function runNotionWebhookInboxSweep(input: {
  database: D1Database;
  process: (event: NotionWebhookEvent) => Promise<NotionWebhookInboxResult>;
  now?: number; limit?: number;
}) {
  // Refresh the clock per claim and per completion, not once for the batch.
  // A slow preceding remote request must not shorten the next event's lease
  // or make its retry eligible earlier than the intended backoff.
  const clock = () => input.now ?? Date.now();
  const limit = Math.min(8, Math.max(1, input.limit ?? 5));
  const totals = { claimed: 0, done: 0, review: 0, retried: 0 };
  for (let i = 0; i < limit; i += 1) {
    const now = Math.floor(clock() / 1000);
    // One atomic claim; a concurrent cron cannot claim the same row.
    const row = await input.database.prepare(
      "UPDATE notion_webhook_inbox SET status='PROCESSING', attempts=attempts+1, " +
      "lease_until=?, updated_at=? WHERE event_key=(" +
      "SELECT event_key FROM notion_webhook_inbox " +
      "WHERE ((status='PENDING' AND next_attempt_at<=?) " +
      "OR (status='PROCESSING' AND lease_until<=?)) " +
      "AND NOT EXISTS (SELECT 1 FROM notion_webhook_inbox busy " +
      "WHERE busy.page_id=notion_webhook_inbox.page_id AND busy.status='PROCESSING' " +
      "AND busy.lease_until>?) " +
      "ORDER BY received_at,event_key LIMIT 1) " +
      "RETURNING event_key,page_id,event_type,changed_properties_json,attempts",
    ).bind(now + CLAIM_SECONDS, now, now, now, now).first<InboxRow>();
    if (!row) break;
    totals.claimed += 1;
    let outcome: NotionWebhookInboxResult | "failed" = "failed";
    try {
      const stored = JSON.parse(row.changed_properties_json) as unknown;
      const envelope = stored && typeof stored === "object" && !Array.isArray(stored)
        ? stored as { version?: number; properties?: unknown; id?: string; timestamp?: string; subscriptionId?: string } : null;
      const changed = Array.isArray(stored) ? stored : envelope?.version === 2 ? envelope.properties : [];
      const event: NotionWebhookEvent = {
        id: envelope?.version === 2 ? envelope.id : UUID.test(row.event_key) ? row.event_key : undefined,
        timestamp: envelope?.version === 2 ? envelope.timestamp : undefined,
        subscription_id: envelope?.version === 2 ? envelope.subscriptionId : undefined,
        type: row.event_type,
        entity: { id: row.page_id, type: "page" },
        data: { updated_properties: Array.isArray(changed) ? changed : [] },
      };
      outcome = await input.process(event);
    } catch {
      // Do not log provider bodies or Notion field values.
      outcome = "failed";
    }
    const finishedAt = Math.floor(clock() / 1000);
    if (["processed", "ignored", "metadata-only", "out-of-scope"].includes(outcome)) {
      await input.database.prepare(
        "UPDATE notion_webhook_inbox SET status='DONE', outcome=?, " +
        "last_error_code=NULL, lease_until=NULL, updated_at=? " +
        "WHERE event_key=? AND status='PROCESSING' AND attempts=?",
      ).bind(outcome, finishedAt, row.event_key, row.attempts).run();
      totals.done += 1;
    } else if (outcome === "review-required" || outcome === "remote-deleted" || row.attempts >= MAX_ATTEMPTS) {
      await input.database.prepare(
        "UPDATE notion_webhook_inbox SET status='REVIEW', outcome=?, " +
        "last_error_code=?, lease_until=NULL, updated_at=? " +
        "WHERE event_key=? AND status='PROCESSING' AND attempts=?",
      ).bind(outcome, retryCode(outcome),
        finishedAt, row.event_key, row.attempts).run();
      totals.review += 1;
    } else {
      const delay = Math.min(3600, 30 * 2 ** Math.min(row.attempts, 7));
      await input.database.prepare(
        "UPDATE notion_webhook_inbox SET status='PENDING', outcome=NULL, " +
        "last_error_code=?, next_attempt_at=?, lease_until=NULL, updated_at=? " +
        "WHERE event_key=? AND status='PROCESSING' AND attempts=?",
      ).bind(retryCode(outcome),
        finishedAt + delay, finishedAt, row.event_key, row.attempts).run();
      totals.retried += 1;
    }
  }
  // Never remove pending, processing or manual-review events.
  await input.database.prepare(
    "DELETE FROM notion_webhook_inbox WHERE status='DONE' AND updated_at<?",
  ).bind(Math.floor(clock() / 1000) - COMPLETED_RETENTION_SECONDS).run();
  return totals;
}
