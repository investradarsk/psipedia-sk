import { env } from "cloudflare:workers";
import {
  normalizeAdminNotificationPath,
  sendWebPush,
  type VapidConfig,
  type WebPushPayload,
  type WebPushSubscription,
} from "@/lib/admin-web-push";

type RuntimeBindings = {
  DB?: D1Database;
  WEB_PUSH_ENABLED?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
};

type RuntimeOptions = {
  database?: D1Database;
  bindings?: RuntimeBindings;
  now?: Date;
  fetchImpl?: typeof fetch;
};

export type AdminPushSubscriptionInput = {
  endpoint: string;
  p256dh: string;
  auth: string;
  label?: string;
  platform?: string;
};

type PushDeliveryRow = {
  id: number;
  notification_id: number;
  subscription_id: number;
  status: "pending" | "sent" | "failed" | "dead";
  attempts: number;
  last_error: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
};

const MAX_DEVICES_PER_ADMIN = 10;
const MAX_DELIVERIES_PER_SWEEP = 50;
const MAX_ATTEMPTS = 3;

function runtime(options: RuntimeOptions = {}) {
  const bindings = options.bindings ?? (env as unknown as RuntimeBindings);
  const database = options.database ?? bindings.DB;
  if (!database?.prepare) throw new Error("Admin push nemá pripojenú databázu.");
  return { bindings, database, now: options.now ?? new Date(), fetchImpl: options.fetchImpl ?? fetch };
}

