import { env } from "cloudflare:workers";
import { enqueueAutomationFindingAdminNotification, enqueueEditorialReferenceAdminNotification } from "@/lib/admin-notifications";
import type { ArticleFeedback } from "@/lib/article-feedback-store";
import type { DirectoryProfileChangeRequest } from "@/lib/directory";
import type { NewsTip } from "@/lib/news-tip";
import type { AutomationFindingNotification } from "@/lib/data-automation";
import {
  notifyDirectoryProfileChangeRequest,
  notifyNegativeArticleFeedback,
  notifyNewsTip,
  notifyAutomationFinding,
  type EditorialEmailBindings,
} from "@/lib/editorial-email";

export type EditorialNotificationResourceType =
  | "directory_profile_change_request"
  | "news_tip"
  | "article_feedback"
  | "automation_finding";
type EditorialNotificationResource = DirectoryProfileChangeRequest | NewsTip | ArticleFeedback | AutomationFindingNotification;
type RuntimeBindings = EditorialEmailBindings & { DB?: D1Database };
type Options = { database?: D1Database; bindings?: EditorialEmailBindings; now?: Date; mirrorAdminPush?: boolean };
type OutboxRow = {
  id: number; resource_type: EditorialNotificationResourceType; resource_id: number;
  notification_type: "new"; status: "pending" | "sent" | "failed"; attempts: number;
  last_attempt_at: string | null; sent_at: string | null; last_error: string | null;
  provider_message_id: string | null; created_at: string; updated_at: string;
};

const COLUMNS = `id, resource_type, resource_id, notification_type, status, attempts,
  last_attempt_at, sent_at, last_error, provider_message_id, created_at, updated_at`;


async function mirrorAdminPushEvent(
  database: D1Database,
  resourceType: EditorialNotificationResourceType,
  resourceId: number,
  now: Date,
) {
  try {
    if (resourceType === "automation_finding") {
      await enqueueAutomationFindingAdminNotification(database, resourceId, now);
    } else {
      await enqueueEditorialReferenceAdminNotification(database, resourceType, resourceId, now);
    }
  } catch (error) {
    console.error(JSON.stringify({
      event: "admin_notification_event_enqueue",
      resourceType,
      resourceId,
      result: "failed",
      error: error instanceof Error ? error.message.slice(0, 180) : "unknown",
    }));
  }
}

function runtime(options: Options = {}) {
  const bindings = env as unknown as RuntimeBindings;
  const database = options.database ?? bindings.DB;
  if (!database?.prepare) throw new Error("Editorial notification outbox nemá pripojenú databázu.");
  return { database, bindings: options.bindings ?? bindings, now: options.now ?? new Date() };
}

function safeError(value: string) {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 180);
}

function log(resourceType: EditorialNotificationResourceType, resourceId: number, result: string, error?: string) {
  const message = JSON.stringify({ event: "editorial_notification", resourceType, resourceId, notificationType: "new", result, ...(error ? { error } : {}) });
  if (result === "failed") console.error(message); else console.info(message);
}

async function deliver(resourceType: EditorialNotificationResourceType, resource: EditorialNotificationResource, bindings: EditorialEmailBindings) {
  const options = { bindings, idempotencyKey: `editorial/${resourceType}/new/${resource.id}` };
  if (resourceType === "directory_profile_change_request") return notifyDirectoryProfileChangeRequest(resource as DirectoryProfileChangeRequest, options);
  if (resourceType === "news_tip") return notifyNewsTip(resource as NewsTip, options);
  if (resourceType === "automation_finding") return notifyAutomationFinding(resource as AutomationFindingNotification, options);
  return notifyNegativeArticleFeedback(resource as ArticleFeedback, options);
}

async function getOrCreate(database: D1Database, resourceType: EditorialNotificationResourceType, resourceId: number, now: string) {
  await database.prepare(`INSERT INTO editorial_notifications (
    resource_type, resource_id, notification_type, status, attempts, created_at, updated_at
  ) VALUES (?, ?, 'new', 'pending', 0, ?, ?)
  ON CONFLICT(resource_type, resource_id, notification_type) DO NOTHING`).bind(resourceType, resourceId, now, now).run();
  const row = await database.prepare(`SELECT ${COLUMNS} FROM editorial_notifications
    WHERE resource_type = ? AND resource_id = ? AND notification_type = 'new' LIMIT 1`)
    .bind(resourceType, resourceId).first<OutboxRow>();
  if (!row) throw new Error("Editorial notification outbox záznam sa nepodarilo vytvoriť.");
  return row;
}

export async function enqueueEditorialNotification(
  resourceType: EditorialNotificationResourceType,
  resourceId: number,
  options: Options = {},
) {
  const { database, now } = runtime(options);
  const outbox = await getOrCreate(database, resourceType, resourceId, now.toISOString());
  if (options.mirrorAdminPush) await mirrorAdminPushEvent(database, resourceType, resourceId, now);
  return { id: outbox.id, status: outbox.status };
}

