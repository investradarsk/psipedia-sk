import { env } from "cloudflare:workers";
import type { DirectoryInquiry } from "@/lib/directory";
import {
  getDirectoryInquiryStatus,
  listRecentNewDirectoryInquiriesNeedingNotification,
  listStaleNewDirectoryInquiries,
} from "@/lib/directory-inquiry-store";
import {
  notifyDirectoryInquiry,
  type DirectoryInquiryNotificationType,
  type EditorialEmailBindings,
} from "@/lib/editorial-email";

type NotificationStatus = "pending" | "sent" | "failed";

type RuntimeBindings = EditorialEmailBindings & { DB?: D1Database };

type DirectoryInquiryNotificationRow = {
  id: number;
  inquiry_id: number;
  notification_type: string;
  status: string;
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
  provider_message_id: string | null;
  created_at: string;
  updated_at: string;
};

type NotificationOptions = {
  database?: D1Database;
  bindings?: EditorialEmailBindings;
  now?: Date;
};

type SweepSummary = { candidates: number; sent: number; failed: number; skipped: number };

const OUTBOX_COLUMNS = `
  id, inquiry_id, notification_type, status, attempts, last_attempt_at,
  sent_at, last_error, provider_message_id, created_at, updated_at
`;

function resolveRuntime(options: NotificationOptions = {}) {
  const runtime = env as unknown as RuntimeBindings;
  const database = options.database ?? runtime.DB;
  if (!database || typeof database.prepare !== "function") {
    throw new Error("Databáza dopytov nie je pripojená.");
  }
  return {
    database,
    bindings: options.bindings ?? runtime,
    now: options.now ?? new Date(),
  };
}

function safeError(value: string) {
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 180);
}

function notificationStatus(value: string): NotificationStatus {
  return value === "sent" ? "sent" : value === "failed" ? "failed" : "pending";
}

async function getOrCreateOutbox(
  database: D1Database,
  inquiryId: number,
  notificationType: DirectoryInquiryNotificationType,
  nowIso: string,
) {
  await database.prepare(`
    INSERT INTO directory_inquiry_notifications (
      inquiry_id, notification_type, status, attempts, last_attempt_at,
      sent_at, last_error, provider_message_id, created_at, updated_at
    ) VALUES (?, ?, 'pending', 0, NULL, NULL, NULL, NULL, ?, ?)
    ON CONFLICT(inquiry_id, notification_type) DO NOTHING
  `).bind(inquiryId, notificationType, nowIso, nowIso).run();

  const row = await database.prepare(`
    SELECT ${OUTBOX_COLUMNS}
    FROM directory_inquiry_notifications
    WHERE inquiry_id = ? AND notification_type = ?
    LIMIT 1
  `).bind(inquiryId, notificationType).first<DirectoryInquiryNotificationRow>();
  if (!row) throw new Error("Notification outbox záznam sa nepodarilo vytvoriť.");
  return row;
}

function logAttempt(input: {
  inquiryId: number;
  notificationType: DirectoryInquiryNotificationType;
  result: "sent" | "failed" | "already_sent" | "skipped_status";
  attempts?: number;
  error?: string;
}) {
  const payload = {
    event: "directory_inquiry_notification",
    inquiryId: input.inquiryId,
    notificationType: input.notificationType,
    result: input.result,
    ...(typeof input.attempts === "number" ? { attempts: input.attempts } : {}),
    ...(input.error ? { error: input.error } : {}),
  };
  const message = JSON.stringify(payload);
  if (input.result === "failed") console.error(message);
  else console.info(message);
}

