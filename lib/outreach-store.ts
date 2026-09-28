import { env } from "cloudflare:workers";
import { SITE_URL } from "@/config/public-site";
import {
  DEFAULT_OUTREACH_BODY,
  DEFAULT_OUTREACH_SUBJECT,
  buildOutreachDryRun,
  directoryOutreachEmailValues,
  filterOutreachHistory,
  maskOutreachEmail,
  normalizeOutreachEmail,
  outreachTextToHtml,
  parseOutreachSelection,
  renderOutreachText,
  splitOutreachEmails,
  type OutreachCampaignStatus,
  type OutreachDryRun,
  type OutreachEntityCandidate,
  type OutreachEntityType,
  type OutreachSelection,
} from "@/lib/outreach";
import {
  getOutreachEmailProvider,
  getOutreachProviderStatus,
  type OutreachEmailBindings,
} from "@/lib/outreach-email";
import {
  createOutreachOpaqueToken,
  hashOutreachToken,
  sha256Base64Url,
} from "@/lib/outreach-security";
import { createD1RateLimitStore, enforceRateLimit } from "@/lib/rate-limit";
import { normalizePlainText } from "@/lib/submission-security";

type RuntimeBindings = OutreachEmailBindings & {
  DB?: D1Database;
  OUTREACH_WEBHOOK_SECRET?: string;
};

