import { shouldSuppressAutomationPossibleCandidate } from "./data-automation-match-review.ts";
import {
  canonicalizeSourceUrl,
  normalizeAutomationIdentity,
  sha256Hex,
  stableJson,
  type AutomationSource,
  type AutomationSourceRecord,
} from "./data-automation.ts";
import {
  automationSemanticKindsCompatible,
  normalizeAutomationCandidateKey,
  normalizeAutomationDiscoveryKey,
  normalizeAutomationDomain,
  normalizeAutomationEmail,
  normalizeAutomationExactText,
  normalizeAutomationPhone,
  type AutomationCandidateKey,
  type AutomationSemanticKind,
} from "./data-automation-identity.ts";
import { resolveDirectoryAutomationEntityCluster } from "./data-automation-directory-clustering.ts";

export const automationClusterMatchQualities = ["EXACT", "STRONG", "POSSIBLE", "NONE"] as const;
export type AutomationClusterMatchQuality = (typeof automationClusterMatchQualities)[number];

export const automationSourceRoles = [
  "UNKNOWN",
  "OFFICIAL_ORGANIZER",
  "OFFICIAL_REGISTRY",
  "OFFICIAL_CLUB_CALENDAR",
  "SECONDARY_DIRECTORY",
  "SEARCH_DISCOVERY",
  "SOCIAL_LISTING",
  "AGGREGATOR",
] as const;
export type AutomationSourceRole = (typeof automationSourceRoles)[number];

type AutomationClusterDatabase = Pick<D1Database, "prepare" | "batch">;

export type AutomationIndexedClusterCandidate = {
  id: number;
  semanticKind: AutomationSemanticKind;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
};

export function canAutomationObservationEnterCluster(input: {
  entityType: AutomationSource["entityType"];
  observationSemanticKind: AutomationSemanticKind;
  clusterSemanticKind: AutomationSemanticKind;
}) {
  return automationSemanticKindsCompatible(
    input.entityType,
    input.observationSemanticKind,
    input.clusterSemanticKind,
  );
}

export async function lookupAutomationClusterCandidates(input: {
  entityType: AutomationSource["entityType"];
  semanticKind: AutomationSemanticKind;
  keys: AutomationCandidateKey[];
  limit?: number;
}, database: AutomationClusterDatabase): Promise<AutomationIndexedClusterCandidate[]> {
  if (input.semanticKind === "UNKNOWN" || input.keys.length === 0) return [];
  const keys = [...new Map(input.keys.map((key) => [
    [key.keyType, key.namespace, key.normalizedValue].join("\\u0000"), key,
  ])).values()].slice(0, 16);
  const clauses = keys.map(() => "(k.key_type=? AND k.key_namespace=? AND k.normalized_value=?)").join(" OR ");
  const bindings = keys.flatMap((key) => [key.keyType, key.namespace, key.normalizedValue]);
  const limit = Math.max(1, Math.min(250, Math.floor(input.limit ?? 100)));
  try {
    const rows = await database.prepare(`SELECT DISTINCT c.id,c.semantic_kind,c.canonical_entity_id,c.canonical_entity_key,c.updated_at
      FROM automation_entity_candidate_keys k
      JOIN automation_entity_clusters c ON c.id=k.cluster_id
      WHERE k.entity_type=? AND k.semantic_kind=? AND (${clauses})
      ORDER BY c.updated_at DESC,c.id DESC LIMIT ?`).bind(
      input.entityType, input.semanticKind, ...bindings, limit,
    ).all<{
      id: number;
      semantic_kind: AutomationSemanticKind;
      canonical_entity_id: number | null;
      canonical_entity_key: string | null;
    }>();
    return rows.results.map((row) => ({
      id: Number(row.id),
      semanticKind: row.semantic_kind,
      canonicalEntityId: row.canonical_entity_id == null ? null : Number(row.canonical_entity_id),
      canonicalEntityKey: row.canonical_entity_key,
    }));
  } catch (error) {
    if (isMissingClusterSchema(error)) return [];
    throw error;
  }
}

export type EventClusterCandidate = {
  id: number;
  canonicalEntityId?: number | null;
  canonicalEntityKey?: string | null;
  fields: Record<string, string>;
};

export type EventClusterDecision = {
  quality: AutomationClusterMatchQuality;
  candidateId: number | null;
  possibleCandidateIds: number[];
  reason: string;
};

export type AutomationClusterResolution = EventClusterDecision & {
  clusterId: number;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
};

const EVENT_EVIDENCE_FIELDS = [
  "title",
  "startDate",
  "endDate",
  "city",
  "venue",
  "organizer",
  "websiteUrl",
  "registrationUrl",
  "cancelled",
  "status",
  "canonicalExternalId",
] as const;

const HIGH_IMPACT_EVENT_FIELDS = new Set(["startDate", "endDate", "cancelled", "status", "venue", "city"]);
const HIGH_IMPACT_ORGANIZATION_FIELDS = new Set([
  "ico",
  "registryId",
  "organizationName",
  "activeStatus",
  "domain",
  "operatorMeaning",
  "organizationType",
]);
const HIGH_IMPACT_CLUSTER_FIELDS = new Set([
  ...HIGH_IMPACT_EVENT_FIELDS,
  ...HIGH_IMPACT_ORGANIZATION_FIELDS,
]);

