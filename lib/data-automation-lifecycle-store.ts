import { env } from "cloudflare:workers";
import {
  automationCanonicalAdminHref,
  isSafeAutomationSourceUrl,
  type AutomationEntityType,
  type AutomationReviewStatus,
} from "./data-automation.ts";
import {
  automationLifecycleActionLabel,
  automationLifecycleCanApply,
  automationLifecycleCurrentState,
  automationLifecycleStateLabel,
  isAutomationLifecycleEntityType,
  isAutomationLifecycleMetadata,
  type AutomationLifecycleEntityType,
  type AutomationLifecycleMetadata,
} from "./data-automation-lifecycle.ts";
import { automationProductCategoryForEntity, type AutomationProductCategorySlug } from "./data-automation-product-model.ts";

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

type LifecycleFindingRow = {
  id: number;
  source_id: number;
  observation_id: number | null;
  entity_type: string;
  canonical_entity_id: number | null;
  canonical_entity_key: string | null;
  source_url: string | null;
  before_json: string;
  proposed_json: string;
  fingerprint: string;
  review_status: AutomationReviewStatus;
  reviewer_decision: string | null;
  reviewer_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  first_detected_at: string;
  last_detected_at: string;
  source_key: string;
  source_label: string;
  finding_type: string;
  observation_source_record_id: string | null;
};

export type AutomationLifecycleSuggestion = {
  id: number;
  sourceId: number;
  sourceKey: string;
  sourceLabel: string;
  sourceRecordId: string;
  entityType: AutomationLifecycleEntityType;
  canonicalEntityId: number;
  canonicalEntityKey: string | null;
  entityLabel: string;
  signalType: AutomationLifecycleMetadata["signalType"];
  targetState: string;
  currentState: string;
  currentStateLabel: string;
  proposedStateLabel: string;
  evidenceText: string;
  sourceUrl: string | null;
  canonicalHref: string | null;
  actionLabel: string;
  fingerprint: string;
  canApply: boolean;
  reviewStatus: AutomationReviewStatus;
  reviewerDecision: string | null;
  reviewerNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  firstDetectedAt: string;
  lastDetectedAt: string;
};

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Automation lifecycle nemá pripojenú databázu.");
}