type CampaignRow = {
  id: string;
  name: string;
  purpose: string;
  status: OutreachCampaignStatus;
  selection_json: string;
  subject_template: string;
  body_template: string;
  provider_key: string;
  selected_entity_count: number;
  unique_recipient_count: number;
  deduplicated_count: number;
  suppressed_count: number;
  invalid_email_count: number;
  previewed_at: string | null;
  prepared_at: string | null;
  scheduled_at: string | null;
  send_started_at: string | null;
  sent_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

type RecipientRow = {
  id: string;
  campaign_id: string;
  recipient_email: string;
  normalized_email: string;
  send_state: string;
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  response_submitted_at: string | null;
  provider_message_id: string | null;
  last_error: string | null;
  suppressed_reason: string | null;
  created_at: string;
  updated_at: string;
};

type RecipientEntityRow = {
  recipient_id: string;
  entity_type: OutreachEntityType;
  entity_id: string;
  entity_name: string;
  profile_url: string;
  region: string;
  public_snapshot_json: string;
};

type TokenRow = {
  id: string;
  recipient_id: string;
  purpose: "VERIFY" | "UNSUBSCRIBE";
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
};

const CAMPAIGN_COLUMNS = [
  "id", "name", "purpose", "status", "selection_json", "subject_template", "body_template", "provider_key",
  "selected_entity_count", "unique_recipient_count", "deduplicated_count", "suppressed_count",
  "invalid_email_count", "previewed_at", "prepared_at", "scheduled_at", "send_started_at", "sent_at",
  "completed_at", "created_at", "updated_at", "created_by", "updated_by",
].join(", ");

const RECIPIENT_COLUMNS = [
  "id", "campaign_id", "recipient_email", "normalized_email", "send_state", "attempts",
  "last_attempt_at", "sent_at", "delivered_at", "bounced_at", "response_submitted_at",
  "provider_message_id", "last_error", "suppressed_reason", "created_at", "updated_at",
].join(", ");

function runtimeDatabase(database?: D1Database) {
  const db = database ?? (env as unknown as RuntimeBindings).DB;
  if (!db?.prepare) throw new Error("Outreach databáza nie je pripojená.");
  return db;
}

function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function campaignFromRow(row: CampaignRow) {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    status: row.status,
    selection: safeJson<OutreachSelection>(row.selection_json, parseOutreachSelection({})),
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    providerKey: row.provider_key,
    counts: {
      selectedEntities: row.selected_entity_count,
      uniqueRecipients: row.unique_recipient_count,
      deduplicated: row.deduplicated_count,
      suppressed: row.suppressed_count,
      invalidEmails: row.invalid_email_count,
    },
    previewedAt: row.previewed_at,
    preparedAt: row.prepared_at,
    scheduledAt: row.scheduled_at,
    sendStartedAt: row.send_started_at,
    sentAt: row.sent_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function recipientFromRow(row: RecipientRow) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    recipientEmail: row.recipient_email,
    maskedEmail: maskOutreachEmail(row.recipient_email),
    normalizedEmail: row.normalized_email,
    sendState: row.send_state,
    attempts: row.attempts,
    lastAttemptAt: row.last_attempt_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    bouncedAt: row.bounced_at,
    responseSubmittedAt: row.response_submitted_at,
    providerMessageId: row.provider_message_id,
    lastError: row.last_error,
    suppressedReason: row.suppressed_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function statusMatches(raw: string, selection: OutreachSelection, publishedValue: string, draftValue: string) {
  if (selection.status === "all") return true;
  return selection.status === "published" ? raw === publishedValue : raw === draftValue;
}

function verificationMatches(verified: boolean, selection: OutreachSelection) {
  if (selection.verification === "all") return true;
  return selection.verification === "verified" ? verified : !verified;
}

function regionMatches(region: string, selection: OutreachSelection) {
  return !selection.region || region === selection.region;
}

function publicDirectoryUrl(category: string, slug: string) {
  return SITE_URL + "/adresar/" + encodeURIComponent(category) + "/" + encodeURIComponent(slug);
}

function publicOrganizationUrl(slug: string) {
  return SITE_URL + "/organizacie/" + encodeURIComponent(slug);
}

async function loadDirectoryCandidates(database: D1Database, selection: OutreachSelection) {
  const rows = await database.prepare(
    "SELECT id, slug, name, category, status, city, region, source_data_json, verified " +
    "FROM directory_profiles ORDER BY id ASC LIMIT 1500",
  ).all<{
    id: number; slug: string; name: string; category: string; status: string; city: string;
    region: string; source_data_json: string; verified: number;
  }>();
  const output: OutreachEntityCandidate[] = [];
  for (const row of rows.results) {
    if (!statusMatches(row.status, selection, "published", "draft")) continue;
    if (!regionMatches(row.region, selection)) continue;
    const verified = Boolean(row.verified);
    if (!verificationMatches(verified, selection)) continue;
    for (const email of directoryOutreachEmailValues(row.source_data_json)) {
      output.push({
        entityType: "DIRECTORY_PROFILE",
        entityId: String(row.id),
        entityName: row.name,
        profileUrl: publicDirectoryUrl(row.category, row.slug),
        region: row.region,
        rawEmail: email,
        verified,
        publicSnapshot: {
          name: row.name,
          category: row.category,
          city: row.city,
          region: row.region,
        },
      });
    }
  }
  return output;
}

async function loadOrganizationCandidates(database: D1Database, selection: OutreachSelection) {
  const rows = await database.prepare(
    "SELECT id, slug, name, type, status, city, region, public_email, public_phone, website_url, last_verified_at " +
    "FROM help_organizations WHERE archived_at IS NULL ORDER BY id ASC LIMIT 1500",
  ).all<{
    id: number; slug: string; name: string; type: string; status: string; city: string; region: string;
    public_email: string | null; public_phone: string | null; website_url: string | null;
    last_verified_at: string | null;
  }>();
  const output: OutreachEntityCandidate[] = [];
  for (const row of rows.results) {
    if (!statusMatches(row.status, selection, "PUBLISHED", "DRAFT")) continue;
    if (!regionMatches(row.region, selection)) continue;
    const verified = Boolean(row.last_verified_at);
    if (!verificationMatches(verified, selection)) continue;
    for (const email of splitOutreachEmails(row.public_email)) {
      output.push({
        entityType: "HELP_ORGANIZATION",
        entityId: String(row.id),
        entityName: row.name,
        profileUrl: publicOrganizationUrl(row.slug),
        region: row.region,
        rawEmail: email,
        verified,
        publicSnapshot: {
          name: row.name,
          type: row.type,
          city: row.city,
          region: row.region,
          publicEmail: row.public_email,
          publicPhone: row.public_phone,
          websiteUrl: row.website_url,
        },
      });
    }
  }
  return output;
}

function limitCandidatesByEntity(candidates: OutreachEntityCandidate[], limit: number) {
  const allowed = new Set<string>();
  const output: OutreachEntityCandidate[] = [];
  for (const candidate of candidates) {
    const key = candidate.entityType + ":" + candidate.entityId;
    if (!allowed.has(key)) {
      if (allowed.size >= limit) continue;
      allowed.add(key);
    }
    output.push(candidate);
  }
  return output;
}

async function contactedEmailSet(database: D1Database) {
  const rows = await database.prepare(
    "SELECT DISTINCT normalized_email FROM outreach_recipients " +
    "WHERE send_state IN ('SENT','DELIVERED','BOUNCED')",
  ).all<{ normalized_email: string }>();
  return new Set(rows.results.map((row) => row.normalized_email));
}

async function suppressionEmailSet(database: D1Database) {
  const rows = await database.prepare(
    "SELECT normalized_email FROM outreach_suppressions",
  ).all<{ normalized_email: string }>();
  return new Set(rows.results.map((row) => row.normalized_email));
}

async function buildSelection(database: D1Database, selection: OutreachSelection) {
  const candidates: OutreachEntityCandidate[] = [];
  if (selection.entityTypes.includes("DIRECTORY_PROFILE")) {
    candidates.push(...await loadDirectoryCandidates(database, selection));
  }
  if (selection.entityTypes.includes("HELP_ORGANIZATION")) {
    candidates.push(...await loadOrganizationCandidates(database, selection));
  }
  // MANAGED_EVENT and HELP_CASE stay explicit entity types but currently have no structured
  // canonical contact-email field. OUTREACH-1 never parses free-form notes or invents contacts.
  const contacted = await contactedEmailSet(database);
  const withHistory = filterOutreachHistory(candidates, contacted, selection.contactHistory);
  const limited = limitCandidatesByEntity(withHistory, selection.limit);
  return buildOutreachDryRun(limited, await suppressionEmailSet(database));
}

export async function listOutreachCampaigns(database?: D1Database) {
  const db = runtimeDatabase(database);
  const rows = await db.prepare(
    "SELECT " + CAMPAIGN_COLUMNS + " FROM outreach_campaigns ORDER BY created_at DESC LIMIT 100",
  ).all<CampaignRow>();
  return rows.results.map(campaignFromRow);
}

export async function getOutreachCampaign(id: string, database?: D1Database) {
  const row = await runtimeDatabase(database).prepare(
    "SELECT " + CAMPAIGN_COLUMNS + " FROM outreach_campaigns WHERE id = ? LIMIT 1",
  ).bind(id).first<CampaignRow>();
  return row ? campaignFromRow(row) : null;
}

export async function createOutreachCampaign(
  payload: Record<string, unknown>,
  editorEmail: string,
  database?: D1Database,
) {
  const db = runtimeDatabase(database);
  const name = normalizePlainText(payload.name, { min: 3, max: 160, field: "Názov kampane" });
  const purpose = payload.purpose === "DATA_QUALITY" ? "DATA_QUALITY" : "PROFILE_VERIFICATION";
  const selection = parseOutreachSelection(payload.selection);
  const subject = typeof payload.subjectTemplate === "string" && payload.subjectTemplate.trim()
    ? normalizePlainText(payload.subjectTemplate, { min: 3, max: 240, field: "Predmet" })
    : DEFAULT_OUTREACH_SUBJECT;
  const body = typeof payload.bodyTemplate === "string" && payload.bodyTemplate.trim()
    ? normalizePlainText(payload.bodyTemplate, { min: 20, max: 20_000, field: "Text e-mailu" })
    : DEFAULT_OUTREACH_BODY;
  for (const requiredPlaceholder of ["{profiles}", "{verification_url}", "{unsubscribe_url}"]) {
    if (!body.includes(requiredPlaceholder)) {
      throw new Error("Text e-mailu musí obsahovať " + requiredPlaceholder + ".");
    }
  }
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.prepare(
    "INSERT INTO outreach_campaigns (" +
    "id,name,purpose,status,selection_json,subject_template,body_template,provider_key," +
    "created_at,updated_at,created_by,updated_by" +
    ") VALUES (?,?,?,'DRAFT',?,?,?,'',?,?,?,?)",
  ).bind(
    id, name, purpose, JSON.stringify(selection), subject, body,
    now, now, editorEmail, editorEmail,
  ).run();
  return getOutreachCampaign(id, db);
}

export async function previewOutreachCampaign(id: string, editorEmail: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const campaign = await getOutreachCampaign(id, db);
  if (!campaign) throw new Error("Kampaň sa nenašla.");
  if (campaign.status !== "DRAFT") throw new Error("Preview je možné obnoviť iba pri DRAFT kampani.");
  const summary = await buildSelection(db, campaign.selection);
  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE outreach_campaigns SET selected_entity_count=?,unique_recipient_count=?,deduplicated_count=?," +
    "suppressed_count=?,invalid_email_count=?,previewed_at=?,updated_at=?,updated_by=? WHERE id=? AND status='DRAFT'",
  ).bind(
    summary.selectedEntityCount, summary.uniqueRecipientCount, summary.deduplicatedCount,
    summary.suppressedCount, summary.invalidEmailCount, now, now, editorEmail, id,
  ).run();
  return {
    ...summary,
    samples: summary.recipients.slice(0, 3).map((recipient) => ({
      maskedEmail: maskOutreachEmail(recipient.recipientEmail),
      profileUrls: recipient.entities.map((entity) => entity.profileUrl),
      message: renderOutreachText({
        subjectTemplate: campaign.subjectTemplate,
        bodyTemplate: campaign.bodyTemplate,
        entities: recipient.entities,
        verificationUrl: SITE_URL + "/overenie-profilu/preview-token",
        unsubscribeUrl: SITE_URL + "/odhlasenie-osloveni/preview-token",
      }),
    })),
  };
}

async function runBatches(database: D1Database, statements: D1PreparedStatement[], chunkSize = 50) {
  for (let index = 0; index < statements.length; index += chunkSize) {
    await database.batch(statements.slice(index, index + chunkSize));
  }
}

export async function prepareOutreachCampaign(id: string, editorEmail: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const campaign = await getOutreachCampaign(id, db);
  if (!campaign) throw new Error("Kampaň sa nenašla.");
  if (campaign.status !== "DRAFT") throw new Error("Na odoslanie možno pripraviť iba DRAFT kampaň.");
  if (!campaign.previewedAt) throw new Error("Pred prípravou kampane je povinný Dry run / Preview.");

  const summary = await buildSelection(db, campaign.selection);
  const oldRecipients = await db.prepare(
    "SELECT id FROM outreach_recipients WHERE campaign_id=?",
  ).bind(id).all<{ id: string }>();
  if (oldRecipients.results.length) {
    await db.prepare(
      "DELETE FROM outreach_claim_tokens WHERE recipient_id IN (SELECT id FROM outreach_recipients WHERE campaign_id=?)",
    ).bind(id).run();
    await db.prepare(
      "DELETE FROM outreach_recipient_entities WHERE recipient_id IN (SELECT id FROM outreach_recipients WHERE campaign_id=?)",
    ).bind(id).run();
    await db.prepare("DELETE FROM outreach_recipients WHERE campaign_id=?").bind(id).run();
  }

  const now = new Date().toISOString();
  const statements: D1PreparedStatement[] = [];
  for (const recipient of summary.recipients) {
    const recipientId = crypto.randomUUID();
    statements.push(db.prepare(
      "INSERT INTO outreach_recipients (" +
      "id,campaign_id,recipient_email,normalized_email,send_state,attempts,created_at,updated_at" +
      ") VALUES (?,?,?,?,'QUEUED',0,?,?)",
    ).bind(recipientId, id, recipient.recipientEmail, recipient.normalizedEmail, now, now));
    for (const entity of recipient.entities) {
      statements.push(db.prepare(
        "INSERT INTO outreach_recipient_entities (" +
        "recipient_id,entity_type,entity_id,entity_name,profile_url,region,public_snapshot_json" +
        ") VALUES (?,?,?,?,?,?,?)",
      ).bind(
        recipientId, entity.entityType, entity.entityId, entity.entityName,
        entity.profileUrl, entity.region, JSON.stringify(entity.publicSnapshot),
      ));
    }
  }
  await runBatches(db, statements);

  const provider = getOutreachProviderStatus();
  await db.prepare(
    "UPDATE outreach_campaigns SET status='READY',provider_key=?,selected_entity_count=?," +
    "unique_recipient_count=?,deduplicated_count=?,suppressed_count=?,invalid_email_count=?," +
    "prepared_at=?,updated_at=?,updated_by=? WHERE id=? AND status='DRAFT'",
  ).bind(
    provider.providerKey, summary.selectedEntityCount, summary.uniqueRecipientCount,
    summary.deduplicatedCount, summary.suppressedCount, summary.invalidEmailCount,
    now, now, editorEmail, id,
  ).run();
  return getOutreachCampaign(id, db);
}

export async function listOutreachRecipients(campaignId: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const rows = await db.prepare(
    "SELECT " + RECIPIENT_COLUMNS + " FROM outreach_recipients WHERE campaign_id=? ORDER BY created_at,id",
  ).bind(campaignId).all<RecipientRow>();
  const entities = await db.prepare(
    "SELECT recipient_id,entity_type,entity_id,entity_name,profile_url,region,public_snapshot_json " +
    "FROM outreach_recipient_entities WHERE recipient_id IN " +
    "(SELECT id FROM outreach_recipients WHERE campaign_id=?) ORDER BY entity_name",
  ).bind(campaignId).all<RecipientEntityRow>();
  const byRecipient = new Map<string, RecipientEntityRow[]>();
  for (const entity of entities.results) {
    const current = byRecipient.get(entity.recipient_id) ?? [];
    current.push(entity);
    byRecipient.set(entity.recipient_id, current);
  }
  return rows.results.map((row) => ({
    ...recipientFromRow(row),
    entities: (byRecipient.get(row.id) ?? []).map((entity) => ({
      entityType: entity.entity_type,
      entityId: entity.entity_id,
      entityName: entity.entity_name,
      profileUrl: entity.profile_url,
      region: entity.region,
      publicSnapshot: safeJson<Record<string, unknown>>(entity.public_snapshot_json, {}),
    })),
  }));
}

async function recipientEntities(database: D1Database, recipientId: string) {
  const rows = await database.prepare(
    "SELECT recipient_id,entity_type,entity_id,entity_name,profile_url,region,public_snapshot_json " +
    "FROM outreach_recipient_entities WHERE recipient_id=? ORDER BY entity_name",
  ).bind(recipientId).all<RecipientEntityRow>();
  return rows.results;
}

async function issueRecipientToken(
  database: D1Database,
  recipientId: string,
  purpose: "VERIFY" | "UNSUBSCRIBE",
  ttlDays: number,
) {
  const issued = await createOutreachOpaqueToken();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000).toISOString();
  await database.prepare(
    "UPDATE outreach_claim_tokens SET revoked_at=? WHERE recipient_id=? AND purpose=? AND used_at IS NULL AND revoked_at IS NULL",
  ).bind(nowIso, recipientId, purpose).run();
  await database.prepare(
    "INSERT INTO outreach_claim_tokens (id,recipient_id,purpose,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)",
  ).bind(crypto.randomUUID(), recipientId, purpose, issued.tokenHash, expiresAt, nowIso).run();
  return issued.token;
}

