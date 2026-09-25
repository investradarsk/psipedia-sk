import { ADOPTION_STALE_DAYS } from "@/lib/adoption";
import { adminAuditActorRef } from "@/lib/audit-identity";
import { normalizeAdminNotificationPath } from "@/lib/admin-web-push";

export type AdminNotificationActorType = "PUBLIC" | "PARTNER" | "ADMIN" | "AUTOMATION" | "SYSTEM" | "REVIEW_AUTHOR";

export type AdminNotificationEventInput = {
  eventType: string;
  sourceType: string;
  resourceType: string;
  resourceRef: string | number;
  actorType: AdminNotificationActorType;
  actorRef?: string | null;
  targetUrl: string;
  title: string;
  body: string;
  tag: string;
  dedupeKey: string;
};

function clean(value: string, max: number, field: string) {
  const normalized = value.trim().replace(/[\u0000-\u001f\u007f]/g, " ");
  if (!normalized) throw new Error(`Admin notification ${field} is required.`);
  return normalized.slice(0, max);
}

function normalizeInput(input: AdminNotificationEventInput) {
  const targetUrl = normalizeAdminNotificationPath(input.targetUrl);
  const dedupeKey = clean(input.dedupeKey, 220, "dedupe key");
  return {
    eventType: clean(input.eventType, 80, "event type"),
    sourceType: clean(input.sourceType, 80, "source type"),
    resourceType: clean(input.resourceType, 80, "resource type"),
    resourceRef: clean(String(input.resourceRef), 160, "resource ref"),
    actorType: input.actorType,
    actorRef: input.actorRef ? clean(input.actorRef, 180, "actor ref") : null,
    targetUrl,
    title: clean(input.title, 60, "title"),
    body: clean(input.body, 160, "body"),
    tag: clean(input.tag, 80, "tag"),
    dedupeKey,
  };
}

export function adminNotificationEventStatement(
  database: Pick<D1Database, "prepare">,
  input: AdminNotificationEventInput,
  now: Date | string = new Date(),
) {
  const value = normalizeInput(input);
  const createdAt = typeof now === "string" ? now : now.toISOString();
  return database.prepare(`INSERT OR IGNORE INTO admin_notification_events (
      event_type,source_type,resource_type,resource_ref,actor_type,actor_ref,
      target_url,title,body,tag,dedupe_key,created_at
    ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12)`)
    .bind(
      value.eventType,
      value.sourceType,
      value.resourceType,
      value.resourceRef,
      value.actorType,
      value.actorRef,
      value.targetUrl,
      value.title,
      value.body,
      value.tag,
      value.dedupeKey,
      createdAt,
    );
}

export async function enqueueAdminNotificationEvent(
  database: Pick<D1Database, "prepare">,
  input: AdminNotificationEventInput,
  now: Date | string = new Date(),
) {
  const result = await adminNotificationEventStatement(database, input, now).run();
  return { created: Number(result.meta?.changes ?? 0) > 0 };
}

export async function adminNotificationAdminActorRef(adminEmail: string) {
  return adminAuditActorRef(adminEmail);
}

export async function enqueuePartnerAccountRegistrationAdminNotification(
  database: Pick<D1Database, "prepare">,
  accountId: string,
  now: Date = new Date(),
) {
  return enqueueAdminNotificationEvent(database, {
    eventType: "partner_account_registered",
    sourceType: "PARTNER_ACCOUNT_REGISTRATION",
    resourceType: "partner_account",
    resourceRef: accountId,
    actorType: "PARTNER",
    actorRef: `partner:${accountId}`,
    targetUrl: `/admin/partners/accounts/${accountId}`,
    title: "Nová registrácia Partnera",
    body: "Bol vytvorený nový Partner účet.",
    tag: `partner-account-${accountId}`,
    dedupeKey: `partner-account-registration/${accountId}`,
  }, now);
}


