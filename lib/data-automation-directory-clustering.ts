import { shouldSuppressAutomationPossibleCandidate } from "./data-automation-match-memory.ts";
import { sha256Hex, stableJson, type AutomationSource, type AutomationSourceRecord } from "./data-automation.ts";
import {
  DIRECTORY_SEMANTIC_KIND,
  directoryCandidateKeys,
  directoryObservationSemanticKind,
  isDirectoryFacilityObservation,
  normalizeDirectoryEvidenceField,
  selectDirectoryClusterCandidate,
  type DirectoryClusterCandidate,
  type DirectoryClusterDecision,
} from "./data-automation-directory-matching.ts";
import type { AutomationCandidateKey, AutomationSemanticKind } from "./data-automation-identity.ts";

type Database = Pick<D1Database, "prepare" | "batch">;

export type DirectoryClusterResolution = {
  quality: "EXACT" | "STRONG" | "POSSIBLE" | "NONE";
  candidateId: number | null;
  possibleCandidateIds: number[];
  reason: string;
  clusterId: number;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  candidateCount: number;
  decisiveSignals: string[];
  conflicts: string[];
  ambiguity: boolean;
  semanticCompatible: boolean;
};

const DIRECTORY_EVIDENCE_FIELDS = [
  "name",
  "category",
  "municipality",
  "street",
  "houseNumber",
  "postalCode",
  "phone",
  "email",
  "domain",
  "ico",
  "registryId",
  "registryNamespace",
  "active",
  "status",
] as const;

const HIGH_IMPACT_DIRECTORY_FIELDS = new Set([
  "name",
  "category",
  "municipality",
  "street",
  "houseNumber",
  "postalCode",
  "phone",
  "domain",
  "registryId",
  "registryNamespace",
  "active",
  "status",
]);

function missingSchema(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table:\s*automation_(?:entity_clusters|entity_candidate_keys|cluster_|field_evidence|source_authority)|no such column:\s*semantic_kind/i.test(message);
}

function rawValue(record: AutomationSourceRecord, field: string) {
  const p = record.proposed;
  if (field === "municipality") return p.municipality ?? p.city;
  if (field === "houseNumber") return p.houseNumber ?? p.house_number;
  if (field === "postalCode") return p.postalCode ?? p.postal_code;
  if (field === "domain") return p.domain ?? p.websiteDomain ?? p.website_domain ?? p.website ?? p.websiteUrl ?? p.website_url;
  if (field === "ico") return p.ico ?? p.companyId ?? p.company_id;
  if (field === "registryId") return p.facilityRegistryId ?? p.facility_registry_id ?? p.registryId ?? p.registry_id;
  if (field === "registryNamespace") {
    return p.facilityRegistryNamespace ?? p.facility_registry_namespace ?? p.registryNamespace ?? p.registry_namespace;
  }
  return p[field];
}

async function sourceAuthority(sourceId: number, database: Database) {
  const row = await database.prepare(`SELECT source_role,authority_score
    FROM automation_source_authority WHERE source_id=? LIMIT 1`).bind(sourceId)
    .first<{ source_role: string; authority_score: number }>();
  return row
    ? { role: row.source_role, score: Math.max(0, Math.min(100, Number(row.authority_score))) }
    : { role: "UNKNOWN", score: 50 };
}