export async function processEditorialNotification(
  resourceType: EditorialNotificationResourceType,
  resource: EditorialNotificationResource,
  options: Options = {},
) {
  if (resourceType === "article_feedback" && (resource as ArticleFeedback).helpful) return { status: "not_notifiable" as const };
  const { database, bindings, now } = runtime(options);
  const nowIso = now.toISOString();
  const outbox = await getOrCreate(database, resourceType, resource.id, nowIso);
  if (options.mirrorAdminPush) await mirrorAdminPushEvent(database, resourceType, resource.id, now);
  if (outbox.status === "sent") {
    log(resourceType, resource.id, "already_sent");
    return { status: "already_sent" as const, providerMessageId: outbox.provider_message_id };
  }
  const attempt = await database.prepare(`UPDATE editorial_notifications
    SET status = 'pending', attempts = attempts + 1, last_attempt_at = ?, last_error = NULL, updated_at = ?
    WHERE id = ? AND status <> 'sent' RETURNING ${COLUMNS}`).bind(nowIso, nowIso, outbox.id).first<OutboxRow>();
  if (!attempt) return { status: "already_sent" as const, providerMessageId: outbox.provider_message_id };
  const result = await deliver(resourceType, resource, bindings);
  if (result.ok) {
    await database.prepare(`UPDATE editorial_notifications SET status = 'sent', sent_at = ?, last_error = NULL,
      provider_message_id = ?, updated_at = ? WHERE id = ?`).bind(nowIso, result.providerMessageId, nowIso, outbox.id).run();
    log(resourceType, resource.id, "sent");
    return { status: "sent" as const, providerMessageId: result.providerMessageId };
  }
  const error = safeError(result.error);
  await database.prepare(`UPDATE editorial_notifications SET status = 'failed', last_error = ?, updated_at = ?
    WHERE id = ? AND status <> 'sent'`).bind(error, nowIso, outbox.id).run();
  log(resourceType, resource.id, "failed", error);
  return { status: "failed" as const, error };
}

async function loadResource(database: D1Database, row: OutboxRow): Promise<EditorialNotificationResource | null> {
  if (row.resource_type === "directory_profile_change_request") {
    const value = await database.prepare(`SELECT id, profile_id, profile_name, profile_slug, profile_category,
      requester_name, requester_email, requester_phone, requester_role, proposed_data_json, note, authorized,
      consent, status, created_at, updated_at, reviewed_at, reviewed_by
      FROM directory_profile_change_requests WHERE id = ? LIMIT 1`).bind(row.resource_id).first<Record<string, unknown>>();
    if (!value) return null;
    return { id: Number(value.id), profileId: Number(value.profile_id), profileName: String(value.profile_name), profileSlug: String(value.profile_slug), profileCategory: String(value.profile_category), requesterName: String(value.requester_name), requesterEmail: String(value.requester_email), requesterPhone: String(value.requester_phone), requesterRole: String(value.requester_role), proposedData: JSON.parse(String(value.proposed_data_json)), note: String(value.note), authorized: Boolean(value.authorized), consent: Boolean(value.consent), status: String(value.status), createdAt: String(value.created_at), updatedAt: String(value.updated_at), reviewedAt: value.reviewed_at ? String(value.reviewed_at) : null, reviewedBy: value.reviewed_by ? String(value.reviewed_by) : null } as DirectoryProfileChangeRequest;
  }
  if (row.resource_type === "news_tip") {
    const value = await database.prepare("SELECT * FROM news_tips WHERE id = ? LIMIT 1").bind(row.resource_id).first<Record<string, unknown>>();
    if (!value) return null;
    return { id: Number(value.id), topic: String(value.topic), title: String(value.title), summary: String(value.summary), sourceUrl: value.source_url ? String(value.source_url) : null, location: String(value.location), eventDate: value.event_date ? String(value.event_date) : null, contactName: String(value.contact_name), contactEmail: value.contact_email ? String(value.contact_email) : null, status: String(value.status), internalNote: String(value.internal_note), consent: Boolean(value.consent), createdAt: String(value.created_at), updatedAt: String(value.updated_at) } as NewsTip;
  }
  if (row.resource_type === "automation_finding") {
    const value = await database.prepare(`SELECT f.id,f.entity_type,f.finding_type,f.priority,f.source_url,
      f.first_detected_at,f.review_status,s.label AS source_label
      FROM automation_findings f JOIN automation_sources s ON s.id=f.source_id
      WHERE f.id=? LIMIT 1`).bind(row.resource_id).first<Record<string, unknown>>();
    if (!value || !["NEW", "IN_REVIEW"].includes(String(value.review_status))) return null;
    return {
      id: Number(value.id),
      sourceLabel: String(value.source_label),
      entityType: String(value.entity_type),
      findingType: String(value.finding_type),
      priority: String(value.priority),
      sourceUrl: value.source_url ? String(value.source_url) : null,
      detectedAt: String(value.first_detected_at),
      reviewStatus: String(value.review_status),
    } as AutomationFindingNotification;
  }
  const value = await database.prepare("SELECT id, article_path, article_title, helpful, missing_text, created_at FROM article_feedback WHERE id = ? LIMIT 1").bind(row.resource_id).first<Record<string, unknown>>();
  if (!value || Boolean(value.helpful)) return null;
  return { id: Number(value.id), articlePath: String(value.article_path), articleTitle: String(value.article_title), helpful: false, missingText: String(value.missing_text), createdAt: String(value.created_at) };
}

export async function runEditorialNotificationSweep(options: Options = {}) {
  const resolved = runtime(options);
  const rows = await resolved.database.prepare(`SELECT ${COLUMNS} FROM editorial_notifications
    WHERE status IN ('pending','failed') ORDER BY created_at ASC LIMIT 100`).all<OutboxRow>();
  const summary = { candidates: rows.results.length, sent: 0, failed: 0, skipped: 0 };
  for (const row of rows.results) {
    try {
      const resource = await loadResource(resolved.database, row);
      if (!resource) { summary.skipped += 1; continue; }
      const result = await processEditorialNotification(row.resource_type, resource, resolved);
      if (result.status === "sent") summary.sent += 1;
      else if (result.status === "failed") summary.failed += 1;
      else summary.skipped += 1;
    } catch {
      summary.failed += 1;
      log(row.resource_type, row.resource_id, "failed", "outbox_processing_failed");
    }
  }
  return summary;
}