export async function processDirectoryInquiryNotification(
  inquiry: DirectoryInquiry,
  notificationType: DirectoryInquiryNotificationType,
  options: NotificationOptions = {},
) {
  const { database, bindings, now } = resolveRuntime(options);
  const nowIso = now.toISOString();

  if (notificationType === "stale-24h") {
    const currentStatus = await getDirectoryInquiryStatus(inquiry.id, database);
    if (currentStatus !== "new") {
      logAttempt({ inquiryId: inquiry.id, notificationType, result: "skipped_status" });
      return { status: "skipped_status" as const };
    }
  }

  const outbox = await getOrCreateOutbox(database, inquiry.id, notificationType, nowIso);
  if (notificationStatus(outbox.status) === "sent") {
    logAttempt({
      inquiryId: inquiry.id,
      notificationType,
      result: "already_sent",
      attempts: Number(outbox.attempts),
    });
    return { status: "already_sent" as const, providerMessageId: outbox.provider_message_id };
  }

  if (notificationType === "stale-24h") {
    const currentStatus = await getDirectoryInquiryStatus(inquiry.id, database);
    if (currentStatus !== "new") {
      logAttempt({ inquiryId: inquiry.id, notificationType, result: "skipped_status" });
      return { status: "skipped_status" as const };
    }
  }

  const attemptRow = await database.prepare(`
    UPDATE directory_inquiry_notifications
    SET status = 'pending', attempts = attempts + 1, last_attempt_at = ?, last_error = NULL, updated_at = ?
    WHERE id = ? AND status <> 'sent'
    RETURNING ${OUTBOX_COLUMNS}
  `).bind(nowIso, nowIso, outbox.id).first<DirectoryInquiryNotificationRow>();

  if (!attemptRow) {
    const latest = await database.prepare(`SELECT ${OUTBOX_COLUMNS} FROM directory_inquiry_notifications WHERE id = ? LIMIT 1`)
      .bind(outbox.id).first<DirectoryInquiryNotificationRow>();
    logAttempt({
      inquiryId: inquiry.id,
      notificationType,
      result: "already_sent",
      attempts: Number(latest?.attempts ?? outbox.attempts),
    });
    return { status: "already_sent" as const, providerMessageId: latest?.provider_message_id ?? null };
  }

  const delivery = await notifyDirectoryInquiry(inquiry, notificationType, { bindings });
  if (delivery.ok) {
    await database.prepare(`
      UPDATE directory_inquiry_notifications
      SET status = 'sent', sent_at = ?, last_error = NULL, provider_message_id = ?, updated_at = ?
      WHERE id = ?
    `).bind(nowIso, delivery.providerMessageId, nowIso, outbox.id).run();
    logAttempt({
      inquiryId: inquiry.id,
      notificationType,
      result: "sent",
      attempts: Number(attemptRow.attempts),
    });
    return { status: "sent" as const, providerMessageId: delivery.providerMessageId };
  }

  const error = safeError(delivery.error);
  await database.prepare(`
    UPDATE directory_inquiry_notifications
    SET status = 'failed', last_error = ?, updated_at = ?
    WHERE id = ? AND status <> 'sent'
  `).bind(error, nowIso, outbox.id).run();
  logAttempt({
    inquiryId: inquiry.id,
    notificationType,
    result: "failed",
    attempts: Number(attemptRow.attempts),
    error,
  });
  return { status: "failed" as const, error };
}

async function processSweep(
  inquiries: DirectoryInquiry[],
  notificationType: DirectoryInquiryNotificationType,
  options: Required<Pick<NotificationOptions, "database" | "bindings" | "now">>,
) {
  const summary: SweepSummary = { candidates: inquiries.length, sent: 0, failed: 0, skipped: 0 };
  for (const inquiry of inquiries) {
    try {
      if (notificationType === "new" && await getDirectoryInquiryStatus(inquiry.id, options.database) !== "new") {
        summary.skipped += 1;
        logAttempt({ inquiryId: inquiry.id, notificationType, result: "skipped_status" });
        continue;
      }
      const result = await processDirectoryInquiryNotification(inquiry, notificationType, options);
      if (result.status === "sent") summary.sent += 1;
      else if (result.status === "failed") summary.failed += 1;
      else summary.skipped += 1;
    } catch {
      summary.failed += 1;
      console.error(JSON.stringify({
        event: "directory_inquiry_notification",
        inquiryId: inquiry.id,
        notificationType,
        result: "failed",
        error: "outbox_processing_failed",
      }));
    }
  }
  return summary;
}

export async function runDirectoryInquiryNotificationSweep(options: NotificationOptions = {}) {
  const { database, bindings, now } = resolveRuntime(options);
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();

  const recentNeedingInitial = await listRecentNewDirectoryInquiriesNeedingNotification(cutoff, database);
  const initial = await processSweep(recentNeedingInitial, "new", { database, bindings, now });

  const staleInquiries = await listStaleNewDirectoryInquiries(cutoff, database);
  const stale = await processSweep(staleInquiries, "stale-24h", { database, bindings, now });

  return { initial, stale };
}
