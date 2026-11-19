import { env } from "cloudflare:workers";
import { enqueueAdminNotificationEvent } from "@/lib/admin-notifications";
import { getPartnerDatabase } from "@/lib/partner-auth-store";
import { enforcePartnerNewProfileRateLimit } from "@/lib/partner-security";
import { applyAtomicModerationTransition, canTransitionModerationSubmission, isFoundationSubmissionStatus, type FoundationSubmissionStatus } from "@/lib/moderation-transition";

export const partnerHelpCreateTypes = ["ADOPTION_DOG", "LOST_FOUND_DOG", "HELP_CASE"] as const;
export type PartnerHelpCreateType = (typeof partnerHelpCreateTypes)[number];
export const partnerHelpCaseCategories = ["docasna-opatera", "zbierky", "dobrovolnictvo", "urgentne-pripady"] as const;

export class PartnerHelpCreateError extends Error {
  constructor(message: string, readonly status = 400, readonly code = "INVALID_HELP_SUBMISSION") {
    super(message);
    this.name = "PartnerHelpCreateError";
  }
}
const statuses = ["SUBMITTED", "PENDING_REVIEW", "QUARANTINED"];
const allowed: Record<PartnerHelpCreateType, readonly string[]> = {
  ADOPTION_DOG: ["name", "sex", "size", "approximateAgeMonths", "breedName", "region", "district", "city", "organizationName", "shortDescription", "description"],
  LOST_FOUND_DOG: ["type", "dogName", "sex", "breed", "color", "size", "eventDate", "region", "district", "city", "locationDescription", "description"],
  HELP_CASE: ["title", "category", "excerpt", "description", "organization", "city", "region", "actionLabel", "contactNote"],
};
function db(input?: D1Database) {
  return getPartnerDatabase(input ?? (env as unknown as { DB?: D1Database }).DB);
}
function valueText(raw: Record<string, unknown>, key: string, max = 1000) {
  const value = raw[key] ?? "";
  if (typeof value !== "string") throw new PartnerHelpCreateError(`Pole ${key} musí byť text.`);
  const clean = value.trim();
  if (clean.length > max) throw new PartnerHelpCreateError(`Pole ${key} je príliš dlhé (max. ${max} znakov).`);
  return clean;
}
function required(value: string, label: string, min = 1) {
  if (value.length < min) throw new PartnerHelpCreateError(`Vyplňte ${label} (aspoň ${min} znakov).`);
  return value;
}
function choice(value: string, valid: readonly string[], label: string) {
  if (!valid.includes(value)) throw new PartnerHelpCreateError(`Vyberte platný údaj: ${label}.`);
  return value;
}
function validDate(value: string) {
  const parsed = new Date(`${value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new PartnerHelpCreateError("Zadajte platný dátum udalosti.");
  }
  return value;
}
export function isPartnerHelpCreateType(value: unknown): value is PartnerHelpCreateType {
  return typeof value === "string" && (partnerHelpCreateTypes as readonly string[]).includes(value);
}
export function normalizePartnerHelpCreate(type: unknown, payload: unknown) {
  if (!isPartnerHelpCreateType(type)) throw new PartnerHelpCreateError("Neplatný typ Pomoci psom.");
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new PartnerHelpCreateError("Údaje návrhu musia byť objekt.");
  const raw = payload as Record<string, unknown>;
  const illegal = Object.keys(raw).find((key) => !allowed[type].includes(key));
  if (illegal) throw new PartnerHelpCreateError(`Pole ${illegal} nie je možné nastaviť. Publikáciu, SEO a vlastníctvo spravuje administrátor.`);
  if (type === "ADOPTION_DOG") {
    const ageRaw = raw.approximateAgeMonths;
    const age = ageRaw === "" || ageRaw === null || ageRaw === undefined ? null : Number(ageRaw);
    if (age !== null && (!Number.isSafeInteger(age) || age < 0 || age > 360)) throw new PartnerHelpCreateError("Vek musí byť od 0 do 360 mesiacov.");
    return {
      name: required(valueText(raw, "name", 160), "meno psa"),
      sex: choice(valueText(raw, "sex", 20) || "UNKNOWN", ["MALE", "FEMALE", "UNKNOWN"], "pohlavie"),
      size: choice(valueText(raw, "size", 20) || "UNKNOWN", ["SMALL", "MEDIUM", "LARGE", "GIANT", "UNKNOWN"], "veľkosť"),
      approximateAgeMonths: age,
      breedName: valueText(raw, "breedName", 160),
      region: valueText(raw, "region", 120),
      district: valueText(raw, "district", 120),
      city: required(valueText(raw, "city", 120), "mesto"),
      organizationName: valueText(raw, "organizationName", 160),
      shortDescription: required(valueText(raw, "shortDescription", 700), "krátky opis", 10),
      description: required(valueText(raw, "description", 10000), "opis psa", 20),
    };
  }
  if (type === "LOST_FOUND_DOG") return {
    type: choice(valueText(raw, "type", 10), ["LOST", "FOUND"], "stratený / nájdený"),
    dogName: valueText(raw, "dogName", 160),
    sex: choice(valueText(raw, "sex", 20) || "UNKNOWN", ["MALE", "FEMALE", "UNKNOWN"], "pohlavie"),
    breed: valueText(raw, "breed", 160),
    color: valueText(raw, "color", 160),
    size: choice(valueText(raw, "size", 20) || "UNKNOWN", ["SMALL", "MEDIUM", "LARGE", "UNKNOWN"], "veľkosť"),
    eventDate: validDate(valueText(raw, "eventDate", 10)),
    region: valueText(raw, "region", 120),
    district: valueText(raw, "district", 120),
    city: required(valueText(raw, "city", 120), "mesto"),
    locationDescription: required(valueText(raw, "locationDescription", 500), "miesto udalosti", 5),
    description: required(valueText(raw, "description", 10000), "opis udalosti", 20),
  };
  return {
    title: required(valueText(raw, "title", 180), "názov"),
    category: choice(valueText(raw, "category", 32), partnerHelpCaseCategories, "kategóriu"),
    excerpt: required(valueText(raw, "excerpt", 700), "krátky opis", 10),
    description: required(valueText(raw, "description", 10000), "opis pomoci", 20),
    organization: valueText(raw, "organization", 180),
    city: required(valueText(raw, "city", 120), "mesto"),
    region: valueText(raw, "region", 120),
    actionLabel: required(valueText(raw, "actionLabel", 120), "text výzvy"),
    contactNote: valueText(raw, "contactNote", 1000),
  };
}
function summary(type: PartnerHelpCreateType, data: Record<string, unknown>) {
  if (type === "ADOPTION_DOG") return String(data.name);
  if (type === "LOST_FOUND_DOG") return `${data.type === "LOST" ? "Stratený" : "Nájdený"} pes: ${data.dogName || data.city}`;
  return String(data.title);
}
function statusLabel(status: string) {
  if (statuses.includes(status)) return "Čaká na kontrolu";
  if (status === "APPROVED") return "Schválené";
  if (status === "REJECTED") return "Zamietnuté";
  return "Stiahnuté";
}
type SubmissionRow = { id: string; resourceType: PartnerHelpCreateType; status: string; payload: string; riskFlags: string; createdAt: string; rejectionReasonCode: string | null; accountId: string };
function hydrate(row: SubmissionRow) {
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(row.payload) as Record<string, unknown>; } catch { /* Historic corrupt JSON must not crash the queue. */ }
  let risks: string[] = [];
  try { const parsed: unknown = JSON.parse(row.riskFlags); if (Array.isArray(parsed)) risks = parsed.filter((x): x is string => typeof x === "string"); } catch {}
  return { id: row.id, resourceType: row.resourceType, accountId: row.accountId, title: summary(row.resourceType, payload), payload, status: row.status, statusLabel: statusLabel(row.status), risks, createdAt: row.createdAt, rejectionReasonCode: row.rejectionReasonCode, canWithdraw: statuses.includes(row.status) };
}
export async function listPartnerHelpCreateSubmissions(accountId: string, database?: D1Database) {
  const result = await db(database).prepare(`
    SELECT id,resource_type resourceType,status,proposed_patch_json payload,risk_flags_json riskFlags,
      created_at createdAt,rejection_reason_code rejectionReasonCode,submitter_ref accountId
    FROM moderation_submissions
    WHERE operation='CREATE' AND submitter_type='PARTNER_ACCOUNT' AND submitter_ref=?1
      AND resource_type IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE')
    ORDER BY created_at DESC,id DESC LIMIT 200
  `).bind(accountId).all<SubmissionRow>();
  return result.results.map(hydrate);
}
export async function listPartnerHelpCreateAdmin(database?: D1Database) {
  const result = await db(database).prepare(`
    SELECT id,resource_type resourceType,status,proposed_patch_json payload,risk_flags_json riskFlags,
      created_at createdAt,rejection_reason_code rejectionReasonCode,submitter_ref accountId
    FROM moderation_submissions
    WHERE operation='CREATE' AND submitter_type='PARTNER_ACCOUNT'
      AND resource_type IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE')
    ORDER BY CASE WHEN status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') THEN 0 ELSE 1 END,
      created_at DESC,id DESC LIMIT 200
  `).all<SubmissionRow>();
  return result.results.map(hydrate);
}
async function canonicalDuplicate(type: PartnerHelpCreateType, p: Record<string, unknown>, database: D1Database) {
  if (type === "ADOPTION_DOG") {
    const row = await database.prepare("SELECT id FROM adoption_dogs WHERE name=?1 COLLATE NOCASE AND city=?2 COLLATE NOCASE AND organization_name=?3 COLLATE NOCASE AND status<>'ARCHIVED' LIMIT 1")
      .bind(p.name, p.city, p.organizationName).first();
    return Boolean(row);
  }
  if (type === "LOST_FOUND_DOG") {
    const row = await database.prepare("SELECT id FROM lost_found_dog_reports WHERE type=?1 AND event_date=?2 AND city=?3 COLLATE NOCASE AND COALESCE(dog_name,'')=?4 COLLATE NOCASE AND status NOT IN ('ARCHIVED','REJECTED') LIMIT 1")
      .bind(p.type, p.eventDate, p.city, p.dogName).first();
    return Boolean(row);
  }
  const row = await database.prepare("SELECT id FROM help_cases WHERE title=?1 COLLATE NOCASE AND category=?2 AND city=?3 COLLATE NOCASE AND status<>'archived' LIMIT 1")
    .bind(p.title, p.category, p.city).first();
  return Boolean(row);
}
export async function submitPartnerHelpCreate(input: { accountId: string; resourceType: unknown; payload: unknown; database?: D1Database; hashKey?: string; now?: Date }) {
  const database = db(input.database);
  if (!isPartnerHelpCreateType(input.resourceType)) throw new PartnerHelpCreateError("Neplatný typ návrhu.");
  const resourceType = input.resourceType;
  const payload = normalizePartnerHelpCreate(resourceType, input.payload);
  const account = await database.prepare("SELECT status FROM partner_accounts WHERE id=?1 LIMIT 1").bind(input.accountId).first<{status: string}>();
  if (account?.status !== "ACTIVE") throw new PartnerHelpCreateError("Účet musí byť aktívny a overený.", 403);
  const proposedJson = JSON.stringify(payload);
  const existing = await database.prepare(`
    SELECT id FROM moderation_submissions WHERE submitter_type='PARTNER_ACCOUNT' AND submitter_ref=?1
      AND resource_type=?2 AND operation='CREATE' AND proposed_patch_json=?3
      AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED') LIMIT 1
  `).bind(input.accountId, resourceType, proposedJson).first();
  if (existing) throw new PartnerHelpCreateError("Rovnaký návrh už čaká na kontrolu.", 409, "ACTIVE_DUPLICATE_SUBMISSION");
  const key = input.hashKey ?? (env as unknown as { PII_HASH_KEY?: string }).PII_HASH_KEY?.trim();
  if (!key) throw new PartnerHelpCreateError("Bezpečnostná konfigurácia nie je dostupná.", 503);
  const fingerprintBytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(resourceType + ":" + proposedJson)));
  const fingerprint = Array.from(fingerprintBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  await enforcePartnerNewProfileRateLimit({ database, accountId: input.accountId, identityFingerprint: fingerprint, hashKey: key, now: input.now });
  const riskFlags = await canonicalDuplicate(resourceType, payload, database) ? ["POSSIBLE_DUPLICATE"] : [];
  const now = input.now ?? new Date(), nowIso = now.toISOString(), id = crypto.randomUUID();
  const results = await database.batch([
    database.prepare(`INSERT INTO moderation_submissions
      (id,resource_type,subject_id,operation,status,submitter_type,submitter_ref,proposed_patch_json,risk_flags_json,created_at,updated_at)
      SELECT ?1,?2,NULL,'CREATE','SUBMITTED','PARTNER_ACCOUNT',?3,?4,?5,?6,?6
      WHERE NOT EXISTS (
        SELECT 1 FROM moderation_submissions
        WHERE submitter_type='PARTNER_ACCOUNT' AND submitter_ref=?3
          AND resource_type=?2 AND operation='CREATE' AND proposed_patch_json=?4
          AND status IN ('SUBMITTED','PENDING_REVIEW','QUARANTINED')
      )`)
      .bind(id, resourceType, input.accountId, proposedJson, JSON.stringify(riskFlags), nowIso),
    database.prepare(`INSERT INTO moderation_events
      (id,submission_id,resource_type,subject_id,action,actor_type,actor_ref,from_status,to_status,changed_fields_json,created_at)
      SELECT ?1,?2,?3,NULL,'SUBMISSION_CREATED','PARTNER',?4,NULL,'SUBMITTED',?5,?6
      WHERE EXISTS (SELECT 1 FROM moderation_submissions WHERE id=?2)`)
      .bind(crypto.randomUUID(), id, resourceType, input.accountId, JSON.stringify(Object.keys(payload)), nowIso),
    database.prepare(`INSERT INTO partner_audit_events
      (id,actor_type,actor_ref,action,target_type,target_id,metadata_json,created_at)
      SELECT ?1,'PARTNER',?2,'NEW_PROFILE_SUBMITTED','MODERATION_SUBMISSION',?3,?4,?5
      WHERE EXISTS (SELECT 1 FROM moderation_submissions WHERE id=?3)`)
      .bind(crypto.randomUUID(), `partner:${input.accountId}`, id, JSON.stringify({ resourceType, source: "partner_help_create" }), nowIso),
  ]);
  // Guard the race after the preliminary lookup: only one concurrent active proposal is inserted.
  if (Number(results[0]?.meta?.changes ?? 0) !== 1) {
    throw new PartnerHelpCreateError("Rovnaký návrh už čaká na kontrolu.", 409, "ACTIVE_DUPLICATE_SUBMISSION");
  }
  try {
    await enqueueAdminNotificationEvent(database, {
      eventType: "partner_new_help_submitted",
      sourceType: "PARTNER_NEW_PROFILE_REVIEW",
      resourceType: "partner_new_help",
      resourceRef: id,
      actorType: "PARTNER",
      actorRef: `partner:${input.accountId}`,
      targetUrl: "/admin/partners/help-submissions",
      title: "Partner navrhol nový záznam Pomoci psom",
      body: summary(resourceType, payload) + " čaká na kontrolu.",
      tag: `partner-new-help-${id}`,
      dedupeKey: `partner-new-help/${id}`,
    }, now);
  } catch (error) {
    console.error(JSON.stringify({ event: "partner_help_admin_push_enqueue", submissionId: id, error: error instanceof Error ? error.message : "unknown" }));
  }
  return { id, resourceType, title: summary(resourceType, payload), status: "SUBMITTED" as const, createdAt: nowIso, riskFlags };
}
export async function withdrawPartnerHelpCreate(input: { accountId: string; id: string; database?: D1Database; now?: Date }) {
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) throw new PartnerHelpCreateError("Neplatný návrh.", 404);
  const database = db(input.database);
  const row = await database.prepare(`
    SELECT status FROM moderation_submissions
    WHERE id=?1 AND submitter_type='PARTNER_ACCOUNT' AND submitter_ref=?2
      AND resource_type IN ('ADOPTION_DOG','LOST_FOUND_DOG','HELP_CASE') AND operation='CREATE'
    LIMIT 1
  `).bind(input.id, input.accountId).first<{status: string}>();
  if (!row) throw new PartnerHelpCreateError("Návrh sa nenašiel.", 404);
  if (!isFoundationSubmissionStatus(row.status) || !canTransitionModerationSubmission(row.status, "WITHDRAWN")) {
    throw new PartnerHelpCreateError("Tento návrh už nemožno stiahnuť.", 409);
  }
  const nowIso = (input.now ?? new Date()).toISOString();
  await applyAtomicModerationTransition(database, {
    id: input.id, expectedStatus: row.status as FoundationSubmissionStatus,
    toStatus: "WITHDRAWN", actorType: "PARTNER", actorRef: `partner:${input.accountId}`,
    eventId: crypto.randomUUID(), changedFieldsJson: JSON.stringify(["status"]), now: nowIso,
  });
  return { id: input.id, status: "WITHDRAWN" as const };
}