export async function enqueueEditorialReferenceAdminNotification(
  database: Pick<D1Database, "prepare">,
  resourceType: "directory_profile_change_request" | "news_tip" | "article_feedback",
  resourceId: number,
  now: Date = new Date(),
) {
  if (resourceType === "directory_profile_change_request") {
    const row = await database.prepare(
      "SELECT profile_name profileName,status FROM directory_profile_change_requests WHERE id=? LIMIT 1",
    ).bind(resourceId).first<{ profileName: string; status: string }>();
    if (!row || row.status !== "new") return { created: false };
    return enqueueAdminNotificationEvent(database, {
      eventType: "directory_profile_change_submitted",
      sourceType: "DIRECTORY_CHANGE_REQUEST",
      resourceType,
      resourceRef: resourceId,
      actorType: "PUBLIC",
      targetUrl: `/admin/adresar/navrhy#navrh-${resourceId}`,
      title: "Nový návrh úpravy profilu",
      body: `Prišiel návrh pre ${row.profileName}.`,
      tag: `profile-change-${resourceId}`,
      dedupeKey: `directory-profile-change/${resourceId}`,
    }, now);
  }

  if (resourceType === "news_tip") {
    const row = await database.prepare(
      "SELECT title,status FROM news_tips WHERE id=? LIMIT 1",
    ).bind(resourceId).first<{ title: string; status: string }>();
    if (!row || row.status !== "new") return { created: false };
    return enqueueAdminNotificationEvent(database, {
      eventType: "news_tip_submitted",
      sourceType: "NEWS_TIP",
      resourceType,
      resourceRef: resourceId,
      actorType: "PUBLIC",
      targetUrl: `/admin/tipy#tip-${resourceId}`,
      title: "Nový tip pre Psipediu",
      body: row.title,
      tag: `news-tip-${resourceId}`,
      dedupeKey: `news-tip/${resourceId}`,
    }, now);
  }

  const row = await database.prepare(
    "SELECT article_title articleTitle,helpful,status FROM article_feedback WHERE id=? LIMIT 1",
  ).bind(resourceId).first<{ articleTitle: string; helpful: number; status: string }>();
  if (!row || Boolean(row.helpful) || row.status === "resolved") return { created: false };
  return enqueueAdminNotificationEvent(database, {
    eventType: "negative_article_feedback_submitted",
    sourceType: "ARTICLE_FEEDBACK",
    resourceType,
    resourceRef: resourceId,
    actorType: "PUBLIC",
    targetUrl: `/admin/hodnotenia#hodnotenie-${resourceId}`,
    title: "Nová spätná väzba k článku",
    body: `Článok „${row.articleTitle}“ má nový podnet.`,
    tag: `article-feedback-${resourceId}`,
    dedupeKey: `article-feedback/${resourceId}`,
  }, now);
}

export async function enqueueAutomationFindingAdminNotification(
  database: Pick<D1Database, "prepare">,
  findingId: number,
  now: Date = new Date(),
) {
  const row = await database.prepare(`SELECT f.finding_type findingType,f.priority,f.review_status reviewStatus,
      f.last_detected_at lastDetectedAt,s.label sourceLabel
    FROM automation_findings f
    JOIN automation_sources s ON s.id=f.source_id
    WHERE f.id=? LIMIT 1`)
    .bind(findingId)
    .first<{ findingType: string; priority: string; reviewStatus: string; lastDetectedAt: string; sourceLabel: string }>();
  if (!row || !["NEW", "IN_REVIEW"].includes(row.reviewStatus)) return { created: false };
  return enqueueAdminNotificationEvent(database, {
    eventType: "automation_finding_activated",
    sourceType: "AUTOMATION_FINDING",
    resourceType: "automation_finding",
    resourceRef: findingId,
    actorType: "AUTOMATION",
    actorRef: "automation",
    targetUrl: `/admin/operations/automation/${findingId}`,
    title: "Automatický nález vyžaduje kontrolu",
    body: `${row.sourceLabel}: ${row.findingType} (${row.priority}).`,
    tag: `automation-${findingId}`,
    dedupeKey: `automation-finding/${findingId}/${row.lastDetectedAt}`,
  }, now);
}


type RolloutRuntimeRow = { rolloutStartedAt: string };

async function adminNotificationRolloutStartedAt(database: Pick<D1Database, "prepare">) {
  try {
    const row = await database.prepare(
      "SELECT rollout_started_at rolloutStartedAt FROM admin_notification_runtime WHERE id=1 LIMIT 1",
    ).first<RolloutRuntimeRow>();
    return row?.rolloutStartedAt ?? null;
  } catch {
    return null;
  }
}

