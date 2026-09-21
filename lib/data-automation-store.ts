import { env } from "cloudflare:workers";
import {
  automationFindingPriority,
  automationReviewEffect,
  canonicalizeSourceUrl,
  nextAutomationCheckAt,
  shouldReopenSuppressedFinding,
  type AutomationDiff,
  type AutomationFindingType,
  type AutomationPriority,
  type AutomationReviewAction,
  type AutomationReviewStatus,
  type AutomationSource,
  type AutomationSourceConfig,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import { selectSafeAutomationMatch, type AutomationMatchCandidate } from "./data-automation-matching.ts";

export type AutomationD1Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

type SourceRow = {
  id: number;
  source_key: string;
  label: string;
  entity_type: AutomationSource["entityType"];
  connector_type: AutomationSource["connectorType"];
  source_url: string | null;
  config_json: string;
  enabled: number;
  cadence_minutes: number;
  throttle_ms: number;
  timeout_ms: number;
  retry_max_attempts: number;
  retry_backoff_ms: number;
  max_records_per_run: number;
  next_check_at: string | null;
  review_status: "PENDING" | "APPROVED" | "REJECTED";
};

type FindingRow = {
  id: number;
  source_id: number;
  observation_id: number | null;
  entity_type: AutomationSource["entityType"];
  finding_type: AutomationFindingType;
  canonical_entity_id: number | null;
  canonical_entity_key: string | null;
  match_quality: string;
  source_url: string | null;
  source_timestamp: string | null;
  reason: string;
  before_json: string;
  proposed_json: string;
  diff_json: string;
  payload_hash: string;
  fingerprint: string;
  priority: AutomationPriority;
  review_status: AutomationReviewStatus;
  reviewer_decision: string | null;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  suppressed_until: string | null;
  first_detected_at: string;
  last_detected_at: string;
};

export type AutomationFindingDetail = {
  id: number;
  sourceId: number;
  observationId: number | null;
  sourceKey: string;
  sourceLabel: string;
  entityType: AutomationSource["entityType"];
  findingType: AutomationFindingType;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  matchQuality: string;
  sourceUrl: string | null;
  sourceTimestamp: string | null;
  reason: string;
  before: Record<string, unknown>;
  proposed: Record<string, unknown>;
  diff: AutomationDiff;
  payloadHash: string;
  fingerprint: string;
  priority: AutomationPriority;
  reviewStatus: AutomationReviewStatus;
  reviewerDecision: string | null;
  reviewerNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  suppressedUntil: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

function getDatabase(database?: AutomationD1Database) {
  if (database?.prepare) return database;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Data automation nemá pripojenú databázu.");
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function mapSource(row: SourceRow): AutomationSource {
  return {
    id: Number(row.id),
    sourceKey: row.source_key,
    label: row.label,
    entityType: row.entity_type,
    connectorType: row.connector_type,
    sourceUrl: canonicalizeSourceUrl(row.source_url),
    config: parseJson<AutomationSourceConfig>(row.config_json, {}),
    enabled: Boolean(row.enabled),
    cadenceMinutes: Number(row.cadence_minutes),
    throttleMs: Number(row.throttle_ms),
    timeoutMs: Number(row.timeout_ms),
    retryMaxAttempts: Number(row.retry_max_attempts),
    retryBackoffMs: Number(row.retry_backoff_ms),
    maxRecordsPerRun: Number(row.max_records_per_run),
    nextCheckAt: row.next_check_at,
    reviewStatus: row.review_status,
  };
}

export async function listDueAutomationSources(
  database?: AutomationD1Database,
  now = new Date(),
  limit = 8,
) {
  const db = getDatabase(database);
  const result = await db.prepare(`SELECT id,source_key,label,entity_type,connector_type,source_url,config_json,enabled,
    cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,next_check_at,review_status
    FROM automation_sources
    WHERE enabled = 1 AND review_status = 'APPROVED' AND (next_check_at IS NULL OR next_check_at <= ?)
    ORDER BY COALESCE(next_check_at, created_at) ASC, id ASC
    LIMIT ?`).bind(now.toISOString(), Math.max(1, Math.min(20, limit))).all<SourceRow>();
  return result.results.map(mapSource);
}

export async function getAutomationSource(id: number, database?: AutomationD1Database) {
  const db = getDatabase(database);
  const row = await db.prepare(`SELECT id,source_key,label,entity_type,connector_type,source_url,config_json,enabled,
    cadence_minutes,throttle_ms,timeout_ms,retry_max_attempts,retry_backoff_ms,max_records_per_run,next_check_at,review_status
    FROM automation_sources WHERE id = ? LIMIT 1`).bind(id).first<SourceRow>();
  return row ? mapSource(row) : null;
}

export async function beginAutomationRun(sourceId: number, startedAt: string, database?: AutomationD1Database) {
  const db = getDatabase(database);
  const row = await db.prepare(`INSERT INTO automation_runs (
      source_id,status,started_at,checked_count,new_finding_count,updated_finding_count,error_count,created_at
    ) VALUES (?, 'RUNNING', ?, 0, 0, 0, 0, ?)
    RETURNING id`).bind(sourceId, startedAt, startedAt).first<{ id: number }>();
  if (!row) throw new Error("automation_run_create_failed");
  return Number(row.id);
}

export async function finishAutomationRun(input: {
  runId: number;
  source: AutomationSource;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  checkedCount: number;
  newFindingCount: number;
  updatedFindingCount: number;
  errorCount: number;
  errorSummary?: string | null;
  startedAt: Date;
  completedAt: Date;
}, database?: AutomationD1Database) {
  const db = getDatabase(database);
  const completedIso = input.completedAt.toISOString();
  const duration = Math.max(0, input.completedAt.getTime() - input.startedAt.getTime());
  const nextCheckAt = nextAutomationCheckAt(input.completedAt, input.source.cadenceMinutes);
  const sourceErrorCode = input.errorSummary?.slice(0, 180) ?? null;
  await db.batch([
    db.prepare(`UPDATE automation_runs SET status=?,completed_at=?,checked_count=?,new_finding_count=?,
      updated_finding_count=?,error_count=?,duration_ms=?,error_summary=? WHERE id=?`).bind(
      input.status, completedIso, input.checkedCount, input.newFindingCount, input.updatedFindingCount,
      input.errorCount, duration, input.errorSummary ?? null, input.runId,
    ),
    db.prepare(`UPDATE automation_sources SET last_checked_at=?,
      last_success_at=CASE WHEN ?='SUCCESS' THEN ? ELSE last_success_at END,
      last_error_at=CASE WHEN ?='SUCCESS' THEN last_error_at ELSE ? END,
      last_error_code=CASE WHEN ?='SUCCESS' THEN NULL ELSE ? END,
      next_check_at=?,updated_at=? WHERE id=?`).bind(
      completedIso,
      input.status, completedIso,
      input.status, completedIso,
      input.status, sourceErrorCode,
      nextCheckAt,
      completedIso,
      input.source.id,
    ),
  ]);
  return { durationMs: duration, nextCheckAt };
}

export async function recordAutomationObservation(input: {
  sourceId: number;
  runId: number;
  record: AutomationSourceRecord;
  payloadHash: string;
  detectedAt: string;
}, database?: AutomationD1Database) {
  const db = getDatabase(database);
  const normalized = JSON.stringify(input.record.proposed);
  const raw = JSON.stringify(input.record.rawRecord);
  await db.prepare(`INSERT INTO automation_observations (
      source_id,run_id,source_record_id,source_url,source_timestamp,payload_hash,
      raw_payload_json,normalized_payload_json,detected_at
    ) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(source_id,source_record_id,payload_hash) DO NOTHING`).bind(
      input.sourceId, input.runId, input.record.sourceRecordId, input.record.sourceUrl,
      input.record.sourceTimestamp, input.payloadHash, raw, normalized, input.detectedAt,
    ).run();
  const row = await db.prepare(`SELECT id FROM automation_observations
    WHERE source_id=? AND source_record_id=? AND payload_hash=? LIMIT 1`).bind(
      input.sourceId, input.record.sourceRecordId, input.payloadHash,
    ).first<{ id: number }>();
  if (!row) throw new Error("automation_observation_missing");
  return Number(row.id);
}

function sourceIdFromJson(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const object = value as Record<string, unknown>;
  const automation = object.automation;
  if (automation && typeof automation === "object") {
    const sourceId = String((automation as Record<string, unknown>).sourceId ?? "").trim();
    if (sourceId) return sourceId;
  }
  const sourceId = String(object.sourceId ?? object.source_id ?? "").trim();
  return sourceId || null;
}

function commonCandidate(row: Record<string, unknown>, key: string): AutomationMatchCandidate {
  const sourceData = parseJson<Record<string, unknown>>(String(row.source_data_json ?? ""), {});
  return {
    id: Number(row.id),
    key,
    before: row,
    sourceId: sourceIdFromJson(sourceData),
    sourceUrl: String(row.source_url ?? row.external_source_url ?? row.action_url ?? row.website_url ?? "") || null,
    importKey: String(row.import_key ?? "") || null,
    slug: String(row.slug ?? "") || null,
    name: String(row.name ?? row.title ?? row.dog_name ?? "") || null,
    dogName: String(row.dog_name ?? "") || null,
    category: String(row.category ?? "") || null,
    date: String(row.start_date ?? row.event_date ?? row.reported_date ?? "") || null,
    organizer: String(row.organizer ?? row.organization_name ?? row.organization ?? "") || null,
    city: String(row.city ?? "") || null,
    region: String(row.region ?? "") || null,
    registrationNumber: String(row.registration_number ?? "") || null,
    type: String(row.type ?? "") || null,
  };
}

function bool(value: unknown) {
  return value === 1 || value === true || value === "1";
}

function eventBefore(row: Record<string, unknown>) {
  return {
    slug: row.slug, title: row.title, excerpt: row.excerpt, eventType: row.event_type, status: row.status,
    startDate: row.start_date, startTime: row.start_time, endDate: row.end_date, endTime: row.end_time,
    venue: row.venue, city: row.city, region: row.region, address: row.address, organizer: row.organizer,
    description: row.description, practicalInfo: row.practical_info, websiteUrl: row.website_url,
    registrationUrl: row.registration_url, imageUrl: row.image_url, cancelled: bool(row.cancelled),
  };
}

function organizationBefore(row: Record<string, unknown>) {
  const sourceData = parseJson<Record<string, unknown>>(String(row.source_data_json ?? "{}"), {});
  return {
    name: row.name, slug: row.slug, legalName: row.legal_name, registrationNumber: row.registration_number,
    type: row.type, status: row.status, shortDescription: row.short_description, description: row.description,
    publicEmail: row.public_email, publicPhone: row.public_phone, websiteUrl: row.website_url,
    facebookUrl: row.facebook_url, instagramUrl: row.instagram_url, address: row.address, city: row.city,
    district: row.district, region: row.region, countryCode: row.country_code, importKey: row.import_key,
    sourceUrl: row.source_url, lastVerifiedAt: row.last_verified_at,
    operatorName: sourceData.operatorName ?? null,
    sourceApprovalNumber: sourceData.sourceApprovalNumber ?? null,
    sourceActivity: sourceData.sourceActivity ?? null,
  };
}

function directoryBefore(row: Record<string, unknown>) {
  return {
    slug: row.slug, name: row.name, category: row.category, status: row.status, excerpt: row.excerpt,
    description: row.description, services: parseJson(String(row.services_json ?? "[]"), []),
    qualifications: parseJson(String(row.qualifications_json ?? "[]"), []), city: row.city, district: row.district,
    region: row.region, address: row.address, online: bool(row.online), priceNote: row.price_note,
    websiteUrl: row.website_url, importKey: row.import_key, verified: bool(row.verified),
  };
}

function adoptionBefore(row: Record<string, unknown>) {
  return {
    name: row.name, slug: row.slug, status: row.status, sex: row.sex, birthDate: row.birth_date,
    approximateAgeMonths: row.approximate_age_months, size: row.size, weight: row.weight,
    breedName: row.breed_name, breedMix: bool(row.breed_mix), color: row.color, region: row.region,
    district: row.district, city: row.city, organizationName: row.organization_name,
    shortDescription: row.short_description, description: row.description, externalSourceUrl: row.external_source_url,
    lastVerifiedAt: row.last_verified_at,
  };
}

function lostFoundBefore(row: Record<string, unknown>) {
  return {
    type: row.type, status: row.status, slug: row.slug, dogName: row.dog_name, sex: row.sex, breed: row.breed,
    color: row.color, approximateAge: row.approximate_age, size: row.size, description: row.description,
    eventDate: row.event_date, region: row.region, district: row.district, city: row.city,
    locationDescription: row.location_description, source: row.source, sourceUrl: row.source_url,
  };
}

function helpBefore(row: Record<string, unknown>) {
  return {
    slug: row.slug, title: row.title, category: row.category, status: row.status, excerpt: row.excerpt,
    description: row.description, organization: row.organization, dogName: row.dog_name, breed: row.breed,
    ageNote: row.age_note, city: row.city, region: row.region, locationNote: row.location_note,
    reportedDate: row.reported_date, deadlineDate: row.deadline_date, actionUrl: row.action_url,
    contactNote: row.contact_note, goalAmount: row.goal_amount, raisedAmount: row.raised_amount,
    verified: bool(row.verified), urgent: bool(row.urgent), resolved: bool(row.resolved),
  };
}

async function candidateRows(source: AutomationSource, record: AutomationSourceRecord, database?: AutomationD1Database) {
  const db = getDatabase(database);
  const proposed = record.proposed;
  const slug = String(proposed.slug ?? "");
  const sourceUrl = record.sourceUrl ?? String(proposed.sourceUrl ?? proposed.externalSourceUrl ?? proposed.actionUrl ?? "");
  const category = String(proposed.category ?? "");
  const name = String(proposed.name ?? proposed.title ?? proposed.dogName ?? "");
  const city = String(proposed.city ?? "");
  let result: D1Result<Record<string, unknown>>;

  if (source.entityType === "EVENT") {
    const startDate = String(proposed.startDate ?? proposed.start_date ?? "");
    result = await db.prepare(`SELECT * FROM managed_events
      WHERE slug=? OR start_date=? OR website_url=? OR registration_url=?
      ORDER BY id ASC LIMIT 100`).bind(slug, startDate, sourceUrl, sourceUrl).all<Record<string, unknown>>();
    return result.results.map((row) => ({ ...commonCandidate(row, `event:${row.id}`), before: eventBefore(row), sourceUrl: String(row.website_url ?? row.registration_url ?? "") || null }));
  }

  if (source.entityType === "ORGANIZATION") {
    const importKey = String(proposed.importKey ?? proposed.import_key ?? "");
    const registration = String(proposed.registrationNumber ?? proposed.registration_number ?? "");
    result = await db.prepare(`SELECT * FROM help_organizations
      WHERE slug=? OR import_key=? OR registration_number=? OR source_url=? OR name=? COLLATE NOCASE
      ORDER BY id ASC LIMIT 50`).bind(slug, importKey, registration, sourceUrl, name).all<Record<string, unknown>>();
    return result.results.map((row) => ({ ...commonCandidate(row, `organization:${row.id}`), before: organizationBefore(row) }));
  }

  if (source.entityType === "DIRECTORY") {
    const importKey = String(proposed.importKey ?? proposed.import_key ?? "");
    result = await db.prepare(`SELECT * FROM directory_profiles
      WHERE import_key=? OR (category=? AND slug=?) OR (category=? AND name=? COLLATE NOCASE)
      ORDER BY id ASC LIMIT 50`).bind(importKey, category, slug, category, name).all<Record<string, unknown>>();
    return result.results.map((row) => ({ ...commonCandidate(row, `directory:${row.id}`), before: directoryBefore(row) }));
  }

  if (source.entityType === "ADOPTION") {
    const organizationName = String(proposed.organizationName ?? proposed.organization ?? "");
    result = await db.prepare(`SELECT * FROM adoption_dogs
      WHERE external_source_url=? OR slug=? OR (name=? COLLATE NOCASE AND organization_name=? COLLATE NOCASE)
      ORDER BY id ASC LIMIT 50`).bind(sourceUrl, slug, name, organizationName).all<Record<string, unknown>>();
    return result.results.map((row) => ({ ...commonCandidate(row, `adoption:${row.id}`), before: adoptionBefore(row) }));
  }

  if (source.entityType === "LOST_FOUND") {
    const type = String(proposed.type ?? "");
    result = await db.prepare(`SELECT * FROM lost_found_dog_reports
      WHERE source_url=? OR (type=? AND slug=?)
      ORDER BY id ASC LIMIT 50`).bind(sourceUrl, type, slug).all<Record<string, unknown>>();
    return result.results.map((row) => ({ ...commonCandidate(row, `lost-found:${row.id}`), before: lostFoundBefore(row) }));
  }

  const dogName = String(proposed.dogName ?? proposed.name ?? "");
  result = await db.prepare(`SELECT * FROM help_cases
    WHERE (category=? AND slug=?) OR action_url=?
      OR (category=? AND (title=? COLLATE NOCASE OR dog_name=? COLLATE NOCASE) AND city=? COLLATE NOCASE)
    ORDER BY id ASC LIMIT 50`).bind(category, slug, sourceUrl, category, name, dogName, city).all<Record<string, unknown>>();
  return result.results.map((row) => ({ ...commonCandidate(row, `help:${row.id}`), before: helpBefore(row) }));
}

export async function matchAutomationCanonical(
  source: AutomationSource,
  record: AutomationSourceRecord,
  database?: AutomationD1Database,
) {
  const candidates = await candidateRows(source, record, database);
  return selectSafeAutomationMatch({ entityType: source.entityType, record, candidates });
}

export async function upsertAutomationFinding(input: {
  source: AutomationSource;
  observationId: number | null;
  sourceRecordId: string;
  sourceUrl: string | null;
  sourceTimestamp: string | null;
  findingType: AutomationFindingType;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  matchQuality: string;
  before: Record<string, unknown> | null;
  proposed: Record<string, unknown>;
  diff: AutomationDiff;
  payloadHash: string;
  fingerprint: string;
  reason: string;
  detectedAt: string;
}, database?: AutomationD1Database) {
  const db = getDatabase(database);
  const existing = await db.prepare(`SELECT * FROM automation_findings WHERE fingerprint=? LIMIT 1`)
    .bind(input.fingerprint).first<FindingRow>();
  if (existing) {
    const reopen = (input.findingType === "SOURCE_ERROR" && existing.review_status === "RESOLVED")
      || shouldReopenSuppressedFinding({
        reviewStatus: existing.review_status,
        suppressedUntil: existing.suppressed_until,
        now: new Date(input.detectedAt),
        payloadChanged: false,
      });
    const reviewStatus = reopen ? "NEW" : existing.review_status;
    await db.prepare(`UPDATE automation_findings SET observation_id=?,source_url=?,source_timestamp=?,
      last_detected_at=?,review_status=?,reviewer_decision=CASE WHEN ? THEN NULL ELSE reviewer_decision END,
      reviewer_notes=CASE WHEN ? THEN NULL ELSE reviewer_notes END,reviewed_by=CASE WHEN ? THEN NULL ELSE reviewed_by END,
      reviewed_at=CASE WHEN ? THEN NULL ELSE reviewed_at END,suppressed_until=CASE WHEN ? THEN NULL ELSE suppressed_until END
      WHERE id=?`).bind(
      input.observationId, input.sourceUrl, input.sourceTimestamp, input.detectedAt, reviewStatus,
      reopen ? 1 : 0, reopen ? 1 : 0, reopen ? 1 : 0, reopen ? 1 : 0, reopen ? 1 : 0, existing.id,
    ).run();
    return { id: Number(existing.id), created: false, reopened: reopen, reviewStatus };
  }

  const priority = automationFindingPriority(input.findingType);
  const row = await db.prepare(`INSERT INTO automation_findings (
      source_id,observation_id,entity_type,finding_type,canonical_entity_id,canonical_entity_key,match_quality,
      source_url,source_timestamp,reason,before_json,proposed_json,diff_json,payload_hash,fingerprint,priority,
      review_status,first_detected_at,last_detected_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'NEW',?,?)
    RETURNING id`).bind(
      input.source.id, input.observationId, input.source.entityType, input.findingType, input.canonicalEntityId,
      input.canonicalEntityKey, input.matchQuality, input.sourceUrl, input.sourceTimestamp, input.reason,
      JSON.stringify(input.before ?? {}), JSON.stringify(input.proposed), JSON.stringify(input.diff), input.payloadHash,
      input.fingerprint, priority, input.detectedAt, input.detectedAt,
    ).first<{ id: number }>();
  if (!row) throw new Error("automation_finding_create_failed");
  return { id: Number(row.id), created: true, reopened: false, reviewStatus: "NEW" as const };
}

export async function resolveOtherAutomationSourceErrors(
  sourceId: number,
  activeFingerprint: string,
  at: string,
  database?: AutomationD1Database,
) {
  const db = getDatabase(database);
  await db.prepare(`UPDATE automation_findings SET review_status='RESOLVED',reviewer_decision='SOURCE_ERROR_REPLACED',
    reviewed_at=?
    WHERE source_id=? AND finding_type='SOURCE_ERROR' AND fingerprint<>?
      AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED')`).bind(at, sourceId, activeFingerprint).run();
}

export async function resolveAutomationSourceErrors(sourceId: number, at: string, database?: AutomationD1Database) {
  const db = getDatabase(database);
  await db.prepare(`UPDATE automation_findings SET review_status='RESOLVED',reviewer_decision='SOURCE_RECOVERED',
    reviewed_at=?,last_detected_at=last_detected_at
    WHERE source_id=? AND finding_type='SOURCE_ERROR' AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED')`).bind(at, sourceId).run();
}

export async function getAutomationFindingDetail(id: number, database?: AutomationD1Database): Promise<AutomationFindingDetail | null> {
  const db = getDatabase(database);
  const row = await db.prepare(`SELECT f.*,s.source_key,s.label AS source_label
    FROM automation_findings f JOIN automation_sources s ON s.id=f.source_id
    WHERE f.id=? LIMIT 1`).bind(id).first<FindingRow & { source_key: string; source_label: string }>();
  if (!row) return null;
  return {
    id: Number(row.id), sourceId: Number(row.source_id), observationId: row.observation_id, sourceKey: row.source_key, sourceLabel: row.source_label,
    entityType: row.entity_type, findingType: row.finding_type, canonicalEntityId: row.canonical_entity_id,
    canonicalEntityKey: row.canonical_entity_key, matchQuality: row.match_quality, sourceUrl: row.source_url,
    sourceTimestamp: row.source_timestamp, reason: row.reason, before: parseJson(row.before_json, {}),
    proposed: parseJson(row.proposed_json, {}), diff: parseJson(row.diff_json, {}), payloadHash: row.payload_hash,
    fingerprint: row.fingerprint, priority: row.priority, reviewStatus: row.review_status,
    reviewerDecision: row.reviewer_decision, reviewerNotes: row.reviewer_notes, reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at, suppressedUntil: row.suppressed_until, firstDetectedAt: row.first_detected_at,
    lastDetectedAt: row.last_detected_at,
  };
}

export async function reviewAutomationFinding(input: {
  id: number;
  action: AutomationReviewAction;
  reviewerEmail: string;
  notes?: string | null;
  suppressedUntil?: string | null;
  now?: Date;
}, database?: AutomationD1Database) {
  const db = getDatabase(database);
  const existing = await db.prepare(`SELECT review_status FROM automation_findings WHERE id=? LIMIT 1`)
    .bind(input.id).first<{ review_status: AutomationReviewStatus }>();
  if (!existing) return null;
  const allowed = existing.review_status === "NEW" || existing.review_status === "IN_REVIEW" || existing.review_status === "SUPPRESSED";
  if (!allowed) throw new Error("Finding je už uzavretý a nemožno ho znovu rozhodnúť bez novej zmeny zdroja.");
  const effect = automationReviewEffect(input.action);
  const at = (input.now ?? new Date()).toISOString();
  const suppression = input.action === "suppress" ? (input.suppressedUntil ?? null) : null;
  await db.prepare(`UPDATE automation_findings SET review_status=?,reviewer_decision=?,reviewer_notes=?,
    reviewed_by=?,reviewed_at=?,suppressed_until=? WHERE id=?`).bind(
      effect.reviewStatus, input.action.toUpperCase(), input.notes?.trim().slice(0, 2000) || null,
      input.reviewerEmail.trim().toLowerCase(), at, suppression, input.id,
    ).run();
  return getAutomationFindingDetail(input.id, db);
}

export async function listAutomationSourceHealth(database?: AutomationD1Database, limit = 50) {
  const db = getDatabase(database);
  const result = await db.prepare(`SELECT s.id,s.source_key,s.label,s.entity_type,s.connector_type,s.enabled,s.next_check_at,
      s.last_checked_at,s.last_success_at,s.last_error_at,s.last_error_code,
      r.status AS last_run_status,r.checked_count,r.new_finding_count,r.updated_finding_count,r.error_count,r.duration_ms
    FROM automation_sources s
    LEFT JOIN automation_runs r ON r.id=(
      SELECT r2.id FROM automation_runs r2 WHERE r2.source_id=s.id ORDER BY r2.started_at DESC,r2.id DESC LIMIT 1
    )
    ORDER BY s.label ASC,s.id ASC LIMIT ?`).bind(Math.max(1, Math.min(100, limit))).all<Record<string, unknown>>();
  return result.results;
}