async function lookupIndexed(input: {
  keys: AutomationCandidateKey[];
  limit: number;
}, database: Database) {
  if (!input.keys.length) return [] as Array<{
    id: number;
    semanticKind: AutomationSemanticKind;
    canonicalEntityId: number | null;
    canonicalEntityKey: string | null;
  }>;
  const keys = [...new Map(input.keys.map((key) => [
    [key.keyType, key.namespace, key.normalizedValue].join("\u0000"),
    key,
  ])).values()].slice(0, 16);
  const clauses = keys.map(() => "(k.key_type=? AND k.key_namespace=? AND k.normalized_value=?)").join(" OR ");
  const bindings = keys.flatMap((key) => [key.keyType, key.namespace, key.normalizedValue]);
  const rows = await database.prepare(`SELECT DISTINCT c.id,c.semantic_kind,c.canonical_entity_id,c.canonical_entity_key,c.updated_at
    FROM automation_entity_candidate_keys k
    JOIN automation_entity_clusters c ON c.id=k.cluster_id
    WHERE k.entity_type='DIRECTORY' AND k.semantic_kind=? AND (${clauses})
    ORDER BY c.updated_at DESC,c.id DESC LIMIT ?`).bind(
    DIRECTORY_SEMANTIC_KIND, ...bindings, input.limit,
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
}

async function directoryCandidates(record: AutomationSourceRecord, database: Database): Promise<DirectoryClusterCandidate[]> {
  const keys = directoryCandidateKeys(record);
  if (!keys.length) return [];
  const highTypes = new Set<AutomationCandidateKey["keyType"]>(["REGISTRY_ID", "PHONE", "EMAIL", "DOMAIN", "ICO"]);
  const high = keys.filter((key) => highTypes.has(key.keyType));
  const broad = keys.filter((key) => !highTypes.has(key.keyType));
  const byId = new Map<number, Awaited<ReturnType<typeof lookupIndexed>>[number]>();

  if (high.length) {
    for (const candidate of await lookupIndexed({ keys: high, limit: 100 }, database)) byId.set(candidate.id, candidate);
  }
  if (broad.length && byId.size < 100) {
    for (const candidate of await lookupIndexed({ keys: broad, limit: 100 }, database)) {
      if (byId.size >= 100) break;
      byId.set(candidate.id, candidate);
    }
  }

  const base = [...byId.values()];
  if (!base.length) return [];
  const ids = base.map((candidate) => candidate.id);
  const placeholders = ids.map(() => "?").join(",");
  const [fieldRows, keyRows] = await Promise.all([
    database.prepare(`SELECT cluster_id,field_name,normalized_value
      FROM automation_field_evidence
      WHERE is_current=1 AND is_preferred=1 AND cluster_id IN (${placeholders})`).bind(...ids)
      .all<{ cluster_id: number; field_name: string; normalized_value: string }>(),
    database.prepare(`SELECT cluster_id,key_type,key_namespace,normalized_value
      FROM automation_entity_candidate_keys
      WHERE cluster_id IN (${placeholders})`).bind(...ids)
      .all<{ cluster_id: number; key_type: AutomationCandidateKey["keyType"]; key_namespace: string; normalized_value: string }>(),
  ]);

  const fields = new Map<number, Record<string, string>>();
  for (const row of fieldRows.results) {
    const bucket = fields.get(Number(row.cluster_id)) ?? {};
    bucket[row.field_name] = row.normalized_value;
    fields.set(Number(row.cluster_id), bucket);
  }
  const candidateKeys = new Map<number, AutomationCandidateKey[]>();
  for (const row of keyRows.results) {
    const bucket = candidateKeys.get(Number(row.cluster_id)) ?? [];
    bucket.push({ keyType: row.key_type, namespace: row.key_namespace, normalizedValue: row.normalized_value });
    candidateKeys.set(Number(row.cluster_id), bucket);
  }

  return base.map((candidate) => ({
    ...candidate,
    fields: fields.get(candidate.id) ?? {},
    keys: candidateKeys.get(candidate.id) ?? [],
  }));
}

async function createCluster(at: string, database: Database) {
  const row = await database.prepare(`INSERT INTO automation_entity_clusters
    (entity_type,semantic_kind,created_at,updated_at)
    VALUES ('DIRECTORY',?,?,?) RETURNING id`).bind(DIRECTORY_SEMANTIC_KIND, at, at).first<{ id: number }>();
  if (!row) throw new Error("automation_directory_cluster_create_failed");
  return Number(row.id);
}

async function attachObservation(input: {
  clusterId: number;
  source: AutomationSource;
  observationId: number;
  record: AutomationSourceRecord;
  quality: DirectoryClusterResolution["quality"];
  reason: string;
  at: string;
}, database: Database) {
  await database.batch([
    database.prepare(`INSERT INTO automation_cluster_observations
      (cluster_id,observation_id,match_quality,match_reason,linked_at)
      VALUES (?,?,?,?,?)
      ON CONFLICT(observation_id) DO NOTHING`).bind(
      input.clusterId, input.observationId, input.quality, input.reason, input.at,
    ),
    database.prepare(`INSERT INTO automation_cluster_source_records
      (cluster_id,source_id,entity_type,source_record_id,first_seen_at,last_seen_at)
      VALUES (?,?,'DIRECTORY',?,?,?)
      ON CONFLICT(source_id,entity_type,source_record_id)
      DO UPDATE SET last_seen_at=excluded.last_seen_at`).bind(
      input.clusterId, input.source.id, input.record.sourceRecordId, input.at, input.at,
    ),
    database.prepare(`UPDATE automation_entity_clusters SET updated_at=? WHERE id=?`).bind(input.at, input.clusterId),
  ]);
}

async function recordPossibleCandidates(input: {
  observationId: number;
  sourceClusterId: number;
  candidateIds: number[];
  reason: string;
  at: string;
}, database: Database) {
  for (const candidateId of [...new Set(input.candidateIds)]) {
    if (await shouldSuppressAutomationPossibleCandidate({ observationId: input.observationId, sourceClusterId: input.sourceClusterId, candidateClusterId: candidateId, matchReason: input.reason }, database)) continue;
    await database.prepare(`INSERT INTO automation_cluster_match_candidates
      (observation_id,candidate_cluster_id,match_quality,match_reason,created_at)
      VALUES (?,?,'POSSIBLE',?,?)
      ON CONFLICT(observation_id,candidate_cluster_id)
      DO UPDATE SET match_quality=excluded.match_quality,match_reason=excluded.match_reason`).bind(
      input.observationId, candidateId, input.reason, input.at,
    ).run();
  }
}

async function recomputeField(clusterId: number, fieldName: string, at: string, database: Database) {
  const rows = await database.prepare(`SELECT id,normalized_value,authority_score,confidence,is_preferred
    FROM automation_field_evidence
    WHERE cluster_id=? AND field_name=? AND is_current=1
    ORDER BY authority_score DESC,confidence DESC,id ASC`).bind(clusterId, fieldName)
    .all<{ id: number; normalized_value: string; authority_score: number; confidence: number; is_preferred: number }>();
  if (!rows.results.length) return;
  const uniqueValues = [...new Set(rows.results.map((row) => row.normalized_value))];
  const highImpact = HIGH_IMPACT_DIRECTORY_FIELDS.has(fieldName);
  const existingPreferred = rows.results.find((row) => Number(row.is_preferred) === 1);
  const conflicting = uniqueValues.length > 1;
  const preferred = conflicting && highImpact && existingPreferred ? existingPreferred : rows.results[0];

  await database.prepare(`UPDATE automation_field_evidence SET is_preferred=CASE WHEN id=? THEN 1 ELSE 0 END
    WHERE cluster_id=? AND field_name=?`).bind(preferred.id, clusterId, fieldName).run();

  if (!conflicting) {
    await database.prepare(`UPDATE automation_field_conflicts
      SET status='RESOLVED',resolved_at=?,updated_at=?
      WHERE cluster_id=? AND field_name=? AND status='OPEN'`).bind(at, at, clusterId, fieldName).run();
    return;
  }

  const fingerprint = await sha256Hex(uniqueValues.sort());
  const open = await database.prepare(`SELECT id FROM automation_field_conflicts
    WHERE cluster_id=? AND field_name=? AND status='OPEN' LIMIT 1`).bind(clusterId, fieldName)
    .first<{ id: number }>();
  if (open) {
    await database.prepare(`UPDATE automation_field_conflicts SET
      impact=?,selected_evidence_id=?,values_fingerprint=?,updated_at=? WHERE id=?`).bind(
      highImpact ? "HIGH" : "NORMAL", preferred.id, fingerprint, at, open.id,
    ).run();
  } else {
    await database.prepare(`INSERT INTO automation_field_conflicts
      (cluster_id,field_name,impact,status,selected_evidence_id,values_fingerprint,detected_at,updated_at)
      VALUES (?,?,?,'OPEN',?,?,?,?)`).bind(
      clusterId, fieldName, highImpact ? "HIGH" : "NORMAL", preferred.id, fingerprint, at, at,
    ).run();
  }
}

async function recordEvidence(input: {
  clusterId: number;
  source: AutomationSource;
  observationId: number;
  record: AutomationSourceRecord;
  quality: DirectoryClusterResolution["quality"];
  at: string;
}, database: Database) {
  const authority = await sourceAuthority(input.source.id, database);
  const confidence = input.quality === "EXACT" ? 95 : input.quality === "STRONG" ? 85 : 70;
  for (const fieldName of DIRECTORY_EVIDENCE_FIELDS) {
    const raw = rawValue(input.record, fieldName);
    const normalized = normalizeDirectoryEvidenceField(fieldName, raw);
    if (!normalized) continue;
    const valueHash = await sha256Hex({ fieldName, normalized });
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
        stableJson(raw),
        normalized,
        valueHash,
        authority.role,
        authority.score,
        confidence,
        input.at,
        input.at,
      ),
    ]);
    await recomputeField(input.clusterId, fieldName, input.at, database);
  }
}

