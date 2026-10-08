import { env } from "cloudflare:workers";
import { enqueueAdminNotificationEvent, enqueueUncoveredAttentionAdminNotifications } from "@/lib/admin-notifications";
import { adminPushCategoryForEvent, parsePushCategories, parseStoredPushCategories, type AdminPushCategory } from "@/lib/admin-automation-events";
import { hashPii, normalizeEmail } from "@/lib/pii-crypto";
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
  PII_HASH_KEY?: string;
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

type LegacyPushDeliveryRow = {
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

type EventDeliveryRow = {
  id: number;
  event_id: number;
  subscription_id: number;
  status: "pending" | "sent" | "failed" | "dead";
  attempts: number;
  last_error: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  title: string;
  body: string;
  target_url: string;
  tag: string;
};

type ActiveSubscriptionRow = {
  id: number;
  admin_email: string;
  created_at: string;
  categories_json: string;
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

export async function updateAdminPushCategories(
  adminEmail: string, endpointValue: string, input: unknown, options: RuntimeOptions = {},
) {
  const { database, now } = runtime(options);
  const endpoint = new URL(endpointValue);
  if (endpoint.protocol !== "https:") throw new Error("Neplatný Web Push endpoint.");
  const categories = parsePushCategories(input);
  const result = await database.prepare(`UPDATE admin_push_subscriptions
    SET categories_json = ?, updated_at = ?
    WHERE admin_email = ? AND endpoint = ? AND enabled = 1`)
    .bind(JSON.stringify(categories), now.toISOString(), adminEmail.trim().toLowerCase(), endpoint.toString()).run();
  if (!result.meta?.changes) throw new Error("Zariadenie nie je registrované.");
  return { categories };
}

export async function enqueueAdminPushTest(
  adminEmail: string, endpointValue: string, options: RuntimeOptions = {},
) {
  const { database, now } = runtime(options);
  const endpoint = new URL(endpointValue);
  if (endpoint.protocol !== "https:") throw new Error("Neplatný Web Push endpoint.");
  const row = await database.prepare(`SELECT id FROM admin_push_subscriptions
    WHERE admin_email = ? AND endpoint = ? AND enabled = 1 LIMIT 1`)
    .bind(adminEmail.trim().toLowerCase(), endpoint.toString()).first<{ id: number }>();
  if (!row) throw new Error("Zariadenie nie je registrované.");
  const recent = await database.prepare(`SELECT id FROM admin_notification_events
    WHERE event_type = 'admin_push_test' AND resource_ref = ? AND created_at >= ? LIMIT 1`)
    .bind(String(row.id), new Date(now.getTime() - 60_000).toISOString()).first();
  if (recent) return { queued: false, rateLimited: true };
  const result = await enqueueAdminNotificationEvent(database, {
    eventType: "admin_push_test", sourceType: "ADMIN_PUSH_TEST", resourceType: "PUSH_SUBSCRIPTION",
    resourceRef: row.id, actorType: "ADMIN", actorRef: "test-request",
    targetUrl: "/admin/nastavenia", title: "Psipedia — test upozornenia",
    body: "Test systému upozornení. Doručenie do iPhonu závisí od systému iOS.",
    tag: `admin-test-${row.id}-${now.getTime()}`,
    dedupeKey: `admin-push-test/${row.id}/${Math.floor(now.getTime() / 60000)}`,
  }, now);
  return { queued: result.created, rateLimited: !result.created };
}

export async function getAdminPushDeviceReport(
  adminEmail: string, endpointValue: string, options: RuntimeOptions = {},
) {
  const { database } = runtime(options);
  const endpoint = new URL(endpointValue);
  if (endpoint.protocol !== "https:") throw new Error("Neplatný Web Push endpoint.");
  const subscription = await database.prepare(`SELECT id, categories_json FROM admin_push_subscriptions
    WHERE admin_email = ? AND endpoint = ? AND enabled = 1 LIMIT 1`)
    .bind(adminEmail.trim().toLowerCase(), endpoint.toString())
    .first<{ id: number; categories_json: string }>();
  if (!subscription) return { enabled: false, categories: [], deliveries: [] };
  const rows = await database.prepare(`SELECT d.status, d.attempts, d.last_error, d.sent_at, d.created_at
    FROM admin_push_event_deliveries d
    WHERE d.subscription_id = ? ORDER BY d.id DESC LIMIT 10`).bind(subscription.id)
    .all<{ status: string; attempts: number; last_error: string | null; sent_at: string | null; created_at: string }>();
  return {
    enabled: true, categories: parseStoredPushCategories(subscription.categories_json),
    deliveries: rows.results.map((item) => ({
      status: item.status === "pending" ? "queued" : item.status === "sent" ? "sent" : "failed",
      attempts: item.attempts, error: item.last_error, sentAt: item.sent_at, queuedAt: item.created_at,
    })),
  };
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
    "SELECT id, enabled, categories_json FROM admin_push_subscriptions WHERE admin_email = ? AND endpoint = ? LIMIT 1",
  ).bind(adminEmail.trim().toLowerCase(), endpoint.toString()).first<{ id: number; enabled: number; categories_json: string }>();
  if (!row) return { enabled: false };
  await database.prepare(
    "UPDATE admin_push_subscriptions SET last_seen_at = ?, updated_at = ? WHERE id = ?",
  ).bind(now.toISOString(), now.toISOString(), row.id).run();
  return { enabled: Boolean(row.enabled), categories: parseStoredPushCategories(row.categories_json) };
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

async function adminActorRefForSubscription(email: string, hashKey: string | undefined) {
  const key = hashKey?.trim();
  if (!key) return null;
  return `admin:${await hashPii(normalizeEmail(email), key)}`;
}

async function ensureEventDeliveries(database: D1Database, bindings: RuntimeBindings, nowIso: string) {
  const subscriptions = await database.prepare(`SELECT id, admin_email, created_at, categories_json
    FROM admin_push_subscriptions
    WHERE enabled = 1
    ORDER BY created_at ASC
    LIMIT 50`).all<ActiveSubscriptionRow>();

  for (const subscription of subscriptions.results) {
    const ownActorRef = await adminActorRefForSubscription(subscription.admin_email, bindings.PII_HASH_KEY);
    const permitted = new Set(parseStoredPushCategories(subscription.categories_json));
    const events = await database.prepare(`SELECT e.id, e.event_type, e.actor_type
      FROM admin_notification_events e
      WHERE e.created_at >= ?
        AND (e.source_type <> 'AUTOMATION_ACTION' OR e.event_type='automation_source_issue')
        AND (e.event_type <> 'admin_push_test' OR e.resource_ref = ?)
        AND NOT EXISTS (
          SELECT 1 FROM admin_push_event_deliveries d
          WHERE d.event_id = e.id AND d.subscription_id = ?
        )
        AND (
          e.event_type = 'admin_push_test'
          OR (? IS NULL AND e.actor_type <> 'ADMIN')
          OR (? IS NOT NULL AND NOT (e.actor_type = 'ADMIN' AND e.actor_ref = ?))
        )
      ORDER BY e.created_at ASC, e.id ASC
      LIMIT 100`)
      .bind(subscription.created_at, String(subscription.id), subscription.id, ownActorRef, ownActorRef, ownActorRef)
      .all<{ id: number; event_type: string; actor_type: string }>();

    for (const event of events.results) {
      const category = event.actor_type === "AUTOMATION" ? adminPushCategoryForEvent(event.event_type) : null;
      const muted = category !== null && !permitted.has(category);
      await database.prepare(`INSERT INTO admin_push_event_deliveries (
          event_id, subscription_id, status, attempts, created_at, updated_at
        ) VALUES (?, ?, ?, 0, ?, ?)
        ON CONFLICT(event_id, subscription_id) DO NOTHING`)
        .bind(event.id, subscription.id, muted ? "dead" : "pending", nowIso, nowIso).run();
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
  await enqueueUncoveredAttentionAdminNotifications(resolved.database, resolved.now).catch((error) => {
    console.warn(JSON.stringify({
      event: "admin_attention_push_bridge",
      result: "failed",
      error: safeError(error),
    }));
  });
  await ensureEventDeliveries(resolved.database, resolved.bindings, nowIso);

  const summary = { configured: true, candidates: 0, sent: 0, failed: 0, dead: 0 };

  const eventRows = await resolved.database.prepare(`SELECT d.id, d.event_id, d.subscription_id,
      d.status, d.attempts, d.last_error, s.endpoint, s.p256dh, s.auth,
      e.title, e.body, e.target_url, e.tag
    FROM admin_push_event_deliveries d
    JOIN admin_push_subscriptions s ON s.id = d.subscription_id
    JOIN admin_notification_events e ON e.id = d.event_id
    WHERE d.status IN ('pending','failed') AND d.attempts < ? AND s.enabled = 1
    ORDER BY d.created_at ASC
    LIMIT ?`)
    .bind(MAX_ATTEMPTS, MAX_DELIVERIES_PER_SWEEP)
    .all<EventDeliveryRow>();

  summary.candidates += eventRows.results.length;
  for (const row of eventRows.results) {
    try {
      const result = await sendWebPush(
        { endpoint: row.endpoint, p256dh: row.p256dh, auth: row.auth } satisfies WebPushSubscription,
        {
          title: row.title,
          body: row.body,
          url: normalizeAdminNotificationPath(row.target_url),
          tag: row.tag,
        },
        vapid,
        { fetchImpl: resolved.fetchImpl, now: resolved.now, ttlSeconds: 300 },
      );

      if (result.ok) {
        await resolved.database.prepare(`UPDATE admin_push_event_deliveries
          SET status = 'sent', attempts = attempts + 1, sent_at = ?, last_error = NULL, updated_at = ?
          WHERE id = ?`).bind(nowIso, nowIso, row.id).run();
        summary.sent += 1;
        continue;
      }

      if (result.expired) {
        await resolved.database.prepare(
          "UPDATE admin_push_subscriptions SET enabled = 0, updated_at = ? WHERE id = ?",
        ).bind(nowIso, row.subscription_id).run();
        await resolved.database.prepare(`UPDATE admin_push_event_deliveries
          SET status = 'dead', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`)
          .bind(`push_${result.status}`, nowIso, row.id).run();
        summary.dead += 1;
        continue;
      }

      await resolved.database.prepare(`UPDATE admin_push_event_deliveries
        SET status = ?, attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`)
        .bind(result.retryable ? "failed" : "dead", `push_${result.status}`, nowIso, row.id).run();
      if (result.retryable) summary.failed += 1;
      else summary.dead += 1;
    } catch (error) {
      await resolved.database.prepare(`UPDATE admin_push_event_deliveries
        SET status = 'failed', attempts = attempts + 1, last_error = ?, updated_at = ? WHERE id = ?`)
        .bind(safeError(error), nowIso, row.id).run();
      summary.failed += 1;
    }
  }

  const remaining = Math.max(0, MAX_DELIVERIES_PER_SWEEP - eventRows.results.length);
  if (remaining > 0) {
    const legacyRows = await resolved.database.prepare(`SELECT d.id, d.notification_id, d.subscription_id,
        d.status, d.attempts, d.last_error, s.endpoint, s.p256dh, s.auth
      FROM admin_push_deliveries d
      JOIN admin_push_subscriptions s ON s.id = d.subscription_id
      WHERE d.status IN ('pending','failed') AND d.attempts < ? AND s.enabled = 1
      ORDER BY d.created_at ASC
      LIMIT ?`)
      .bind(MAX_ATTEMPTS, remaining)
      .all<LegacyPushDeliveryRow>();

    summary.candidates += legacyRows.results.length;
    for (const row of legacyRows.results) {
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
  }

  const deliveryRetentionCutoff = new Date(resolved.now.getTime() - 30 * 86_400_000).toISOString();
  const eventRetentionCutoff = new Date(resolved.now.getTime() - 90 * 86_400_000).toISOString();
  const disabledSubscriptionCutoff = eventRetentionCutoff;
  await resolved.database.prepare(
    "DELETE FROM admin_push_event_deliveries WHERE status IN ('sent','dead') AND updated_at < ?",
  ).bind(deliveryRetentionCutoff).run();
  await resolved.database.prepare(
    "DELETE FROM admin_push_deliveries WHERE status IN ('sent','dead') AND updated_at < ?",
  ).bind(deliveryRetentionCutoff).run();
  await resolved.database.prepare(`DELETE FROM admin_notification_events
    WHERE created_at < ?
      AND NOT EXISTS (
        SELECT 1 FROM admin_push_event_deliveries d
        WHERE d.event_id = admin_notification_events.id AND d.status IN ('pending','failed')
      )
      AND NOT (
        source_type='AUTOMATION_ACTION'
        AND event_type='automation_draft_created'
        AND (
          (resource_type IN ('automation_draft_veterinari','automation_draft_psie-sluzby')
            AND EXISTS (SELECT 1 FROM directory_profiles p WHERE p.id=CAST(resource_ref AS INTEGER) AND LOWER(p.status)='draft'))
          OR (resource_type='automation_draft_utulky-organizacie'
            AND EXISTS (SELECT 1 FROM help_organizations o WHERE o.id=CAST(resource_ref AS INTEGER) AND LOWER(o.status)='draft'))
          OR (resource_type='automation_draft_podujatia'
            AND EXISTS (SELECT 1 FROM managed_events e WHERE e.id=CAST(resource_ref AS INTEGER) AND LOWER(e.status)='draft'))
          OR (resource_type='automation_draft_adopcie'
            AND EXISTS (SELECT 1 FROM adoption_dogs a WHERE a.id=CAST(resource_ref AS INTEGER) AND LOWER(a.status)='draft'))
          OR (resource_type='automation_draft_docasna-opatera'
            AND EXISTS (SELECT 1 FROM help_cases h WHERE h.id=CAST(resource_ref AS INTEGER) AND LOWER(h.status)='draft'))
          OR (resource_type='automation_draft_stratene-najdene'
            AND EXISTS (SELECT 1 FROM lost_found_dog_reports l WHERE l.id=CAST(resource_ref AS INTEGER) AND LOWER(l.status)='draft'))
        )
      )`).bind(eventRetentionCutoff).run();
  await resolved.database.prepare(
    "DELETE FROM admin_push_subscriptions WHERE enabled = 0 AND updated_at < ?",
  ).bind(disabledSubscriptionCutoff).run();

  return summary;
}