export async function enqueueUncoveredAttentionAdminNotifications(
  database: Pick<D1Database, "prepare">,
  now = new Date(),
) {
  const rolloutStartedAt = await adminNotificationRolloutStartedAt(database);
  if (!rolloutStartedAt) return { moderation: 0, adoptionStale: 0, commercialExpiry: 0 };
  const nowIso = now.toISOString();
  const summary = { moderation: 0, adoptionStale: 0, commercialExpiry: 0 };

  try {
    const rows = await database.prepare(`
      SELECT id,resource_type resourceType,operation,status,submitter_type submitterType,
        submitter_ref submitterRef,created_at createdAt
      FROM moderation_submissions
      WHERE resource_type IN ('LOST_FOUND_CASE','ADOPTION_DOG')
        AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')
        AND created_at >= ?
      ORDER BY created_at ASC,id ASC
      LIMIT 100
    `).bind(rolloutStartedAt).all<{
      id:string;resourceType:string;operation:string;status:string;
      submitterType:string;submitterRef:string;createdAt:string;
    }>();
    for (const row of rows.results) {
      const lostFound = row.resourceType === "LOST_FOUND_CASE";
      const actorType: AdminNotificationActorType = row.submitterType === "ADMIN"
        ? "ADMIN"
        : row.submitterType === "PARTNER_ACCOUNT" ? "PARTNER" : "PUBLIC";
      let actorRef = row.submitterRef || null;
      if (actorType === "ADMIN") {
        if (actorRef?.includes("@")) actorRef = await adminNotificationAdminActorRef(actorRef);
        else if (!actorRef?.startsWith("admin:")) actorRef = null;
      }
      const result = await enqueueAdminNotificationEvent(database, {
        eventType: "moderation_submission_actionable",
        sourceType: "MODERATION_SUBMISSION",
        resourceType: row.resourceType.toLowerCase(),
        resourceRef: row.id,
        actorType,
        actorRef,
        targetUrl: lostFound ? "/admin/stratene-najdene" : "/admin/adopcie",
        title: lostFound ? "Nové hlásenie čaká na moderáciu" : "Nové adopčné podanie čaká na moderáciu",
        body: `${row.operation} · ${row.status}`,
        tag: `moderation-${row.id}`,
        dedupeKey: `attention/moderation/${row.id}/${row.createdAt}`,
      }, row.createdAt);
      if (result.created) summary.moderation += 1;
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "admin_attention_push_bridge",
      sourceType: "MODERATION_SUBMISSION",
      result: "failed",
      error: error instanceof Error ? error.message : "unknown",
    }));
  }

  try {
    const rows = await database.prepare(`
      SELECT id,name,status,last_verified_at lastVerifiedAt,created_at createdAt
      FROM adoption_dogs
      WHERE status IN ('ACTIVE','RESERVED')
      ORDER BY COALESCE(last_verified_at,created_at) ASC,id ASC
      LIMIT 200
    `).all<{id:number;name:string;status:string;lastVerifiedAt:string|null;createdAt:string}>();
    for (const row of rows.results) {
      const base = row.lastVerifiedAt ?? row.createdAt;
      const activation = new Date(Date.parse(base) + ADOPTION_STALE_DAYS * 86_400_000);
      if (!Number.isFinite(activation.getTime())) continue;
      const activationIso = activation.toISOString();
      if (activationIso < rolloutStartedAt || activationIso > nowIso) continue;
      const result = await enqueueAdminNotificationEvent(database, {
        eventType: "adoption_became_stale",
        sourceType: "ADOPTION_STALE",
        resourceType: "adoption_dog",
        resourceRef: row.id,
        actorType: "SYSTEM",
        actorRef: "adoption-staleness",
        targetUrl: `/admin/adopcie/${row.id}`,
        title: "Adopcia potrebuje nové overenie",
        body: `${row.name} nebola overená aspoň ${ADOPTION_STALE_DAYS} dní.`,
        tag: `adoption-stale-${row.id}`,
        dedupeKey: `attention/adoption-stale/${row.id}/${base}`,
      }, activationIso);
      if (result.created) summary.adoptionStale += 1;
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "admin_attention_push_bridge",
      sourceType: "ADOPTION_STALE",
      result: "failed",
      error: error instanceof Error ? error.message : "unknown",
    }));
  }

  try {
    const horizon = new Date(now.getTime() + 14 * 86_400_000).toISOString();
    const rows = await database.prepare(`
      SELECT id,agreement_type agreementType,end_at endAt
      FROM partner_commercial_agreements
      WHERE status='ACTIVE' AND end_at>? AND end_at<=?
      ORDER BY end_at ASC,id ASC
      LIMIT 100
    `).bind(nowIso,horizon).all<{id:string;agreementType:string;endAt:string}>();
    for (const row of rows.results) {
      const activation = new Date(Date.parse(row.endAt) - 14 * 86_400_000);
      if (!Number.isFinite(activation.getTime())) continue;
      const activationIso = activation.toISOString();
      if (activationIso < rolloutStartedAt || activationIso > nowIso) continue;
      const result = await enqueueAdminNotificationEvent(database, {
        eventType: "partner_commercial_agreement_expiring",
        sourceType: "PARTNER_COMMERCIAL_AGREEMENT",
        resourceType: "partner_commercial_agreement",
        resourceRef: row.id,
        actorType: "SYSTEM",
        actorRef: "commercial-expiry",
        targetUrl: `/admin/partners/commercial/agreements/${row.id}`,
        title: "Partner benefit sa blíži ku koncu",
        body: `${row.agreementType} vyprší do 14 dní.`,
        tag: `partner-agreement-${row.id}`,
        dedupeKey: `attention/commercial-expiry/${row.id}/${row.endAt}`,
      }, activationIso);
      if (result.created) summary.commercialExpiry += 1;
    }
  } catch (error) {
    console.warn(JSON.stringify({
      event: "admin_attention_push_bridge",
      sourceType: "PARTNER_COMMERCIAL_AGREEMENT",
      result: "failed",
      error: error instanceof Error ? error.message : "unknown",
    }));
  }

  return summary;
}