function configuredVapid(bindings: RuntimeBindings): VapidConfig | null {
  const publicKey = bindings.VAPID_PUBLIC_KEY?.trim() ?? "";
  const privateKey = bindings.VAPID_PRIVATE_KEY?.trim() ?? "";
  const subject = bindings.VAPID_SUBJECT?.trim() ?? "";
  if (bindings.WEB_PUSH_ENABLED !== "true" || !publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

export function getAdminPushConfig(options: Pick<RuntimeOptions, "bindings"> = {}) {
  const bindings = options.bindings ?? (env as unknown as RuntimeBindings);
  const publicKey = bindings.VAPID_PUBLIC_KEY?.trim() ?? "";
  const enabled = bindings.WEB_PUSH_ENABLED === "true";
  return {
    enabled,
    configured: enabled && Boolean(publicKey && bindings.VAPID_PRIVATE_KEY?.trim() && bindings.VAPID_SUBJECT?.trim()),
    publicKey: enabled && publicKey ? publicKey : null,
  };
}

function sanitizeText(value: string | undefined, maxLength: number) {
  const normalized = (value ?? "").trim().replace(/[\u0000-\u001f\u007f]/g, "");
  return normalized ? normalized.slice(0, maxLength) : null;
}

function validateSubscription(input: AdminPushSubscriptionInput) {
  const endpoint = new URL(input.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password) {
    throw new Error("Neplatný Web Push endpoint.");
  }
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(input.p256dh)) throw new Error("Neplatný p256dh kľúč.");
  if (!/^[A-Za-z0-9_-]{16,80}$/.test(input.auth)) throw new Error("Neplatný auth kľúč.");
  return {
    endpoint: endpoint.toString(),
    p256dh: input.p256dh,
    auth: input.auth,
    label: sanitizeText(input.label, 80),
    platform: sanitizeText(input.platform, 60),
  };
}

export async function registerAdminPushSubscription(
  adminEmail: string,
  input: AdminPushSubscriptionInput,
  options: RuntimeOptions = {},
) {
  const { database, now } = runtime(options);
  const clean = validateSubscription(input);
  const normalizedEmail = adminEmail.trim().toLowerCase();
  const existing = await database.prepare(
    "SELECT id, admin_email FROM admin_push_subscriptions WHERE endpoint = ? LIMIT 1",
  ).bind(clean.endpoint).first<{ id: number; admin_email: string }>();
  if (existing && existing.admin_email.toLowerCase() !== normalizedEmail) {
    throw new Error("Push subscription patrí inému admin účtu.");
  }

  if (!existing) {
    const count = await database.prepare(
      "SELECT COUNT(*) AS count FROM admin_push_subscriptions WHERE admin_email = ? AND enabled = 1",
    ).bind(normalizedEmail).first<{ count: number }>();
    if (Number(count?.count ?? 0) >= MAX_DEVICES_PER_ADMIN) {
      throw new Error("Dosiahnutý limit registrovaných admin zariadení.");
    }
  }

  const nowIso = now.toISOString();
  await database.prepare(`INSERT INTO admin_push_subscriptions (
      admin_email, endpoint, p256dh, auth, label, platform, enabled, created_at, updated_at, last_seen_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      label = excluded.label,
      platform = excluded.platform,
      enabled = 1,
      updated_at = excluded.updated_at,
      last_seen_at = excluded.last_seen_at
    WHERE admin_push_subscriptions.admin_email = excluded.admin_email`)
    .bind(
      normalizedEmail,
      clean.endpoint,
      clean.p256dh,
      clean.auth,
      clean.label,
      clean.platform,
      nowIso,
      nowIso,
      nowIso,
    ).run();

  return { enabled: true, endpoint: clean.endpoint };
}

export async function disableAdminPushSubscription(
  adminEmail: string,
  endpointValue: string,
  options: RuntimeOptions = {},
) {
  const { database, now } = runtime(options);
  const endpoint = new URL(endpointValue);
  if (endpoint.protocol !== "https:") throw new Error("Neplatný Web Push endpoint.");
  const result = await database.prepare(`UPDATE admin_push_subscriptions
    SET enabled = 0, updated_at = ?, last_seen_at = ?
    WHERE admin_email = ? AND endpoint = ?`)
    .bind(now.toISOString(), now.toISOString(), adminEmail.trim().toLowerCase(), endpoint.toString()).run();
  return { disabled: Number(result.meta?.changes ?? 0) > 0 };
}

export async function getAdminPushSubscriptionState(
  adminEmail: string,
  endpointValue: string | null,
  options: RuntimeOptions = {},
) {
  if (!endpointValue) return { enabled: false };
  const { database, now } = runtime(options);
  let endpoint: URL;
  try {
    endpoint = new URL(endpointValue);
  } catch {
    return { enabled: false };
  }
  if (endpoint.protocol !== "https:") return { enabled: false };
  const row = await database.prepare(
    "SELECT id, enabled FROM admin_push_subscriptions WHERE admin_email = ? AND endpoint = ? LIMIT 1",
  ).bind(adminEmail.trim().toLowerCase(), endpoint.toString()).first<{ id: number; enabled: number }>();
  if (!row) return { enabled: false };
  await database.prepare(
    "UPDATE admin_push_subscriptions SET last_seen_at = ?, updated_at = ? WHERE id = ?",
  ).bind(now.toISOString(), now.toISOString(), row.id).run();
  return { enabled: Boolean(row.enabled) };
}

async function describeNotification(database: D1Database, resourceType: string, resourceId: number): Promise<WebPushPayload | null> {
  if (resourceType === "automation_finding") {
    const row = await database.prepare(`SELECT f.priority, f.review_status, s.label AS source_label
      FROM automation_findings f
      JOIN automation_sources s ON s.id = f.source_id
      WHERE f.id = ? LIMIT 1`).bind(resourceId).first<Record<string, unknown>>();
    if (!row || String(row.priority) !== "HIGH" || !["NEW", "IN_REVIEW"].includes(String(row.review_status))) return null;
    return {
      title: "Psipedia — prioritný záznam na kontrolu",
      body: `Automation našla dôležitú zmenu zo zdroja ${String(row.source_label).slice(0, 90)}.`,
      url: `/admin/operations/automation/${resourceId}`,
      tag: `automation-${resourceId}`,
    };
  }

  if (resourceType === "directory_profile_change_request") {
    const row = await database.prepare(
      "SELECT profile_name, status FROM directory_profile_change_requests WHERE id = ? LIMIT 1",
    ).bind(resourceId).first<Record<string, unknown>>();
    if (!row || !["new", "reviewing"].includes(String(row.status))) return null;
    return {
      title: "Psipedia — návrh na úpravu profilu",
      body: `Prišiel nový návrh pre ${String(row.profile_name).slice(0, 100)}.`,
      url: `/admin/adresar/navrhy#navrh-${resourceId}`,
      tag: `profile-change-${resourceId}`,
    };
  }

  if (resourceType === "article_feedback") {
    const row = await database.prepare(
      "SELECT article_title, helpful, status FROM article_feedback WHERE id = ? LIMIT 1",
    ).bind(resourceId).first<Record<string, unknown>>();
    if (!row || Boolean(row.helpful) || String(row.status) === "resolved") return null;
    return {
      title: "Psipedia — spätná väzba k článku",
      body: `Článok „${String(row.article_title).slice(0, 100)}“ má nový podnet.`,
      url: `/admin/hodnotenia#hodnotenie-${resourceId}`,
      tag: `article-feedback-${resourceId}`,
    };
  }

  return null;
}

async function ensureDeliveries(database: D1Database, nowIso: string) {
  const recentCutoff = new Date(new Date(nowIso).getTime() - 30 * 86_400_000).toISOString();
  const notifications = await database.prepare(`SELECT id, resource_type, resource_id, created_at
    FROM editorial_notifications
    WHERE resource_type IN ('automation_finding','directory_profile_change_request','article_feedback')
      AND created_at >= ?
    ORDER BY created_at ASC
    LIMIT 100`).bind(recentCutoff).all<{ id: number; resource_type: string; resource_id: number; created_at: string }>();

  const subscriptions = await database.prepare(`SELECT id, created_at FROM admin_push_subscriptions
    WHERE enabled = 1 ORDER BY created_at DESC LIMIT 50`).all<{ id: number; created_at: string }>();

  for (const notification of notifications.results) {
    const descriptor = await describeNotification(
      database,
      notification.resource_type,
      notification.resource_id,
    );
    if (!descriptor) continue;
    for (const subscription of subscriptions.results) {
      // Do not replay events that predate the first registration of this device.
      // last_seen_at changes during ordinary status checks and must never suppress a pending event.
      if (notification.created_at < subscription.created_at) continue;
      await database.prepare(`INSERT INTO admin_push_deliveries (
        notification_id, subscription_id, status, attempts, created_at, updated_at
      ) VALUES (?, ?, 'pending', 0, ?, ?)
      ON CONFLICT(notification_id, subscription_id) DO NOTHING`)
        .bind(notification.id, subscription.id, nowIso, nowIso).run();
    }
  }
}

function safeError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error);
  return text.replace(/[^a-zA-Z0-9_.:\-]/g, "_").slice(0, 180);
}