function text(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

function normalizedDate(value: unknown) {
  const valueText = text(value);
  if (!valueText) return null;
  const match = valueText.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : valueText;
}

function normalizeField(field: string, value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (field === "websiteUrl" || field === "registrationUrl") return canonicalizeSourceUrl(value);
  if (field === "startDate" || field === "endDate") return normalizedDate(value);
  if (field === "cancelled") return value === true || value === 1 || value === "1" ? "true" : "false";
  if (typeof value === "string") return normalizeAutomationIdentity(value);
  return stableJson(value);
}

function proposedField(record: AutomationSourceRecord, field: string) {
  const p = record.proposed;
  if (field === "startDate") return p.startDate ?? p.start_date;
  if (field === "endDate") return p.endDate ?? p.end_date;
  if (field === "websiteUrl") return p.websiteUrl ?? p.website_url;
  if (field === "registrationUrl") return p.registrationUrl ?? p.registration_url;
  if (field === "canonicalExternalId") return p.canonicalExternalId ?? p.canonical_external_id;
  return p[field];
}

function eventRecordFields(record: AutomationSourceRecord) {
  const fields: Record<string, string> = {};
  for (const field of EVENT_EVIDENCE_FIELDS) {
    const normalized = normalizeField(field, proposedField(record, field));
    if (normalized) fields[field] = normalized;
  }
  return fields;
}

function urlIdentityKey(value: string | undefined) {
  if (!value) return null;
  const canonical = canonicalizeSourceUrl(value);
  if (!canonical) return null;
  try {
    const url = new URL(canonical);
    if (url.pathname === "/" && !url.search) return null;
    return canonical;
  } catch {
    return null;
  }
}

function tokenSet(value: string | undefined) {
  return new Set((value ?? "").split(" ").filter(Boolean));
}

export function normalizedTitleSimilarity(left: string | undefined, right: string | undefined) {
  const a = tokenSet(left);
  const b = tokenSet(right);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function candidateQuality(recordFields: Record<string, string>, candidate: EventClusterCandidate) {
  const c = candidate.fields;
  const canonicalExternalId = recordFields.canonicalExternalId && c.canonicalExternalId
    && recordFields.canonicalExternalId === c.canonicalExternalId;
  const sameWebsite = urlIdentityKey(recordFields.websiteUrl) && urlIdentityKey(recordFields.websiteUrl) === urlIdentityKey(c.websiteUrl);
  const sameRegistration = urlIdentityKey(recordFields.registrationUrl) && urlIdentityKey(recordFields.registrationUrl) === urlIdentityKey(c.registrationUrl);
  if (canonicalExternalId || sameWebsite || sameRegistration) {
    return { quality: "EXACT" as const, reason: "shared_external_identifier_or_canonical_url" };
  }

  const sameTitle = Boolean(recordFields.title && c.title && recordFields.title === c.title);
  const sameDate = Boolean(recordFields.startDate && c.startDate && recordFields.startDate === c.startDate);
  const sameCity = Boolean(recordFields.city && c.city && recordFields.city === c.city);
  if (sameTitle && sameDate && sameCity) {
    return { quality: "STRONG" as const, reason: "exact_normalized_title_start_date_city" };
  }

  const sameOrganizer = Boolean(recordFields.organizer && c.organizer && recordFields.organizer === c.organizer);
  const sameVenue = Boolean(recordFields.venue && c.venue && recordFields.venue === c.venue);
  if (sameTitle && ((sameDate && (sameOrganizer || sameVenue)) || (sameCity && (sameOrganizer || sameVenue)))) {
    return { quality: "POSSIBLE" as const, reason: "partial_exact_event_identity_requires_review" };
  }

  const titleSimilarity = normalizedTitleSimilarity(recordFields.title, c.title);
  if (sameDate && sameCity && titleSimilarity >= 0.86) {
    return { quality: "POSSIBLE" as const, reason: "similar_title_same_date_city_requires_review" };
  }

  return { quality: "NONE" as const, reason: "insufficient_event_identity" };
}

export function selectEventClusterCandidate(
  record: AutomationSourceRecord,
  candidates: EventClusterCandidate[],
): EventClusterDecision {
  const fields = eventRecordFields(record);
  const ranked = candidates
    .map((candidate) => ({ candidate, ...candidateQuality(fields, candidate) }))
    .filter((entry) => entry.quality !== "NONE");

  const exact = ranked.filter((entry) => entry.quality === "EXACT");
  if (exact.length === 1) return { quality: "EXACT", candidateId: exact[0].candidate.id, possibleCandidateIds: [], reason: exact[0].reason };
  if (exact.length > 1) return {
    quality: "POSSIBLE",
    candidateId: null,
    possibleCandidateIds: exact.map((entry) => entry.candidate.id),
    reason: "multiple_exact_cluster_candidates_require_review",
  };

  const strong = ranked.filter((entry) => entry.quality === "STRONG");
  if (strong.length === 1) return { quality: "STRONG", candidateId: strong[0].candidate.id, possibleCandidateIds: [], reason: strong[0].reason };
  if (strong.length > 1) return {
    quality: "POSSIBLE",
    candidateId: null,
    possibleCandidateIds: strong.map((entry) => entry.candidate.id),
    reason: "multiple_strong_cluster_candidates_require_review",
  };

  const possible = ranked.filter((entry) => entry.quality === "POSSIBLE");
  if (possible.length) return {
    quality: "POSSIBLE",
    candidateId: null,
    possibleCandidateIds: possible.map((entry) => entry.candidate.id),
    reason: possible[0].reason,
  };
  return { quality: "NONE", candidateId: null, possibleCandidateIds: [], reason: "new_logical_entity" };
}

function isMissingClusterSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*automation_(?:entity_clusters|entity_candidate_keys|cluster_|field_evidence|source_authority)|no such column:\s*semantic_kind/i.test(message);
}

async function sourceAuthority(sourceId: number, database: AutomationClusterDatabase) {
  try {
    const row = await database.prepare(`SELECT source_role,authority_score
      FROM automation_source_authority WHERE source_id=? LIMIT 1`).bind(sourceId)
      .first<{ source_role: AutomationSourceRole; authority_score: number }>();
    return row
      ? { role: row.source_role, score: Math.max(0, Math.min(100, Number(row.authority_score))) }
      : { role: "UNKNOWN" as const, score: 50 };
  } catch (error) {
    if (isMissingClusterSchema(error)) return { role: "UNKNOWN" as const, score: 50 };
    throw error;
  }
}

async function recentEventCandidates(database: AutomationClusterDatabase): Promise<EventClusterCandidate[]> {
  const clusters = await database.prepare(`SELECT id,canonical_entity_id,canonical_entity_key
    FROM automation_entity_clusters WHERE entity_type='EVENT'
    ORDER BY updated_at DESC,id DESC LIMIT 250`).all<{
      id: number; canonical_entity_id: number | null; canonical_entity_key: string | null;
    }>();
  if (!clusters.results.length) return [];
  const fields = await database.prepare(`SELECT cluster_id,field_name,normalized_value
    FROM automation_field_evidence
    WHERE is_current=1 AND is_preferred=1
      AND cluster_id IN (
        SELECT id FROM automation_entity_clusters WHERE entity_type='EVENT'
        ORDER BY updated_at DESC,id DESC LIMIT 250
      )`).all<{ cluster_id: number; field_name: string; normalized_value: string }>();
  const byCluster = new Map<number, Record<string, string>>();
  for (const row of fields.results) {
    const bucket = byCluster.get(Number(row.cluster_id)) ?? {};
    bucket[row.field_name] = row.normalized_value;
    byCluster.set(Number(row.cluster_id), bucket);
  }
  return clusters.results.map((row) => ({
    id: Number(row.id),
    canonicalEntityId: row.canonical_entity_id == null ? null : Number(row.canonical_entity_id),
    canonicalEntityKey: row.canonical_entity_key,
    fields: byCluster.get(Number(row.id)) ?? {},
  }));
}

async function createCluster(entityType: AutomationSource["entityType"], at: string, database: AutomationClusterDatabase) {
  const row = await database.prepare(`INSERT INTO automation_entity_clusters (entity_type,created_at,updated_at)
    VALUES (?,?,?) RETURNING id`).bind(entityType, at, at).first<{ id: number }>();
  if (!row) throw new Error("automation_cluster_create_failed");
  return Number(row.id);
}

async function recordClusterMatchCandidates(input: {
  observationId: number;
  sourceClusterId?: number;
  entityType?: AutomationSource["entityType"];
  candidateIds: number[];
  quality: Exclude<AutomationClusterMatchQuality, "NONE">;
  reason: string;
  at: string;
}, database: AutomationClusterDatabase) {
  for (const candidateId of [...new Set(input.candidateIds)]) {
    if (input.sourceClusterId && (input.entityType === "DIRECTORY" || input.entityType === "ORGANIZATION")) {
      if (await shouldSuppressAutomationPossibleCandidate({ observationId: input.observationId, sourceClusterId: input.sourceClusterId, candidateClusterId: candidateId, matchReason: input.reason }, database)) continue;
    }
    await database.prepare(`INSERT INTO automation_cluster_match_candidates
      (observation_id,candidate_cluster_id,match_quality,match_reason,created_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(observation_id,candidate_cluster_id)
      DO UPDATE SET match_quality=excluded.match_quality,match_reason=excluded.match_reason`).bind(
      input.observationId, candidateId, input.quality, input.reason, input.at,
    ).run();
  }
}

async function attachObservation(input: {
  clusterId: number;
  source: AutomationSource;
  observationId: number;
  sourceRecordId: string;
  quality: AutomationClusterMatchQuality;
  reason: string;
  at: string;
}, database: AutomationClusterDatabase) {
  await database.batch([
    database.prepare(`INSERT INTO automation_cluster_observations
      (cluster_id,observation_id,match_quality,match_reason,linked_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(observation_id) DO NOTHING`).bind(
      input.clusterId, input.observationId, input.quality, input.reason, input.at,
    ),
    database.prepare(`INSERT INTO automation_cluster_source_records
      (cluster_id,source_id,entity_type,source_record_id,first_seen_at,last_seen_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(source_id,entity_type,source_record_id)
      DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(
      input.clusterId, input.source.id, input.source.entityType, input.sourceRecordId, input.at, input.at,
    ),
    database.prepare(`UPDATE automation_entity_clusters SET updated_at=? WHERE id=?`)
      .bind(input.at, input.clusterId),
  ]);
}

async function recomputeFieldState(
  clusterId: number,
  fieldName: string,
  at: string,
  database: AutomationClusterDatabase,
) {
  const rows = await database.prepare(`SELECT id,normalized_value,value_hash,authority_score,confidence,is_preferred
    FROM automation_field_evidence
    WHERE cluster_id=? AND field_name=? AND is_current=1
    ORDER BY authority_score DESC,confidence DESC,id ASC`).bind(clusterId, fieldName)
    .all<{ id: number; normalized_value: string; value_hash: string; authority_score: number; confidence: number; is_preferred: number }>();
  if (!rows.results.length) return;

  const uniqueValues = [...new Set(rows.results.map((row) => row.normalized_value))];
  const existingPreferred = rows.results.find((row) => Number(row.is_preferred) === 1);
  const conflicting = uniqueValues.length > 1;
  const preferred = conflicting && HIGH_IMPACT_CLUSTER_FIELDS.has(fieldName) && existingPreferred
    ? existingPreferred
    : rows.results[0];

  await database.prepare(`UPDATE automation_field_evidence SET is_preferred=CASE WHEN id=? THEN 1 ELSE 0 END
    WHERE cluster_id=? AND field_name=?`).bind(preferred.id, clusterId, fieldName).run();

  if (conflicting) {
    const valuesFingerprint = await sha256Hex(uniqueValues.sort());
    const open = await database.prepare(`SELECT id FROM automation_field_conflicts
      WHERE cluster_id=? AND field_name=? AND status='OPEN' LIMIT 1`).bind(clusterId, fieldName)
      .first<{ id: number }>();
    if (open) {
      await database.prepare(`UPDATE automation_field_conflicts SET
        impact=?,selected_evidence_id=?,values_fingerprint=?,updated_at=? WHERE id=?`).bind(
        HIGH_IMPACT_CLUSTER_FIELDS.has(fieldName) ? "HIGH" : "NORMAL",
        preferred.id,
        valuesFingerprint,
        at,
        open.id,
      ).run();
    } else {
      await database.prepare(`INSERT INTO automation_field_conflicts
        (cluster_id,field_name,impact,status,selected_evidence_id,values_fingerprint,detected_at,updated_at)
        VALUES (?,?,?,'OPEN',?,?,?,?)`).bind(
        clusterId,
        fieldName,
        HIGH_IMPACT_CLUSTER_FIELDS.has(fieldName) ? "HIGH" : "NORMAL",
        preferred.id,
        valuesFingerprint,
        at,
        at,
      ).run();
    }
  } else {
    await database.prepare(`UPDATE automation_field_conflicts
      SET status='RESOLVED',resolved_at=?,updated_at=?
      WHERE cluster_id=? AND field_name=? AND status='OPEN'`).bind(at, at, clusterId, fieldName).run();
  }
}

async function recordEventEvidence(input: {
  clusterId: number;
  source: AutomationSource;
  observationId: number;
  record: AutomationSourceRecord;
  at: string;
  clusterQuality: AutomationClusterMatchQuality;
}, database: AutomationClusterDatabase) {
  const authority = await sourceAuthority(input.source.id, database);
  const confidence = input.clusterQuality === "EXACT" ? 95 : input.clusterQuality === "STRONG" ? 85 : 75;
  for (const fieldName of EVENT_EVIDENCE_FIELDS) {
    const rawValue = proposedField(input.record, fieldName);
    const normalizedValue = normalizeField(fieldName, rawValue);
    if (!normalizedValue) continue;
    const valueHash = await sha256Hex({ fieldName, normalizedValue });
    await database.batch([
      database.prepare(`UPDATE automation_field_evidence SET is_current=0,is_preferred=0
        WHERE cluster_id=? AND source_id=? AND source_record_id=? AND field_name=? AND observation_id<>?`).bind(
        input.clusterId, input.source.id, input.record.sourceRecordId, fieldName, input.observationId,
      ),
      database.prepare(`INSERT INTO automation_field_evidence (
          cluster_id,observation_id,source_id,source_record_id,field_name,raw_value_json,normalized_value,value_hash,
          source_role,authority_score,confidence,is_current,is_preferred,first_seen_at,last_seen_at
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,?,?)
        ON CONFLICT(cluster_id,observation_id,field_name)
        DO UPDATE SET last_seen_at=excluded.last_seen_at,is_current=1`).bind(
        input.clusterId,
        input.observationId,
        input.source.id,
        input.record.sourceRecordId,
        fieldName,
        stableJson(rawValue),
        normalizedValue,
        valueHash,
        authority.role,
        authority.score,
        confidence,
        input.at,
        input.at,
      ),
    ]);
    await recomputeFieldState(input.clusterId, fieldName, input.at, database);
  }
}


const ORGANIZATION_ROOT_KINDS = new Set<AutomationSemanticKind>([
  "LEGAL_ORGANIZATION",
  "PUBLIC_ORGANIZATION",
  "RESCUE_GROUP",
]);

type OrganizationClusterCandidate = AutomationIndexedClusterCandidate & {
  fields: Record<string, string>;
};

function organizationValue(record: AutomationSourceRecord, ...keys: string[]) {
  for (const key of keys) {
    if (!key) continue;
    const value = record.proposed[key];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

export function organizationObservationSemanticKind(record: AutomationSourceRecord): AutomationSemanticKind {
  const value = normalizeAutomationExactText(organizationValue(record, "semanticKind", "semantic_kind"));
  if (value === "legal_organization") return "LEGAL_ORGANIZATION";
  if (value === "public_organization") return "PUBLIC_ORGANIZATION";
  if (value === "rescue_group") return "RESCUE_GROUP";
  if (value === "branch") return "BRANCH";
  if (value === "facility") return "FACILITY";
  if (value === "person") return "PERSON";
  return "UNKNOWN";
}

function organizationIco(record: AutomationSourceRecord) {
  const raw = String(organizationValue(record, "ico", "registrationNumber") ?? "").replace(/\D+/g, "");
  return /^\d{8}$/.test(raw) ? raw : null;
}

function organizationFields(record: AutomationSourceRecord) {
  const fields: Record<string, string> = {};
  const name = normalizeAutomationDiscoveryKey(organizationValue(record, "legalName", "legal_name", "name"));
  const municipality = normalizeAutomationDiscoveryKey(organizationValue(record, "municipality", "city"));
  const domain = normalizeAutomationDomain(organizationValue(record, "websiteUrl", "website_url", "domain"));
  const phone = normalizeAutomationPhone(organizationValue(record, "publicPhone", "phone"));
  const email = normalizeAutomationEmail(organizationValue(record, "publicEmail", "email"));
  const ico = organizationIco(record);
  const registryId = normalizeAutomationExactText(organizationValue(record, "registryId", "registry_id", "legalRegistryId"));
  const registryNamespace = normalizeAutomationExactText(organizationValue(record, "registryNamespace", "registry_namespace", "legalRegistryNamespace"));
  const facilityRegistryId = normalizeAutomationExactText(organizationValue(record, "sourceApprovalNumber", "facilityRegistryId"));
  const activeStatus = normalizeAutomationExactText(organizationValue(record, "status", "active"));
  const organizationType = normalizeAutomationDiscoveryKey(organizationValue(record, "organizationType", "type"));
  const operatorMeaning = normalizeAutomationDiscoveryKey(organizationValue(record, "operatorName", "operator"));

  if (name) fields.organizationName = name;
  if (municipality) fields.municipality = municipality;
  if (domain) fields.domain = domain;
  if (phone) fields.phone = phone;
  if (email) fields.email = email;
  if (ico) fields.ico = ico;
  if (registryId && registryNamespace) {
    fields.registryId = registryId;
    fields.registryNamespace = registryNamespace;
  }
  if (facilityRegistryId) fields.facilityRegistryId = facilityRegistryId;
  if (activeStatus) fields.activeStatus = activeStatus;
  if (organizationType) fields.organizationType = organizationType;
  if (operatorMeaning) fields.operatorMeaning = operatorMeaning;
  return fields;
}

function organizationRawEvidence(record: AutomationSourceRecord, fieldName: string) {
  if (fieldName === "organizationName") return organizationValue(record, "legalName", "legal_name", "name");
  if (fieldName === "municipality") return organizationValue(record, "municipality", "city");
  if (fieldName === "domain") return organizationValue(record, "websiteUrl", "website_url", "domain");
  if (fieldName === "phone") return organizationValue(record, "publicPhone", "phone");
  if (fieldName === "email") return organizationValue(record, "publicEmail", "email");
  if (fieldName === "ico") return organizationValue(record, "ico", "registrationNumber");
  if (fieldName === "registryId") return organizationValue(record, "registryId", "registry_id", "legalRegistryId");
  if (fieldName === "registryNamespace") return organizationValue(record, "registryNamespace", "registry_namespace", "legalRegistryNamespace");
  if (fieldName === "facilityRegistryId") return organizationValue(record, "sourceApprovalNumber", "facilityRegistryId");
  if (fieldName === "activeStatus") return organizationValue(record, "status", "active");
  if (fieldName === "organizationType") return organizationValue(record, "organizationType", "type");
  if (fieldName === "operatorMeaning") return organizationValue(record, "operatorName", "operator");
  return null;
}

export function organizationCandidateKeys(
  record: AutomationSourceRecord,
  semanticKind: AutomationSemanticKind,
): AutomationCandidateKey[] {
  if (!ORGANIZATION_ROOT_KINDS.has(semanticKind)) return [];
  const fields = organizationFields(record);
  const keys: AutomationCandidateKey[] = [];
  const add = (key: AutomationCandidateKey | null) => { if (key) keys.push(key); };

  if (semanticKind === "LEGAL_ORGANIZATION" || semanticKind === "PUBLIC_ORGANIZATION") {
    add(normalizeAutomationCandidateKey({ keyType: "ICO", value: fields.ico }));
    if (fields.registryId && fields.registryNamespace) {
      add(normalizeAutomationCandidateKey({
        keyType: "REGISTRY_ID",
        namespace: fields.registryNamespace,
        value: fields.registryId,
      }));
    }
  }
  add(normalizeAutomationCandidateKey({ keyType: "NAME", value: fields.organizationName }));
  add(normalizeAutomationCandidateKey({ keyType: "MUNICIPALITY", value: fields.municipality }));
  add(normalizeAutomationCandidateKey({ keyType: "DOMAIN", value: fields.domain }));
  add(normalizeAutomationCandidateKey({ keyType: "PHONE", value: fields.phone }));
  add(normalizeAutomationCandidateKey({ keyType: "EMAIL", value: fields.email }));
  return [...new Map(keys.map((key) => [
    [key.keyType, key.namespace, key.normalizedValue].join("\u0000"),
    key,
  ])).values()];
}

export function selectOrganizationClusterCandidate(
  record: AutomationSourceRecord,
  semanticKind: AutomationSemanticKind,
  candidates: OrganizationClusterCandidate[],
): EventClusterDecision {
  if (!ORGANIZATION_ROOT_KINDS.has(semanticKind)) {
    return { quality: "NONE", candidateId: null, possibleCandidateIds: [], reason: "organization_semantic_kind_blocked" };
  }
  const fields = organizationFields(record);
  const compatible = candidates.filter((candidate) =>
    canAutomationObservationEnterCluster({
      entityType: "ORGANIZATION",
      observationSemanticKind: semanticKind,
      clusterSemanticKind: candidate.semanticKind,
    }),
  );

  const exact = compatible.filter((candidate) => {
    const sameIco = Boolean(
      (semanticKind === "LEGAL_ORGANIZATION" || semanticKind === "PUBLIC_ORGANIZATION")
      && fields.ico && candidate.fields.ico === fields.ico,
    );
    const sameRegistry = Boolean(
      fields.registryId && fields.registryNamespace
      && candidate.fields.registryId === fields.registryId
      && candidate.fields.registryNamespace === fields.registryNamespace,
    );
    return sameIco || sameRegistry;
  });
  if (exact.length === 1) {
    return {
      quality: "EXACT",
      candidateId: exact[0].id,
      possibleCandidateIds: [],
      reason: fields.ico && exact[0].fields.ico === fields.ico
        ? "exact_organization_ico"
        : "exact_namespaced_legal_registry_id",
    };
  }
  if (exact.length > 1) {
    return {
      quality: "POSSIBLE",
      candidateId: null,
      possibleCandidateIds: exact.map((candidate) => candidate.id),
      reason: "ambiguous_exact_organization_identity_requires_review",
    };
  }

  const strong = compatible.filter((candidate) => {
    const sameName = Boolean(fields.organizationName && candidate.fields.organizationName === fields.organizationName);
    const sameMunicipality = Boolean(fields.municipality && candidate.fields.municipality === fields.municipality);
    const sameDomain = Boolean(fields.domain && candidate.fields.domain === fields.domain);
    const samePhone = Boolean(fields.phone && candidate.fields.phone === fields.phone);
    const sameEmail = Boolean(fields.email && candidate.fields.email === fields.email);
    return sameName && sameMunicipality && (sameDomain || (samePhone && sameEmail));
  });
  if (strong.length === 1) {
    return {
      quality: "STRONG",
      candidateId: strong[0].id,
      possibleCandidateIds: [],
      reason: fields.domain && strong[0].fields.domain === fields.domain
        ? "exact_name_municipality_domain"
        : "exact_name_municipality_phone_email",
    };
  }
  if (strong.length > 1) {
    return {
      quality: "POSSIBLE",
      candidateId: null,
      possibleCandidateIds: strong.map((candidate) => candidate.id),
      reason: "ambiguous_strong_organization_identity_requires_review",
    };
  }
  if (compatible.length) {
    return {
      quality: "POSSIBLE",
      candidateId: null,
      possibleCandidateIds: compatible.map((candidate) => candidate.id),
      reason: "partial_organization_identity_requires_review",
    };
  }
  return { quality: "NONE", candidateId: null, possibleCandidateIds: [], reason: "no_organization_identity_match" };
}

async function organizationCandidates(
  semanticKind: AutomationSemanticKind,
  record: AutomationSourceRecord,
  database: AutomationClusterDatabase,
): Promise<OrganizationClusterCandidate[]> {
  const indexed = await lookupAutomationClusterCandidates({
    entityType: "ORGANIZATION",
    semanticKind,
    keys: organizationCandidateKeys(record, semanticKind),
    limit: 100,
  }, database);
  const result: OrganizationClusterCandidate[] = [];
  for (const candidate of indexed) {
    const rows = await database.prepare(
      "SELECT field_name,normalized_value FROM automation_field_evidence WHERE cluster_id=? AND is_current=1 AND is_preferred=1 ORDER BY id",
    ).bind(candidate.id).all<{ field_name: string; normalized_value: string }>();
    result.push({
      ...candidate,
      fields: Object.fromEntries(rows.results.map((row) => [row.field_name, row.normalized_value])),
    });
  }
  return result;
}

async function createOrganizationCluster(
  semanticKind: AutomationSemanticKind,
  at: string,
  database: AutomationClusterDatabase,
) {
  const row = await database.prepare(
    "INSERT INTO automation_entity_clusters (entity_type,semantic_kind,created_at,updated_at) VALUES (?,?,?,?) RETURNING id",
  ).bind("ORGANIZATION", semanticKind, at, at).first<{ id: number }>();
  if (!row) throw new Error("automation_organization_cluster_create_failed");
  return Number(row.id);
}

async function recordOrganizationCandidateKeys(input: {
  clusterId: number;
  semanticKind: AutomationSemanticKind;
  record: AutomationSourceRecord;
  at: string;
}, database: AutomationClusterDatabase) {
  for (const key of organizationCandidateKeys(input.record, input.semanticKind)) {
    await database.prepare(
      "INSERT INTO automation_entity_candidate_keys (cluster_id,entity_type,semantic_kind,key_type,key_namespace,normalized_value,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(cluster_id,key_type,key_namespace,normalized_value) DO UPDATE SET updated_at=excluded.updated_at",
    ).bind(
      input.clusterId,
      "ORGANIZATION",
      input.semanticKind,
      key.keyType,
      key.namespace,
      key.normalizedValue,
      input.at,
      input.at,
    ).run();
  }
}

async function recordOrganizationEvidence(input: {
  clusterId: number;
  source: AutomationSource;
  observationId: number;
  record: AutomationSourceRecord;
  at: string;
  clusterQuality: AutomationClusterMatchQuality;
}, database: AutomationClusterDatabase) {
  const authority = await sourceAuthority(input.source.id, database);
  const confidence = input.clusterQuality === "EXACT" ? 95 : input.clusterQuality === "STRONG" ? 85 : 70;
  for (const [fieldName, normalizedValue] of Object.entries(organizationFields(input.record))) {
    const valueHash = await sha256Hex({ fieldName, normalizedValue });
    await database.batch([
      database.prepare(
        "UPDATE automation_field_evidence SET is_current=0,is_preferred=0 WHERE cluster_id=? AND source_id=? AND source_record_id=? AND field_name=? AND observation_id<>?",
      ).bind(input.clusterId, input.source.id, input.record.sourceRecordId, fieldName, input.observationId),
      database.prepare(
        "INSERT INTO automation_field_evidence (cluster_id,observation_id,source_id,source_record_id,field_name,raw_value_json,normalized_value,value_hash,source_role,authority_score,confidence,is_current,is_preferred,first_seen_at,last_seen_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,?,?) ON CONFLICT(cluster_id,observation_id,field_name) DO UPDATE SET last_seen_at=excluded.last_seen_at,is_current=1",
      ).bind(
        input.clusterId,
        input.observationId,
        input.source.id,
        input.record.sourceRecordId,
        fieldName,
        stableJson(organizationRawEvidence(input.record, fieldName) ?? normalizedValue),
        normalizedValue,
        valueHash,
        authority.role,
        authority.score,
        confidence,
        input.at,
        input.at,
      ),
    ]);
    await recomputeFieldState(input.clusterId, fieldName, input.at, database);
  }
}

async function resolveOrganizationAutomationEntityCluster(
  input: AutomationClusterResolverInput,
  database: AutomationClusterDatabase,
): Promise<AutomationClusterResolution | null> {
  const semanticKind = organizationObservationSemanticKind(input.record);
  if (!ORGANIZATION_ROOT_KINDS.has(semanticKind)) return null;

  try {
    const existing = await database.prepare(
      "SELECT c.id,c.semantic_kind,c.canonical_entity_id,c.canonical_entity_key FROM automation_cluster_source_records sr JOIN automation_entity_clusters c ON c.id=sr.cluster_id WHERE sr.source_id=? AND sr.entity_type=? AND sr.source_record_id=? LIMIT 1",
    ).bind(input.source.id, "ORGANIZATION", input.record.sourceRecordId).first<{
      id: number;
      semantic_kind: AutomationSemanticKind;
      canonical_entity_id: number | null;
      canonical_entity_key: string | null;
    }>();

    let decision: EventClusterDecision;
    let clusterId: number;
    let canonicalEntityId: number | null = null;
    let canonicalEntityKey: string | null = null;

    if (existing && canAutomationObservationEnterCluster({
      entityType: "ORGANIZATION",
      observationSemanticKind: semanticKind,
      clusterSemanticKind: existing.semantic_kind,
    })) {
      clusterId = Number(existing.id);
      canonicalEntityId = existing.canonical_entity_id == null ? null : Number(existing.canonical_entity_id);
      canonicalEntityKey = existing.canonical_entity_key;
      decision = { quality: "EXACT", candidateId: clusterId, possibleCandidateIds: [], reason: "same_source_record_history" };
    } else {
      const canonicalRaw = organizationValue(input.record, "canonicalOrganizationId", "canonicalEntityId");
      const canonicalId = Number(canonicalRaw);
      const verifiedCanonical = Number.isInteger(canonicalId) && canonicalId > 0
        ? await database.prepare(
            "SELECT id,semantic_kind,canonical_entity_id,canonical_entity_key FROM automation_entity_clusters WHERE entity_type=? AND canonical_entity_id=? LIMIT 1",
          ).bind("ORGANIZATION", canonicalId).first<{
            id: number;
            semantic_kind: AutomationSemanticKind;
            canonical_entity_id: number;
            canonical_entity_key: string | null;
          }>()
        : null;

      if (verifiedCanonical && canAutomationObservationEnterCluster({
        entityType: "ORGANIZATION",
        observationSemanticKind: semanticKind,
        clusterSemanticKind: verifiedCanonical.semantic_kind,
      })) {
        clusterId = Number(verifiedCanonical.id);
        canonicalEntityId = Number(verifiedCanonical.canonical_entity_id);
        canonicalEntityKey = verifiedCanonical.canonical_entity_key;
        decision = {
          quality: "EXACT",
          candidateId: clusterId,
          possibleCandidateIds: [],
          reason: "verified_canonical_organization_linkage",
        };
      } else {
        const candidates = await organizationCandidates(semanticKind, input.record, database);
        decision = selectOrganizationClusterCandidate(input.record, semanticKind, candidates);
        if ((decision.quality === "EXACT" || decision.quality === "STRONG") && decision.candidateId) {
          clusterId = decision.candidateId;
          const matched = candidates.find((candidate) => candidate.id === clusterId);
          canonicalEntityId = matched?.canonicalEntityId ?? null;
          canonicalEntityKey = matched?.canonicalEntityKey ?? null;
        } else {
          clusterId = await createOrganizationCluster(semanticKind, input.detectedAt, database);
          if (decision.quality === "POSSIBLE" && decision.possibleCandidateIds.length) {
            await recordClusterMatchCandidates({
              observationId: input.observationId,
              sourceClusterId: clusterId,
              entityType: "ORGANIZATION",
              candidateIds: decision.possibleCandidateIds,
              quality: "POSSIBLE",
              reason: decision.reason,
              at: input.detectedAt,
            }, database);
          }
        }
      }
    }

    await attachObservation({
      clusterId,
      source: input.source,
      observationId: input.observationId,
      sourceRecordId: input.record.sourceRecordId,
      quality: decision.quality,
      reason: decision.reason,
      at: input.detectedAt,
    }, database);
    await recordOrganizationEvidence({
      clusterId,
      source: input.source,
      observationId: input.observationId,
      record: input.record,
      at: input.detectedAt,
      clusterQuality: decision.quality,
    }, database);
    await recordOrganizationCandidateKeys({
      clusterId,
      semanticKind,
      record: input.record,
      at: input.detectedAt,
    }, database);

    return { ...decision, clusterId, canonicalEntityId, canonicalEntityKey };
  } catch (error) {
    if (isMissingClusterSchema(error)) return null;
    throw error;
  }
}

type AutomationClusterResolverInput = {
  source: AutomationSource;
  observationId: number;
  record: AutomationSourceRecord;
  detectedAt: string;
};

type AutomationEntityResolutionStrategy = {
  entityType: AutomationSource["entityType"];
  matcherImplemented: boolean;
  resolve: (
    input: AutomationClusterResolverInput,
    database: AutomationClusterDatabase,
  ) => Promise<AutomationClusterResolution | null>;
};

async function resolveEventAutomationEntityCluster(
  input: AutomationClusterResolverInput,
  database: AutomationClusterDatabase,
): Promise<AutomationClusterResolution | null> {
  try {
    const existing = await database.prepare(`SELECT c.id,c.canonical_entity_id,c.canonical_entity_key
      FROM automation_cluster_source_records sr
      JOIN automation_entity_clusters c ON c.id=sr.cluster_id
      WHERE sr.source_id=? AND sr.entity_type=? AND sr.source_record_id=? LIMIT 1`).bind(
      input.source.id, input.source.entityType, input.record.sourceRecordId,
    ).first<{ id: number; canonical_entity_id: number | null; canonical_entity_key: string | null }>();

    let decision: EventClusterDecision;
    let clusterId: number;
    let canonicalEntityId: number | null = null;
    let canonicalEntityKey: string | null = null;

    if (existing) {
      clusterId = Number(existing.id);
      canonicalEntityId = existing.canonical_entity_id == null ? null : Number(existing.canonical_entity_id);
      canonicalEntityKey = existing.canonical_entity_key;
      decision = { quality: "EXACT", candidateId: clusterId, possibleCandidateIds: [], reason: "same_source_record_history" };
    } else {
      const candidates = await recentEventCandidates(database);
      decision = selectEventClusterCandidate(input.record, candidates);
      if ((decision.quality === "EXACT" || decision.quality === "STRONG") && decision.candidateId) {
        clusterId = decision.candidateId;
        const matched = candidates.find((candidate) => candidate.id === clusterId);
        canonicalEntityId = matched?.canonicalEntityId ?? null;
        canonicalEntityKey = matched?.canonicalEntityKey ?? null;
      } else {
        clusterId = await createCluster(input.source.entityType, input.detectedAt, database);
        if (decision.quality === "POSSIBLE" && decision.possibleCandidateIds.length) {
          await recordClusterMatchCandidates({
            observationId: input.observationId,
            candidateIds: decision.possibleCandidateIds,
            quality: "POSSIBLE",
            reason: decision.reason,
            at: input.detectedAt,
          }, database);
        }
      }
    }

    await attachObservation({
      clusterId,
      source: input.source,
      observationId: input.observationId,
      sourceRecordId: input.record.sourceRecordId,
      quality: decision.quality,
      reason: decision.reason,
      at: input.detectedAt,
    }, database);
    await recordEventEvidence({
      clusterId,
      source: input.source,
      observationId: input.observationId,
      record: input.record,
      at: input.detectedAt,
      clusterQuality: decision.quality,
    }, database);

    return { ...decision, clusterId, canonicalEntityId, canonicalEntityKey };
  } catch (error) {
    if (isMissingClusterSchema(error)) return null;
    throw error;
  }
}

const EVENT_ENTITY_RESOLUTION_STRATEGY: AutomationEntityResolutionStrategy = {
  entityType: "EVENT",
  matcherImplemented: true,
  resolve: resolveEventAutomationEntityCluster,
};

const ORGANIZATION_ENTITY_RESOLUTION_STRATEGY: AutomationEntityResolutionStrategy = {
  entityType: "ORGANIZATION",
  matcherImplemented: true,
  resolve: resolveOrganizationAutomationEntityCluster,
};

const DIRECTORY_ENTITY_RESOLUTION_STRATEGY: AutomationEntityResolutionStrategy = {
  entityType: "DIRECTORY",
  matcherImplemented: true,
  resolve: resolveDirectoryAutomationEntityCluster,
};

export function automationEntityResolutionStrategyFor(
  entityType: AutomationSource["entityType"],
): AutomationEntityResolutionStrategy | null {
  if (entityType === "EVENT") return EVENT_ENTITY_RESOLUTION_STRATEGY;
  if (entityType === "ORGANIZATION") return ORGANIZATION_ENTITY_RESOLUTION_STRATEGY;
  if (entityType === "DIRECTORY") return DIRECTORY_ENTITY_RESOLUTION_STRATEGY;
  return null;
}

export async function resolveAutomationEntityCluster(
  input: AutomationClusterResolverInput,
  database: AutomationClusterDatabase,
): Promise<AutomationClusterResolution | null> {
  const strategy = automationEntityResolutionStrategyFor(input.source.entityType);
  if (!strategy?.matcherImplemented) return null;
  return strategy.resolve(input, database);
}

export async function linkAutomationFindingToCluster(
  findingId: number,
  clusterId: number,
  at: string,
  database: AutomationClusterDatabase,
) {
  try {
    await database.prepare(`INSERT INTO automation_cluster_findings (cluster_id,finding_id,linked_at)
      VALUES (?,?,?) ON CONFLICT(finding_id) DO NOTHING`).bind(clusterId, findingId, at).run();
  } catch (error) {
    if (!isMissingClusterSchema(error)) throw error;
  }
}

export async function linkAutomationClusterCanonical(input: {
  clusterId: number;
  entityType: AutomationSource["entityType"];
  canonicalEntityId: number;
  canonicalEntityKey: string | null;
  at: string;
}, database: AutomationClusterDatabase) {
  try {
    const row = await database.prepare(`SELECT canonical_entity_id FROM automation_entity_clusters
      WHERE id=? AND entity_type=? LIMIT 1`).bind(input.clusterId, input.entityType)
      .first<{ canonical_entity_id: number | null }>();
    if (!row) return { linked: false, conflictCanonicalEntityId: null };
    const current = row.canonical_entity_id == null ? null : Number(row.canonical_entity_id);
    if (current !== null && current !== input.canonicalEntityId) {
      return { linked: false, conflictCanonicalEntityId: current };
    }
    await database.prepare(`UPDATE automation_entity_clusters SET canonical_entity_id=?,canonical_entity_key=?,updated_at=?
      WHERE id=? AND entity_type=?`).bind(
      input.canonicalEntityId,
      input.canonicalEntityKey,
      input.at,
      input.clusterId,
      input.entityType,
    ).run();
    return { linked: true, conflictCanonicalEntityId: null };
  } catch (error) {
    if (isMissingClusterSchema(error)) return { linked: false, conflictCanonicalEntityId: null };
    throw error;
  }
}

export async function getAutomationClusterForFinding(
  findingId: number,
  database: AutomationClusterDatabase,
) {
  try {
    const row = await database.prepare(`SELECT c.id,c.entity_type,c.canonical_entity_id,c.canonical_entity_key
      FROM automation_cluster_findings cf
      JOIN automation_entity_clusters c ON c.id=cf.cluster_id
      WHERE cf.finding_id=? LIMIT 1`).bind(findingId)
      .first<{ id: number; entity_type: AutomationSource["entityType"]; canonical_entity_id: number | null; canonical_entity_key: string | null }>();
    return row ? {
      id: Number(row.id),
      entityType: row.entity_type,
      canonicalEntityId: row.canonical_entity_id == null ? null : Number(row.canonical_entity_id),
      canonicalEntityKey: row.canonical_entity_key,
    } : null;
  } catch (error) {
    if (isMissingClusterSchema(error)) return null;
    throw error;
  }
}