export async function sendOutreachCampaignBatch(
  id: string,
  editorEmail: string,
  requestedLimit = 25,
  options: { database?: D1Database; bindings?: OutreachEmailBindings } = {},
) {
  const db = runtimeDatabase(options.database);
  const campaign = await getOutreachCampaign(id, db);
  if (!campaign) throw new Error("Kampaň sa nenašla.");
  if (campaign.status !== "READY" && campaign.status !== "SENDING") {
    throw new Error("Odosielať možno iba READY alebo SENDING kampaň.");
  }

  const provider = getOutreachEmailProvider(options.bindings);
  const providerStatus = getOutreachProviderStatus(options.bindings);
  if (!provider || !providerStatus.configured) {
    throw new Error("Outreach provider nie je nakonfigurovaný. Odosielanie zostalo fail-closed.");
  }

  const limit = Math.min(25, Math.max(1, Math.trunc(requestedLimit || 25)));
  const now = new Date().toISOString();
  if (campaign.status === "READY") {
    await db.prepare(
      "UPDATE outreach_campaigns SET status='SENDING',send_started_at=COALESCE(send_started_at,?),updated_at=?,updated_by=? " +
      "WHERE id=? AND status='READY'",
    ).bind(now, now, editorEmail, id).run();
  }

  const rows = await db.prepare(
    "SELECT " + RECIPIENT_COLUMNS + " FROM outreach_recipients " +
    "WHERE campaign_id=? AND ((send_state='QUEUED') OR (send_state='FAILED' AND attempts<3)) " +
    "ORDER BY created_at,id LIMIT ?",
  ).bind(id, limit).all<RecipientRow>();

  const summary = { attempted: 0, sent: 0, failed: 0, suppressed: 0, remaining: 0 };
  for (const row of rows.results) {
    const suppression = await db.prepare(
      "SELECT reason FROM outreach_suppressions WHERE normalized_email=? LIMIT 1",
    ).bind(row.normalized_email).first<{ reason: string }>();
    if (suppression) {
      await db.prepare(
        "UPDATE outreach_recipients SET send_state='SUPPRESSED',suppressed_reason=?,updated_at=? " +
        "WHERE id=? AND send_state IN ('QUEUED','FAILED')",
      ).bind(suppression.reason, new Date().toISOString(), row.id).run();
      summary.suppressed += 1;
      continue;
    }

    const claimAt = new Date().toISOString();
    const claimed = await db.prepare(
      "UPDATE outreach_recipients SET send_state='SENDING',attempts=attempts+1,last_attempt_at=?,last_error=NULL,updated_at=? " +
      "WHERE id=? AND ((send_state='QUEUED') OR (send_state='FAILED' AND attempts<3)) RETURNING " + RECIPIENT_COLUMNS,
    ).bind(claimAt, claimAt, row.id).first<RecipientRow>();
    if (!claimed) continue;
    summary.attempted += 1;

    try {
      const entities = await recipientEntities(db, row.id);
      if (!entities.length) throw new Error("recipient_has_no_entities");
      const verificationToken = await issueRecipientToken(db, row.id, "VERIFY", 30);
      const unsubscribeToken = await issueRecipientToken(db, row.id, "UNSUBSCRIBE", 90);
      const message = renderOutreachText({
        subjectTemplate: campaign.subjectTemplate,
        bodyTemplate: campaign.bodyTemplate,
        entities: entities.map((entity) => ({
          entityName: entity.entity_name,
          profileUrl: entity.profile_url,
        })),
        verificationUrl: SITE_URL + "/overenie-profilu/" + encodeURIComponent(verificationToken),
        unsubscribeUrl: SITE_URL + "/odhlasenie-osloveni/" + encodeURIComponent(unsubscribeToken),
      });
      const result = await provider.send({
        to: row.recipient_email,
        subject: message.subject,
        text: message.text,
        html: outreachTextToHtml(message.text),
        idempotencyKey: "outreach/" + id + "/" + row.id,
      });
      const completedAt = new Date().toISOString();
      if (result.ok) {
        await db.prepare(
          "UPDATE outreach_recipients SET send_state='SENT',sent_at=?,provider_message_id=?,last_error=NULL,updated_at=? " +
          "WHERE id=? AND send_state='SENDING'",
        ).bind(completedAt, result.providerMessageId, completedAt, row.id).run();
        summary.sent += 1;
      } else {
        await db.prepare(
          "UPDATE outreach_recipients SET send_state='FAILED',last_error=?,updated_at=? WHERE id=? AND send_state='SENDING'",
        ).bind(result.error.slice(0, 180), completedAt, row.id).run();
        summary.failed += 1;
      }
    } catch (error) {
      const failedAt = new Date().toISOString();
      const reason = (error instanceof Error ? error.message : "outreach_send_failed")
        .replace(/[^a-zA-Z0-9_.:-]/g, "_")
        .slice(0, 180);
      await db.prepare(
        "UPDATE outreach_recipients SET send_state='FAILED',last_error=?,updated_at=? WHERE id=? AND send_state='SENDING'",
      ).bind(reason, failedAt, row.id).run();
      summary.failed += 1;
    }
  }

  const remaining = await db.prepare(
    "SELECT COUNT(*) AS count FROM outreach_recipients WHERE campaign_id=? " +
    "AND (send_state='QUEUED' OR (send_state='FAILED' AND attempts<3) OR send_state='SENDING')",
  ).bind(id).first<{ count: number }>();
  summary.remaining = Number(remaining?.count ?? 0);
  if (summary.remaining === 0) {
    const sentAt = new Date().toISOString();
    await db.prepare(
      "UPDATE outreach_campaigns SET status='SENT',sent_at=COALESCE(sent_at,?),updated_at=?,updated_by=? " +
      "WHERE id=? AND status='SENDING'",
    ).bind(sentAt, sentAt, editorEmail, id).run();
  }
  return summary;
}