export async function runAdminPushSweep(options: RuntimeOptions = {}) {
  const resolved = runtime(options);
  const vapid = configuredVapid(resolved.bindings);
  if (!vapid) return { configured: false, candidates: 0, sent: 0, failed: 0, dead: 0 };

  const nowIso = resolved.now.toISOString();
  await ensureDeliveries(resolved.database, nowIso);
  const rows = await resolved.database.prepare(`SELECT d.id, d.notification_id, d.subscription_id,
      d.status, d.attempts, d.last_error, s.endpoint, s.p256dh, s.auth
    FROM admin_push_deliveries d
    JOIN admin_push_subscriptions s ON s.id = d.subscription_id
    WHERE d.status IN ('pending','failed') AND d.attempts < ? AND s.enabled = 1
    ORDER BY d.created_at ASC
    LIMIT ?`)
    .bind(MAX_ATTEMPTS, MAX_DELIVERIES_PER_SWEEP)
    .all<PushDeliveryRow>();

  const summary = { configured: true, candidates: rows.results.length, sent: 0, failed: 0, dead: 0 };
  for (const row of rows.results) {
    try {
      const notification = await resolved.database.prepare(
        "SELECT resource_type, resource_id FROM editorial_notifications WHERE id = ? LIMIT 1",
      ).bind(row.notification_id).first<{ resource_type: string; resource_id: number }>();
      if (!notification) {
        await resolved.database.prepare(
          "UPDATE admin_push_deliveries SET status = 'dead', last_error = 'notification_missing', updated_at = ? WHERE id = ?",
        ).bind(nowIso, row.id).run();
        summary.dead += 1;
        continue;
      }
      const descriptor = await describeNotification(
        resolved.database,
        notification.resource_type,
        notification.resource_id,
      );
      if (!descriptor) {
        await resolved.database.prepare(
          "UPDATE admin_push_deliveries SET status = 'dead', last_error = 'no_longer_notifiable', updated_at = ? WHERE id = ?",
        ).bind(nowIso, row.id).run();
        summary.dead += 1;
        continue;
      }

      const result = await sendWebPush(
        { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth } satisfies WebPushSubscription,
        { ...descriptor, url: normalizeAdminNotificationPath(descriptor.url) },
        vapid,
        { fetchImpl: resolved.fetchImpl, now: resolved.now, ttlSeconds: 300 },
      );

      if (result.ok) {
        await resolved.database.prepare(`UPDATE admin_push_deliveries
          SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = NULL, updated_at = ?
          WHERE id = ?`).bind(nowIso, nowIso, row.id).run();
        summary.sent += 1;
        continue;
      }

      if (result.expired) {
        await resolved.database.prepare(
          "UPDATE admin_push_subscriptions SET enabled = 0, updated_at = ? WHERE id = ?",
        ).bind(nowIso, row.subscription_id).run();
        await resolved.database.prepare(`UPDATE admin_push_deliveries
          SET status = 'dead', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`)
          .bind(`push_${result.status}`, nowIso, row.id).run();
        summary.dead += 1;
        continue;
      }

      await resolved.database.prepare(`UPDATE admin_push_deliveries
        SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`)
        .bind(result.retryable ? "failed" : "dead", `push_${result.status}`, nowIso, row.id).run();
      if (result.retryable) summary.failed += 1;
      else summary.dead += 1;
    } catch (error) {
      await resolved.database.prepare(`UPDATE admin_push_deliveries
        SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`)
        .bind(safeError(error), nowIso, row.id).run();
      summary.failed += 1;
    }
  }
  const deliveryRetentionCutoff = new Date(resolved.now.getTime() - 30 * 86_400_000).toISOString();
  const disabledSubscriptionCutoff = new Date(resolved.now.getTime() - 90 * 86_400_000).toISOString();
  await resolved.database.prepare(
    "DELETE FROM admin_push_deliveries WHERE status IN ('sent','dead') AND updated_at < ?",
  ).bind(deliveryRetentionCutoff).run();
  await resolved.database.prepare(
    "DELETE FROM admin_push_subscriptions WHERE enabled = 0 AND updated_at < ?",
  ).bind(disabledSubscriptionCutoff).run();

  return summary;
}