async function upsertCandidateKeys(clusterId: number, record: AutomationSourceRecord, at: string, database: Database) {
  for (const key of directoryCandidateKeys(record)) {
    await database.prepare(`INSERT INTO automation_entity_candidate_keys
      (cluster_id,entity_type,semantic_kind,key_type,key_namespace,normalized_value,created_at,updated_at)
      VALUES (?,'DIRECTORY',?,?,?,?,?,?)
      ON CONFLICT(cluster_id,key_type,key_namespace,normalized_value)
      DO UPDATE SET updated_at=excluded.updated_at`).bind(
      clusterId, DIRECTORY_SEMANTIC_KIND, key.keyType, key.namespace, key.normalizedValue, at, at,
    ).run();
  }
}

export async function resolveDirectoryAutomationEntityCluster(input: {
  source: AutomationSource;
  observationId: number;
  record: AutomationSourceRecord;
  detectedAt: string;
}, database: Database): Promise<DirectoryClusterResolution | null> {
  try {
    if (!isDirectoryFacilityObservation(input.record)) return null;

    const existing = await database.prepare(`SELECT c.id,c.semantic_kind,c.canonical_entity_id,c.canonical_entity_key
      FROM automation_cluster_source_records sr
      JOIN automation_entity_clusters c ON c.id=sr.cluster_id
      WHERE sr.source_id=? AND sr.entity_type='DIRECTORY' AND sr.source_record_id=? LIMIT 1`).bind(
      input.source.id, input.record.sourceRecordId,
    ).first<{
      id: number;
      semantic_kind: AutomationSemanticKind;
      canonical_entity_id: number | null;
      canonical_entity_key: string | null;
    }>();

    let decision: DirectoryClusterDecision;
    let clusterId: number;
    let canonicalEntityId: number | null = null;
    let canonicalEntityKey: string | null = null;

    if (existing && directoryObservationSemanticKind(input.record) === existing.semantic_kind) {
      clusterId = Number(existing.id);
      canonicalEntityId = existing.canonical_entity_id == null ? null : Number(existing.canonical_entity_id);
      canonicalEntityKey = existing.canonical_entity_key;
      decision = {
        quality: "EXACT" as const,
        candidateId: clusterId,
        possibleCandidateIds: [] as number[],
        reason: "same_source_record_history",
        candidateCount: 1,
        decisiveSignals: ["source_record_history"],
        conflicts: [] as string[],
        ambiguity: false,
        semanticCompatible: true,
      };
    } else {
      const candidates = await directoryCandidates(input.record, database);
      const authority = await sourceAuthority(input.source.id, database);
      decision = selectDirectoryClusterCandidate(input.record, candidates, {
        allowRegistryExact: authority.role === "OFFICIAL_REGISTRY",
      });

      if ((decision.quality === "EXACT" || decision.quality === "STRONG") && decision.candidateId) {
        clusterId = decision.candidateId;
        const matched = candidates.find((candidate) => candidate.id === clusterId);
        canonicalEntityId = matched?.canonicalEntityId ?? null;
        canonicalEntityKey = matched?.canonicalEntityKey ?? null;
      } else {
        clusterId = await createCluster(input.detectedAt, database);
        if (decision.quality === "POSSIBLE" && decision.possibleCandidateIds.length) {
          await recordPossibleCandidates({
            observationId: input.observationId,
            sourceClusterId: clusterId,
            candidateIds: decision.possibleCandidateIds,
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
      record: input.record,
      quality: decision.quality,
      reason: decision.reason,
      at: input.detectedAt,
    }, database);
    await recordEvidence({
      clusterId,
      source: input.source,
      observationId: input.observationId,
      record: input.record,
      quality: decision.quality,
      at: input.detectedAt,
    }, database);
    await upsertCandidateKeys(clusterId, input.record, input.detectedAt, database);

    return {
      ...decision,
      clusterId,
      canonicalEntityId,
      canonicalEntityKey,
    };
  } catch (error) {
    if (missingSchema(error)) return null;
    throw error;
  }
}