export async function transitionOutreachCampaign(
  id: string,
  action: "pause" | "resume" | "cancel" | "complete",
  editorEmail: string,
  database?: D1Database,
) {
  const db = runtimeDatabase(database);
  const campaign = await getOutreachCampaign(id, db);
  if (!campaign) throw new Error("Kampaň sa nenašla.");
  const next: Partial<Record<typeof action, OutreachCampaignStatus>> = {
    pause: "PAUSED",
    resume: "READY",
    cancel: "CANCELLED",
    complete: "COMPLETED",
  };
  const target = next[action];
  const allowed =
    (action === "pause" && (campaign.status === "READY" || campaign.status === "SENDING")) ||
    (action === "resume" && campaign.status === "PAUSED") ||
    (action === "cancel" && ["DRAFT", "READY", "SENDING", "PAUSED"].includes(campaign.status)) ||
    (action === "complete" && campaign.status === "SENT");
  if (!target || !allowed) throw new Error("Neplatná zmena stavu kampane.");
  const now = new Date().toISOString();
  await db.prepare(
    "UPDATE outreach_campaigns SET status=?,completed_at=CASE WHEN ?='COMPLETED' THEN ? ELSE completed_at END," +
    "updated_at=?,updated_by=? WHERE id=? AND status=?",
  ).bind(target, target, now, now, editorEmail, id, campaign.status).run();
  return getOutreachCampaign(id, db);
}