function parseObject(value: unknown) {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function rowMetadata(row: LifecycleFindingRow): AutomationLifecycleMetadata | null {
  const proposed = parseObject(row.proposed_json);
  if (isAutomationLifecycleMetadata(proposed)) return proposed;

  const sourceRecordId = String(row.observation_source_record_id ?? row.canonical_entity_key ?? `legacy:${row.id}`).trim().slice(0, 240);
  const sourceUrl = row.source_url && isSafeAutomationSourceUrl(row.source_url) ? row.source_url : null;
  if (row.entity_type === "EVENT" && row.finding_type === "POSSIBLE_CANCELLED" && proposed.cancelled === true) {
    return {
      lifecycleVersion: 1,
      signalType: "EVENT_CANCELLED",
      targetState: "CANCELLED",
      evidenceText: "Podujatie zrušené",
      confidenceClass: "EXPLICIT",
      sourceRecordId,
      sourceUrl,
    };
  }
  const adoptionStatus = String(proposed.status ?? "").trim().toUpperCase();
  if (row.entity_type === "ADOPTION" && row.finding_type === "POSSIBLE_INACTIVE" && adoptionStatus === "ADOPTED") {
    return {
      lifecycleVersion: 1,
      signalType: "ADOPTION_ADOPTED",
      targetState: "ADOPTED",
      evidenceText: "Adoptovaný",
      confidenceClass: "EXPLICIT",
      sourceRecordId,
      sourceUrl,
    };
  }
  if (row.entity_type === "ADOPTION" && row.finding_type === "POSSIBLE_INACTIVE" && adoptionStatus === "RESERVED") {
    return {
      lifecycleVersion: 1,
      signalType: "ADOPTION_RESERVED",
      targetState: "RESERVED",
      evidenceText: "Rezervovaný",
      confidenceClass: "EXPLICIT",
      sourceRecordId,
      sourceUrl,
    };
  }
  if (row.entity_type === "FOSTER" && proposed.resolved === true) {
    return {
      lifecycleVersion: 1,
      signalType: "FOSTER_RESOLVED",
      targetState: "RESOLVED",
      evidenceText: "Prípad vyriešený",
      confidenceClass: "EXPLICIT",
      sourceRecordId,
      sourceUrl,
    };
  }
  if (row.entity_type === "LOST_FOUND" && String(proposed.status ?? "").trim().toUpperCase() === "RESOLVED") {
    return {
      lifecycleVersion: 1,
      signalType: "LOST_FOUND_RESOLVED",
      targetState: "RESOLVED",
      evidenceText: "Prípad vyriešený",
      confidenceClass: "EXPLICIT",
      sourceRecordId,
      sourceUrl,
    };
  }
  return null;
}

async function canonicalSnapshot(entityType: AutomationLifecycleEntityType, id: number, db: Database) {
  if (entityType === "EVENT") {
    const row = await db.prepare("SELECT title,status,cancelled,updated_at FROM managed_events WHERE id=? LIMIT 1")
      .bind(id).first<Record<string, unknown>>();
    return row ? {
      title: row.title,
      status: row.status,
      cancelled: Boolean(row.cancelled),
      updatedAt: row.updated_at,
    } : null;
  }
  if (entityType === "ADOPTION") {
    const row = await db.prepare("SELECT name,status,updated_at FROM adoption_dogs WHERE id=? LIMIT 1")
      .bind(id).first<Record<string, unknown>>();
    return row ? { name: row.name, status: row.status, updatedAt: row.updated_at } : null;
  }
  if (entityType === "FOSTER") {
    const row = await db.prepare("SELECT title,dog_name,status,resolved,updated_at FROM help_cases WHERE id=? LIMIT 1")
      .bind(id).first<Record<string, unknown>>();
    return row ? {
      title: row.title,
      dogName: row.dog_name,
      status: row.status,
      resolved: Boolean(row.resolved),
      updatedAt: row.updated_at,
    } : null;
  }
  const row = await db.prepare("SELECT dog_name,city,status,updated_at FROM lost_found_dog_reports WHERE id=? LIMIT 1")
    .bind(id).first<Record<string, unknown>>();
  return row ? {
    dogName: row.dog_name,
    city: row.city,
    status: row.status,
    updatedAt: row.updated_at,
  } : null;
}

function entityLabel(before: Record<string, unknown>, id: number) {
  return String(before.name ?? before.title ?? before.dogName ?? before.city ?? "").trim() || `Záznam #${id}`;
}

async function mapLifecycleRow(row: LifecycleFindingRow, db: Database): Promise<AutomationLifecycleSuggestion | null> {
  const metadata = rowMetadata(row);
  if (!metadata || !isAutomationLifecycleEntityType(row.entity_type) || !row.canonical_entity_id) return null;
  const entityType = row.entity_type;
  const canonicalEntityId = Number(row.canonical_entity_id);
  const detectedBefore = parseObject(row.before_json);
  const current = await canonicalSnapshot(entityType, canonicalEntityId, db);
  const before = current ?? detectedBefore;
  const currentState = automationLifecycleCurrentState(entityType, before);
  const rawUrl = metadata.sourceUrl ?? row.source_url;
  const sourceUrl = rawUrl && isSafeAutomationSourceUrl(rawUrl) ? rawUrl : null;
  return {
    id: Number(row.id),
    sourceId: Number(row.source_id),
    sourceKey: row.source_key,
    sourceLabel: row.source_label,
    sourceRecordId: metadata.sourceRecordId,
    entityType,
    canonicalEntityId,
    canonicalEntityKey: row.canonical_entity_key,
    entityLabel: entityLabel(before, canonicalEntityId),
    signalType: metadata.signalType,
    targetState: metadata.targetState,
    currentState,
    currentStateLabel: automationLifecycleStateLabel(entityType, currentState),
    proposedStateLabel: automationLifecycleStateLabel(entityType, metadata.targetState),
    evidenceText: metadata.evidenceText,
    sourceUrl,
    canonicalHref: automationCanonicalAdminHref(entityType, canonicalEntityId),
    actionLabel: automationLifecycleActionLabel(metadata.signalType, entityLabel(before, canonicalEntityId)),
    fingerprint: row.fingerprint,
    canApply: automationLifecycleCanApply(entityType, before, metadata.targetState),
    reviewStatus: row.review_status,
    reviewerDecision: row.reviewer_decision,
    reviewerNotes: row.reviewer_notes,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    firstDetectedAt: row.first_detected_at,
    lastDetectedAt: row.last_detected_at,
  };
}

const lifecycleSelect = `SELECT f.*,s.source_key,s.label AS source_label,
    o.source_record_id AS observation_source_record_id
  FROM automation_findings f
  JOIN automation_sources s ON s.id=f.source_id
  LEFT JOIN automation_observations o ON o.id=f.observation_id`;

const lifecyclePredicate = `json_valid(f.proposed_json)=1 AND (
    json_extract(f.proposed_json,'$.lifecycleVersion')=1
    OR (f.entity_type='EVENT' AND f.finding_type='POSSIBLE_CANCELLED' AND json_extract(f.proposed_json,'$.cancelled')=1)
    OR (f.entity_type='ADOPTION' AND f.finding_type='POSSIBLE_INACTIVE' AND UPPER(COALESCE(json_extract(f.proposed_json,'$.status'),'')) IN ('ADOPTED','RESERVED'))
    OR (f.entity_type='FOSTER' AND json_extract(f.proposed_json,'$.resolved')=1)
    OR (f.entity_type='LOST_FOUND' AND UPPER(COALESCE(json_extract(f.proposed_json,'$.status'),''))='RESOLVED')
  )`;

export async function getAutomationLifecycleSuggestion(id: number, databaseInput?: Database) {
  const db = database(databaseInput);
  const row = await db.prepare(`${lifecycleSelect}
    WHERE f.id=? AND ${lifecyclePredicate} LIMIT 1`).bind(id).first<LifecycleFindingRow>();
  return row ? mapLifecycleRow(row, db) : null;
}

export async function listAutomationLifecycleSuggestions(input: {
  entityTypes?: AutomationEntityType[];
  limit?: number;
  offset?: number;
} = {}, databaseInput?: Database) {
  const db = database(databaseInput);
  const entityTypes = [...new Set((input.entityTypes ?? []).filter(isAutomationLifecycleEntityType))];
  const bindings: unknown[] = [];
  const conditions = [
    lifecyclePredicate,
    "f.canonical_entity_id IS NOT NULL",
    "f.review_status IN ('NEW','IN_REVIEW','SUPPRESSED')",
  ];
  if (entityTypes.length) {
    conditions.push(`f.entity_type IN (${entityTypes.map(() => "?").join(",")})`);
    bindings.push(...entityTypes);
  }
  const limit = Math.max(1, Math.min(100, Math.trunc(input.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(input.offset ?? 0));
  const rows = await db.prepare(`${lifecycleSelect}
    WHERE ${conditions.join(" AND ")}
    ORDER BY f.last_detected_at DESC,f.id DESC LIMIT ? OFFSET ?`).bind(
      ...bindings,
      limit,
      offset,
    ).all<LifecycleFindingRow>();

  const output: AutomationLifecycleSuggestion[] = [];
  for (const row of rows.results) {
    const suggestion = await mapLifecycleRow(row, db);
    if (!suggestion) continue;
    if (suggestion.currentState === suggestion.targetState) {
      await resolveAutomationLifecycleSuggestionSatisfied({
        id: suggestion.id,
        expectedFingerprint: suggestion.fingerprint,
        at: new Date().toISOString(),
      }, db);
      continue;
    }
    output.push(suggestion);
  }
  return output;
}

export async function countOpenAutomationLifecycleSuggestions(input: {
  entityTypes?: AutomationEntityType[];
} = {}, databaseInput?: Database) {
  const db = database(databaseInput);
  const entityTypes = [...new Set((input.entityTypes ?? []).filter(isAutomationLifecycleEntityType))];
  const bindings: unknown[] = [];
  const conditions = [
    lifecyclePredicate,
    "f.canonical_entity_id IS NOT NULL",
    "f.review_status IN ('NEW','IN_REVIEW','SUPPRESSED')",
  ];
  if (entityTypes.length) {
    conditions.push(`f.entity_type IN (${entityTypes.map(() => "?").join(",")})`);
    bindings.push(...entityTypes);
  }
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM automation_findings f
    WHERE ${conditions.join(" AND ")}`).bind(...bindings).first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function countOpenAutomationLifecycleSuggestionsByCategory(databaseInput?: Database) {
  const db = database(databaseInput);
  const rows = await db.prepare(`SELECT f.entity_type,COUNT(*) AS count
    FROM automation_findings f
    WHERE ${lifecyclePredicate}
      AND f.canonical_entity_id IS NOT NULL
      AND f.review_status IN ('NEW','IN_REVIEW','SUPPRESSED')
    GROUP BY f.entity_type`).all<{ entity_type: AutomationEntityType; count: number }>();
  const counts: Partial<Record<AutomationProductCategorySlug, number>> = {};
  for (const row of rows.results) {
    const category = automationProductCategoryForEntity(row.entity_type);
    if (category) counts[category] = Number(row.count ?? 0);
  }
  return counts;
}

export async function resolveSatisfiedAutomationLifecycleSuggestions(input: {
  sourceId: number;
  entityType: AutomationLifecycleEntityType;
  canonicalEntityId: number;
  signalType: AutomationLifecycleMetadata["signalType"];
  targetState: string;
  at: string;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  await db.prepare(`UPDATE automation_findings SET
      review_status='RESOLVED',reviewer_decision='LIFECYCLE_ALREADY_SATISFIED',
      reviewed_at=COALESCE(reviewed_at,?)
    WHERE source_id=? AND entity_type=? AND canonical_entity_id=?
      AND review_status IN ('NEW','IN_REVIEW','SUPPRESSED')
      AND json_valid(proposed_json)=1
      AND (
        (json_extract(proposed_json,'$.lifecycleVersion')=1
          AND json_extract(proposed_json,'$.signalType')=?
          AND json_extract(proposed_json,'$.targetState')=?)
        OR (?='EVENT_CANCELLED' AND finding_type='POSSIBLE_CANCELLED' AND json_extract(proposed_json,'$.cancelled')=1)
        OR (?='ADOPTION_ADOPTED' AND finding_type='POSSIBLE_INACTIVE' AND UPPER(COALESCE(json_extract(proposed_json,'$.status'),''))='ADOPTED')
        OR (?='ADOPTION_RESERVED' AND finding_type='POSSIBLE_INACTIVE' AND UPPER(COALESCE(json_extract(proposed_json,'$.status'),''))='RESERVED')
        OR (?='FOSTER_RESOLVED' AND json_extract(proposed_json,'$.resolved')=1)
        OR (?='LOST_FOUND_RESOLVED' AND UPPER(COALESCE(json_extract(proposed_json,'$.status'),''))='RESOLVED')
      )`).bind(
        input.at,
        input.sourceId,
        input.entityType,
        input.canonicalEntityId,
        input.signalType,
        input.targetState,
        input.signalType,
        input.signalType,
        input.signalType,
        input.signalType,
        input.signalType,
      ).run();
}

export async function hasNewerAutomationLifecycleEvidence(
  suggestion: Pick<AutomationLifecycleSuggestion, "id" | "sourceId" | "entityType" | "canonicalEntityId" | "signalType" | "sourceRecordId" | "fingerprint">,
  databaseInput?: Database,
) {
  const db = database(databaseInput);
  const row = await db.prepare(`SELECT id,fingerprint FROM automation_findings f
    WHERE f.id>?
      AND f.source_id=? AND f.entity_type=? AND f.canonical_entity_id=?
      AND json_valid(f.proposed_json)=1
      AND json_extract(f.proposed_json,'$.lifecycleVersion')=1
      AND json_extract(f.proposed_json,'$.signalType')=?
      AND json_extract(f.proposed_json,'$.sourceRecordId')=?
    ORDER BY f.id DESC LIMIT 1`).bind(
      suggestion.id,
      suggestion.sourceId,
      suggestion.entityType,
      suggestion.canonicalEntityId,
      suggestion.signalType,
      suggestion.sourceRecordId,
    ).first<{ id: number; fingerprint: string }>();
  return Boolean(row && row.fingerprint !== suggestion.fingerprint);
}

async function setLifecycleDecision(input: {
  id: number;
  expectedFingerprint: string;
  reviewStatus: "REJECTED" | "RESOLVED";
  reviewerDecision: "LIFECYCLE_REJECTED" | "LIFECYCLE_ACCEPTED" | "LIFECYCLE_ALREADY_SATISFIED";
  reviewerEmail?: string | null;
  reviewerNotes?: string | null;
  at: string;
}, databaseInput?: Database) {
  const db = database(databaseInput);
  const current = await db.prepare(`SELECT fingerprint,review_status,reviewer_decision FROM automation_findings f
    WHERE f.id=? AND ${lifecyclePredicate} LIMIT 1`).bind(input.id).first<{
      fingerprint: string;
      review_status: AutomationReviewStatus;
      reviewer_decision: string | null;
    }>();
  if (!current) return null;
  if (current.fingerprint !== input.expectedFingerprint) throw new Error("automation_lifecycle_fingerprint_mismatch");
  if (current.review_status === input.reviewStatus && current.reviewer_decision === input.reviewerDecision) {
    return getAutomationLifecycleSuggestion(input.id, db);
  }
  if (!["NEW", "IN_REVIEW", "SUPPRESSED"].includes(current.review_status)) {
    throw new Error("automation_lifecycle_already_decided");
  }
  await db.prepare(`UPDATE automation_findings SET review_status=?,reviewer_decision=?,
      reviewer_notes=?,reviewed_by=?,reviewed_at=?,suppressed_until=NULL
    WHERE id=? AND fingerprint=?`).bind(
      input.reviewStatus,
      input.reviewerDecision,
      input.reviewerNotes?.trim().slice(0, 1000) || null,
      input.reviewerEmail?.trim().toLowerCase() || null,
      input.at,
      input.id,
      input.expectedFingerprint,
    ).run();
  return getAutomationLifecycleSuggestion(input.id, db);
}

export async function rejectAutomationLifecycleSuggestion(input: {
  id: number;
  expectedFingerprint: string;
  reviewerEmail: string;
  reviewerNotes?: string | null;
  at?: string;
}, databaseInput?: Database) {
  return setLifecycleDecision({
    ...input,
    reviewStatus: "REJECTED",
    reviewerDecision: "LIFECYCLE_REJECTED",
    at: input.at ?? new Date().toISOString(),
  }, databaseInput);
}

export async function acceptAutomationLifecycleSuggestionDecision(input: {
  id: number;
  expectedFingerprint: string;
  reviewerEmail: string;
  reviewerNotes?: string | null;
  at?: string;
}, databaseInput?: Database) {
  return setLifecycleDecision({
    ...input,
    reviewStatus: "RESOLVED",
    reviewerDecision: "LIFECYCLE_ACCEPTED",
    at: input.at ?? new Date().toISOString(),
  }, databaseInput);
}

export async function resolveAutomationLifecycleSuggestionSatisfied(input: {
  id: number;
  expectedFingerprint: string;
  reviewerNotes?: string | null;
  at?: string;
}, databaseInput?: Database) {
  return setLifecycleDecision({
    ...input,
    reviewStatus: "RESOLVED",
    reviewerDecision: "LIFECYCLE_ALREADY_SATISFIED",
    reviewerEmail: null,
    at: input.at ?? new Date().toISOString(),
  }, databaseInput);
}