async function enforceOutreachTokenRateLimit(
  database: D1Database,
  token: string,
  purpose: "VERIFY" | "UNSUBSCRIBE",
) {
  const tokenHash = await hashOutreachToken(token);
  const result = await enforceRateLimit(
    createD1RateLimitStore(database),
    "outreach-token:" + purpose + ":" + tokenHash,
    12,
    60 * 60,
  );
  if (!result.allowed) throw new Error("Príliš veľa pokusov. Skúste to neskôr.");
}

async function lookupToken(database: D1Database, token: string, purpose: "VERIFY" | "UNSUBSCRIBE") {
  const tokenHash = await hashOutreachToken(token);
  const row = await database.prepare(
    "SELECT id,recipient_id,purpose,expires_at,used_at,revoked_at FROM outreach_claim_tokens " +
    "WHERE token_hash=? AND purpose=? LIMIT 1",
  ).bind(tokenHash, purpose).first<TokenRow>();
  if (!row || row.used_at || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) return null;
  return { row, tokenHash };
}

export async function getOutreachVerificationContext(token: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const found = await lookupToken(db, token, "VERIFY");
  if (!found) return null;
  const recipient = await db.prepare(
    "SELECT " + RECIPIENT_COLUMNS + " FROM outreach_recipients WHERE id=? LIMIT 1",
  ).bind(found.row.recipient_id).first<RecipientRow>();
  if (!recipient) return null;
  const entities = await recipientEntities(db, recipient.id);
  return {
    maskedEmail: maskOutreachEmail(recipient.recipient_email),
    expiresAt: found.row.expires_at,
    entities: entities.map((entity) => ({
      entityType: entity.entity_type,
      entityId: entity.entity_id,
      entityName: entity.entity_name,
      profileUrl: entity.profile_url,
      publicSnapshot: safeJson<Record<string, unknown>>(entity.public_snapshot_json, {}),
    })),
  };
}

export async function submitOutreachVerification(
  token: string,
  payload: Record<string, unknown>,
  database?: D1Database,
) {
  const db = runtimeDatabase(database);
  const found = await lookupToken(db, token, "VERIFY");
  if (!found) throw new Error("Overovací odkaz je neplatný alebo expirovaný.");
  await enforceOutreachTokenRateLimit(db, token, "VERIFY");
  const recipient = await db.prepare(
    "SELECT " + RECIPIENT_COLUMNS + " FROM outreach_recipients WHERE id=? LIMIT 1",
  ).bind(found.row.recipient_id).first<RecipientRow>();
  if (!recipient) throw new Error("Overovací kontext sa nenašiel.");
  const entities = await recipientEntities(db, recipient.id);
  const allowed = new Map(entities.map((entity) => [entity.entity_type + ":" + entity.entity_id, entity]));
  const inputChanges = Array.isArray(payload.changes) ? payload.changes.slice(0, 20) : [];
  const changes: Array<{ entity: RecipientEntityRow; note: string }> = [];
  for (const item of inputChanges) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const record = item as Record<string, unknown>;
    const entityType = typeof record.entityType === "string" ? record.entityType : "";
    const entityId = typeof record.entityId === "string" ? record.entityId : "";
    const entity = allowed.get(entityType + ":" + entityId);
    const rawNote = typeof record.note === "string" ? record.note : "";
    if (!entity || !rawNote.trim()) continue;
    changes.push({
      entity,
      note: normalizePlainText(rawNote, { min: 5, max: 5000, field: "Navrhovaná zmena" }),
    });
  }
  if (!changes.length) throw new Error("Doplň aspoň jednu navrhovanú opravu alebo potvrdenie údajov.");

  const now = new Date().toISOString();
  const claimed = await db.prepare(
    "UPDATE outreach_claim_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? " +
    "RETURNING id",
  ).bind(now, found.row.id, now).first<{ id: string }>();
  if (!claimed) throw new Error("Overovací odkaz už bol použitý alebo expiroval.");

  const statements: D1PreparedStatement[] = changes.map(({ entity, note }) => {
    const resourceType = entity.entity_type === "DIRECTORY_PROFILE"
      ? "DIRECTORY_PROFILE_CHANGE"
      : entity.entity_type === "HELP_ORGANIZATION"
        ? "HELP_ORGANIZATION_CHANGE"
        : entity.entity_type + "_CHANGE";
    return db.prepare(
      "INSERT INTO moderation_submissions (" +
      "id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,proposed_patch_json," +
      "risk_flags_json,created_at,updated_at" +
      ") VALUES (?,?,?,'UPDATE','SUBMITTED','OUTREACH_RECIPIENT',?,?,'[]',?,?)",
    ).bind(
      crypto.randomUUID(),
      resourceType,
      entity.entity_id,
      recipient.id,
      JSON.stringify({
        source: "OUTREACH-1",
        outreach: {
          campaignId: recipient.campaign_id,
          recipientId: recipient.id,
          profileUrl: entity.profile_url,
          entityName: entity.entity_name,
        },
        requestedChanges: note,
      }),
      now,
      now,
    );
  });
  statements.push(db.prepare(
    "UPDATE outreach_recipients SET response_submitted_at=?,updated_at=? WHERE id=?",
  ).bind(now, now, recipient.id));
  await db.batch(statements);
  return { submitted: changes.length };
}

export async function getOutreachUnsubscribeContext(token: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const found = await lookupToken(db, token, "UNSUBSCRIBE");
  if (!found) return null;
  const recipient = await db.prepare(
    "SELECT recipient_email FROM outreach_recipients WHERE id=? LIMIT 1",
  ).bind(found.row.recipient_id).first<{ recipient_email: string }>();
  return recipient ? {
    maskedEmail: maskOutreachEmail(recipient.recipient_email),
    expiresAt: found.row.expires_at,
  } : null;
}

export async function submitOutreachUnsubscribe(token: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const found = await lookupToken(db, token, "UNSUBSCRIBE");
  if (!found) throw new Error("Odhlasovací odkaz je neplatný alebo expirovaný.");
  await enforceOutreachTokenRateLimit(db, token, "UNSUBSCRIBE");
  const recipient = await db.prepare(
    "SELECT " + RECIPIENT_COLUMNS + " FROM outreach_recipients WHERE id=? LIMIT 1",
  ).bind(found.row.recipient_id).first<RecipientRow>();
  if (!recipient) throw new Error("Príjemca sa nenašiel.");
  const now = new Date().toISOString();
  const claimed = await db.prepare(
    "UPDATE outreach_claim_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? " +
    "RETURNING id",
  ).bind(now, found.row.id, now).first<{ id: string }>();
  if (!claimed) throw new Error("Odhlasovací odkaz už bol použitý alebo expiroval.");

  await db.batch([
    db.prepare(
      "INSERT INTO outreach_suppressions (normalized_email,reason,source,created_at) VALUES (?,'UNSUBSCRIBE','recipient_link',?) " +
      "ON CONFLICT(normalized_email) DO UPDATE SET reason='UNSUBSCRIBE',source='recipient_link',created_at=excluded.created_at",
    ).bind(recipient.normalized_email, now),
    db.prepare(
      "UPDATE outreach_recipients SET send_state='SUPPRESSED',suppressed_reason='UNSUBSCRIBE',updated_at=? " +
      "WHERE normalized_email=? AND send_state IN ('QUEUED','FAILED')",
    ).bind(now, recipient.normalized_email),
  ]);
  return { suppressed: true };
}

export async function listOutreachResponses(campaignId: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const rows = await db.prepare(
    "SELECT id,resource_type,subject_id,status,proposed_patch_json,created_at,updated_at,reviewed_at,reviewed_by " +
    "FROM moderation_submissions WHERE submitter_type='OUTREACH_RECIPIENT' " +
    "AND json_extract(proposed_patch_json,'$.outreach.campaignId')=? ORDER BY created_at DESC LIMIT 200",
  ).bind(campaignId).all<Record<string, unknown>>();
  return rows.results.map((row) => ({
    id: String(row.id),
    resourceType: String(row.resource_type),
    subjectId: row.subject_id ? String(row.subject_id) : null,
    status: String(row.status),
    proposed: safeJson<Record<string, unknown>>(String(row.proposed_patch_json ?? "{}"), {}),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    reviewedAt: row.reviewed_at ? String(row.reviewed_at) : null,
    reviewedBy: row.reviewed_by ? String(row.reviewed_by) : null,
  }));
}

export async function reviewOutreachResponse(
  id: string,
  status: "APPROVED" | "REJECTED",
  reviewerEmail: string,
  database?: D1Database,
) {
  const db = runtimeDatabase(database);
  const now = new Date().toISOString();
  const row = await db.prepare(
    "UPDATE moderation_submissions SET status=?,reviewed_at=?,reviewed_by=?,updated_at=? " +
    "WHERE id=? AND submitter_type='OUTREACH_RECIPIENT' AND status='SUBMITTED' " +
    "RETURNING id,status,reviewed_at,reviewed_by",
  ).bind(status, now, reviewerEmail, now, id).first<Record<string, unknown>>();
  if (!row) throw new Error("Odpoveď sa nenašla alebo už bola posúdená.");
  // Deliberately no canonical UPDATE here. Approval means editorial acceptance for manual transfer.
  return row;
}

export async function getOutreachAdminData(campaignId?: string, database?: D1Database) {
  const db = runtimeDatabase(database);
  const campaigns = await listOutreachCampaigns(db);
  const provider = getOutreachProviderStatus();
  if (!campaignId) return { campaigns, provider, campaign: null, recipients: [], responses: [] };
  const campaign = campaigns.find((item) => item.id === campaignId) ?? await getOutreachCampaign(campaignId, db);
  if (!campaign) return { campaigns, provider, campaign: null, recipients: [], responses: [] };
  return {
    campaigns,
    provider,
    campaign,
    recipients: await listOutreachRecipients(campaignId, db),
    responses: await listOutreachResponses(campaignId, db),
  };
}

export async function processOutreachDeliveryEvent(
  input: {
    providerEventId: string;
    providerKey: string;
    eventType: string;
    rawBody: string;
    payload: Record<string, unknown>;
  },
  database?: D1Database,
) {
  const db = runtimeDatabase(database);
  if (input.eventType === "email.opened" || input.eventType === "email.clicked") {
    return { status: "ignored_engagement_tracking" as const };
  }
  const supported = new Set([
    "email.delivered",
    "email.bounced",
    "email.delivery_delayed",
    "email.failed",
    "email.complained",
  ]);
  if (!supported.has(input.eventType)) return { status: "ignored_event" as const };

  const data = input.payload.data && typeof input.payload.data === "object" && !Array.isArray(input.payload.data)
    ? input.payload.data as Record<string, unknown>
    : {};
  const providerMessageId = typeof data.email_id === "string"
    ? data.email_id
    : typeof data.id === "string"
      ? data.id
      : "";
  const occurredAt = typeof input.payload.created_at === "string" ? input.payload.created_at : null;
  const receivedAt = new Date().toISOString();
  const payloadHash = await sha256Base64Url(input.rawBody);

  const inserted = await db.prepare(
    "INSERT INTO outreach_delivery_events (" +
    "provider_event_id,provider_key,provider_message_id,event_type,payload_hash,occurred_at,received_at" +
    ") VALUES (?,?,?,?,?,?,?) ON CONFLICT(provider_event_id) DO NOTHING RETURNING provider_event_id",
  ).bind(
    input.providerEventId, input.providerKey, providerMessageId || null, input.eventType,
    payloadHash, occurredAt, receivedAt,
  ).first<{ provider_event_id: string }>();
  if (!inserted) return { status: "duplicate" as const };
  if (!providerMessageId) return { status: "recorded_without_message" as const };

  const recipient = await db.prepare(
    "SELECT " + RECIPIENT_COLUMNS + " FROM outreach_recipients WHERE provider_message_id=? LIMIT 1",
  ).bind(providerMessageId).first<RecipientRow>();
  if (!recipient) return { status: "recipient_not_found" as const };

  if (input.eventType === "email.delivered") {
    await db.prepare(
      "UPDATE outreach_recipients SET send_state='DELIVERED',delivered_at=?,updated_at=? WHERE id=?",
    ).bind(occurredAt ?? receivedAt, receivedAt, recipient.id).run();
    return { status: "delivered" as const };
  }

  if (input.eventType === "email.complained") {
    await db.batch([
      db.prepare(
        "INSERT INTO outreach_suppressions (normalized_email,reason,source,created_at) VALUES (?,'COMPLAINT','provider_webhook',?) " +
        "ON CONFLICT(normalized_email) DO UPDATE SET reason='COMPLAINT',source='provider_webhook',created_at=excluded.created_at",
      ).bind(recipient.normalized_email, receivedAt),
      db.prepare(
        "UPDATE outreach_recipients SET send_state='SUPPRESSED',suppressed_reason='COMPLAINT',updated_at=? WHERE id=?",
      ).bind(receivedAt, recipient.id),
    ]);
    return { status: "complaint_suppressed" as const };
  }

  if (input.eventType === "email.bounced") {
    const bounce = data.bounce && typeof data.bounce === "object" && !Array.isArray(data.bounce)
      ? data.bounce as Record<string, unknown>
      : {};
    const bounceType = typeof bounce.type === "string" ? bounce.type.toLowerCase() : "";
    const hard = bounceType === "permanent" || bounceType === "hard";
    if (hard) {
      await db.batch([
        db.prepare(
          "INSERT INTO outreach_suppressions (normalized_email,reason,source,created_at) VALUES (?,'HARD_BOUNCE','provider_webhook',?) " +
          "ON CONFLICT(normalized_email) DO UPDATE SET reason='HARD_BOUNCE',source='provider_webhook',created_at=excluded.created_at",
        ).bind(recipient.normalized_email, receivedAt),
        db.prepare(
          "UPDATE outreach_recipients SET send_state='BOUNCED',bounced_at=?,suppressed_reason='HARD_BOUNCE',updated_at=? WHERE id=?",
        ).bind(occurredAt ?? receivedAt, receivedAt, recipient.id),
      ]);
      return { status: "hard_bounce_suppressed" as const };
    }
    await db.prepare(
      "UPDATE outreach_recipients SET send_state='FAILED',bounced_at=?,last_error='soft_bounce',updated_at=? WHERE id=?",
    ).bind(occurredAt ?? receivedAt, receivedAt, recipient.id).run();
    return { status: "soft_bounce" as const };
  }

  if (input.eventType === "email.failed") {
    await db.prepare(
      "UPDATE outreach_recipients SET send_state='FAILED',last_error='provider_delivery_failed',updated_at=? WHERE id=?",
    ).bind(receivedAt, recipient.id).run();
    return { status: "failed" as const };
  }

  await db.prepare(
    "UPDATE outreach_recipients SET last_error='provider_delivery_delayed',updated_at=? WHERE id=?",
  ).bind(receivedAt, recipient.id).run();
  return { status: "delivery_delayed" as const };
}
