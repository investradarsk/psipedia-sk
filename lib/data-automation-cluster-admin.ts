import { env } from "cloudflare:workers";
import type { AutomationSource } from "./data-automation";

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

export type AutomationClusterSummary = {
  id: number;
  entityType: AutomationSource["entityType"];
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  sourceCount: number;
  observationCount: number;
  openFindingCount: number;
  openConflictCount: number;
  possibleMatchCount: number;
  updatedAt: string;
  title: string;
};

export type AutomationClusterSource = {
  id: number;
  label: string;
  sourceUrl: string | null;
  sourceRole: string;
  authorityScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  fields: string[];
};

export type AutomationClusterEvidence = {
  id: number;
  observationId: number;
  sourceId: number;
  sourceLabel: string;
  sourceRecordId: string;
  fieldName: string;
  rawValue: unknown;
  normalizedValue: string;
  sourceRole: string;
  authorityScore: number;
  confidence: number;
  isCurrent: boolean;
  isPreferred: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type AutomationClusterConflict = {
  id: number;
  fieldName: string;
  impact: "NORMAL" | "HIGH";
  status: "OPEN" | "RESOLVED";
  selectedEvidenceId: number | null;
  detectedAt: string;
  updatedAt: string;
};

export type AutomationClusterFinding = {
  id: number;
  findingType: string;
  reviewStatus: string;
  reason: string;
  sourceLabel: string;
  lastDetectedAt: string;
};

export type AutomationPossibleMatch = {
  observationId: number;
  candidateClusterId: number;
  matchQuality: string;
  matchReason: string;
  createdAt: string;
};

export type AutomationClusterDetail = AutomationClusterSummary & {
  sources: AutomationClusterSource[];
  evidence: AutomationClusterEvidence[];
  conflicts: AutomationClusterConflict[];
  findings: AutomationClusterFinding[];
  possibleMatches: AutomationPossibleMatch[];
};

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Data automation nemá pripojenú databázu.");
}

function isMissingSchema(error: unknown) {
  return /no such table: automation_(entity_clusters|cluster_|field_evidence|field_conflicts|source_authority)/i.test(
    error instanceof Error ? error.message : String(error),
  );
}

function placeholders(values: readonly number[]) {
  return values.map(() => "?").join(",");
}

function parseJson(value: unknown) {
  try { return JSON.parse(String(value ?? "null")); } catch { return value == null ? null : String(value); }
}

function displayValue(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(value);
}

function pickTitle(clusterId: number, evidence: EvidenceInternal[]) {
  for (const field of ["title", "name"]) {
    const candidates = evidence
      .filter((item) => item.clusterId === clusterId && item.fieldName === field && item.isCurrent)
      .sort((a, b) => Number(b.isPreferred) - Number(a.isPreferred) || b.authorityScore - a.authorityScore || b.confidence - a.confidence);
    const value = candidates.map((item) => displayValue(item.rawValue)).find(Boolean);
    if (value) return value;
  }
  return "Logická entita #" + clusterId;
}

type EvidenceInternal = AutomationClusterEvidence & { clusterId: number };

function mapEvidence(row: Record<string, unknown>): EvidenceInternal {
  return {
    clusterId: Number(row.cluster_id),
    id: Number(row.id),
    observationId: Number(row.observation_id),
    sourceId: Number(row.source_id),
    sourceLabel: String(row.source_label ?? ""),
    sourceRecordId: String(row.source_record_id ?? ""),
    fieldName: String(row.field_name ?? ""),
    rawValue: parseJson(row.raw_value_json),
    normalizedValue: String(row.normalized_value ?? ""),
    sourceRole: String(row.source_role ?? "UNKNOWN"),
    authorityScore: Number(row.authority_score ?? 50),
    confidence: Number(row.confidence ?? 75),
    isCurrent: Boolean(row.is_current),
    isPreferred: Boolean(row.is_preferred),
    firstSeenAt: String(row.first_seen_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? ""),
  };
}

export async function listAutomationClusterSummaries(input: {
  sourceIds: number[];
  entityTypes: AutomationSource["entityType"][];
  limit?: number;
}, databaseInput?: Database): Promise<AutomationClusterSummary[]> {
  if (!input.sourceIds.length || !input.entityTypes.length) return [];
  const db = database(databaseInput);
  const limit = Math.max(1, Math.min(100, input.limit ?? 50));
  const sourceSql = placeholders(input.sourceIds);
  const typeSql = input.entityTypes.map(() => "?").join(",");
  try {
    const result = await db.prepare(`SELECT c.id,c.entity_type,c.canonical_entity_id,c.canonical_entity_key,c.updated_at,
      COUNT(DISTINCT sr.source_id) AS source_count,
      COUNT(DISTINCT co.observation_id) AS observation_count,
      COUNT(DISTINCT CASE WHEN f.review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED') THEN cf.finding_id END) AS open_finding_count,
      COUNT(DISTINCT CASE WHEN fc.status='OPEN' THEN fc.id END) AS open_conflict_count,
      COUNT(DISTINCT CASE WHEN mc.match_quality='POSSIBLE' THEN mc.observation_id || ':' || mc.candidate_cluster_id END) AS possible_match_count
      FROM automation_entity_clusters c
      JOIN automation_cluster_source_records sr ON sr.cluster_id=c.id AND sr.source_id IN (${sourceSql})
      LEFT JOIN automation_cluster_observations co ON co.cluster_id=c.id
      LEFT JOIN automation_cluster_findings cf ON cf.cluster_id=c.id
      LEFT JOIN automation_findings f ON f.id=cf.finding_id
      LEFT JOIN automation_field_conflicts fc ON fc.cluster_id=c.id
      LEFT JOIN automation_cluster_match_candidates mc ON mc.observation_id IN (
        SELECT co2.observation_id FROM automation_cluster_observations co2 WHERE co2.cluster_id=c.id
      )
      WHERE c.entity_type IN (${typeSql})
      GROUP BY c.id
      ORDER BY c.updated_at DESC,c.id DESC LIMIT ?`)
      .bind(...input.sourceIds, ...input.entityTypes, limit).all<Record<string, unknown>>();
    if (!result.results.length) return [];
    const ids = result.results.map((row) => Number(row.id));
    const evidenceResult = await db.prepare(`SELECT e.*,s.label AS source_label FROM automation_field_evidence e
      JOIN automation_sources s ON s.id=e.source_id
      WHERE e.cluster_id IN (${placeholders(ids)}) AND e.field_name IN ('title','name') AND e.is_current=1`)
      .bind(...ids).all<Record<string, unknown>>();
    const evidence = evidenceResult.results.map(mapEvidence);
    return result.results.map((row) => ({
      id: Number(row.id),
      entityType: row.entity_type as AutomationSource["entityType"],
      canonicalEntityId: row.canonical_entity_id == null ? null : Number(row.canonical_entity_id),
      canonicalEntityKey: row.canonical_entity_key == null ? null : String(row.canonical_entity_key),
      sourceCount: Number(row.source_count ?? 0),
      observationCount: Number(row.observation_count ?? 0),
      openFindingCount: Number(row.open_finding_count ?? 0),
      openConflictCount: Number(row.open_conflict_count ?? 0),
      possibleMatchCount: Number(row.possible_match_count ?? 0),
      updatedAt: String(row.updated_at ?? ""),
      title: pickTitle(Number(row.id), evidence),
    }));
  } catch (error) {
    if (isMissingSchema(error)) return [];
    throw error;
  }
}

export async function getAutomationClusterDetail(id: number, databaseInput?: Database): Promise<AutomationClusterDetail | null> {
  const db = database(databaseInput);
  try {
    const cluster = await db.prepare(`SELECT c.id,c.entity_type,c.canonical_entity_id,c.canonical_entity_key,c.updated_at,
      (SELECT COUNT(DISTINCT source_id) FROM automation_cluster_source_records WHERE cluster_id=c.id) AS source_count,
      (SELECT COUNT(*) FROM automation_cluster_observations WHERE cluster_id=c.id) AS observation_count,
      (SELECT COUNT(*) FROM automation_cluster_findings cf JOIN automation_findings f ON f.id=cf.finding_id
        WHERE cf.cluster_id=c.id AND f.review_status IN ('NEW','IN_REVIEW','SUPPRESSED','APPROVED')) AS open_finding_count,
      (SELECT COUNT(*) FROM automation_field_conflicts WHERE cluster_id=c.id AND status='OPEN') AS open_conflict_count
      FROM automation_entity_clusters c WHERE c.id=? LIMIT 1`).bind(id).first<Record<string, unknown>>();
    if (!cluster) return null;

    const statements = [
      db.prepare(`SELECT sr.source_id,s.label,s.source_url,COALESCE(a.source_role,'UNKNOWN') AS source_role,
        COALESCE(a.authority_score,50) AS authority_score,MIN(sr.first_seen_at) AS first_seen_at,MAX(sr.last_seen_at) AS last_seen_at
        FROM automation_cluster_source_records sr
        JOIN automation_sources s ON s.id=sr.source_id
        LEFT JOIN automation_source_authority a ON a.source_id=sr.source_id
        WHERE sr.cluster_id=? GROUP BY sr.source_id,s.label,s.source_url,a.source_role,a.authority_score
        ORDER BY last_seen_at DESC,s.label ASC`).bind(id),
      db.prepare(`SELECT e.*,s.label AS source_label FROM automation_field_evidence e
        JOIN automation_sources s ON s.id=e.source_id WHERE e.cluster_id=?
        ORDER BY e.field_name ASC,e.is_current DESC,e.is_preferred DESC,e.authority_score DESC,e.confidence DESC,e.last_seen_at DESC`).bind(id),
      db.prepare(`SELECT id,field_name,impact,status,selected_evidence_id,detected_at,updated_at
        FROM automation_field_conflicts WHERE cluster_id=? ORDER BY CASE impact WHEN 'HIGH' THEN 0 ELSE 1 END,status ASC,updated_at DESC`).bind(id),
      db.prepare(`SELECT f.id,f.finding_type,f.review_status,f.reason,s.label AS source_label,f.last_detected_at
        FROM automation_cluster_findings cf JOIN automation_findings f ON f.id=cf.finding_id
        JOIN automation_sources s ON s.id=f.source_id WHERE cf.cluster_id=?
        ORDER BY CASE f.review_status WHEN 'NEW' THEN 0 WHEN 'IN_REVIEW' THEN 1 ELSE 2 END,f.last_detected_at DESC`).bind(id),
      db.prepare(`SELECT mc.observation_id,mc.candidate_cluster_id,mc.match_quality,mc.match_reason,mc.created_at
        FROM automation_cluster_match_candidates mc
        JOIN automation_cluster_observations co ON co.observation_id=mc.observation_id
        WHERE co.cluster_id=? ORDER BY mc.created_at DESC`).bind(id),
    ];
    const [sourceRows,evidenceRows,conflictRows,findingRows,matchRows] = await db.batch(statements);
    const evidence = (evidenceRows.results ?? []).map(mapEvidence);
    const sources = (sourceRows.results ?? []).map((row) => {
      const sourceId = Number(row.source_id);
      return {
        id: sourceId,
        label: String(row.label ?? ""),
        sourceUrl: row.source_url == null ? null : String(row.source_url),
        sourceRole: String(row.source_role ?? "UNKNOWN"),
        authorityScore: Number(row.authority_score ?? 50),
        firstSeenAt: String(row.first_seen_at ?? ""),
        lastSeenAt: String(row.last_seen_at ?? ""),
        fields: Array.from(new Set(evidence.filter((item) => item.sourceId === sourceId && item.isCurrent).map((item) => item.fieldName))),
      };
    });
    const possibleMatches = (matchRows.results ?? []).map((row) => ({
      observationId: Number(row.observation_id),
      candidateClusterId: Number(row.candidate_cluster_id),
      matchQuality: String(row.match_quality ?? ""),
      matchReason: String(row.match_reason ?? ""),
      createdAt: String(row.created_at ?? ""),
    }));
    const summaryEvidence = evidence as EvidenceInternal[];
    return {
      id: Number(cluster.id),
      entityType: cluster.entity_type as AutomationSource["entityType"],
      canonicalEntityId: cluster.canonical_entity_id == null ? null : Number(cluster.canonical_entity_id),
      canonicalEntityKey: cluster.canonical_entity_key == null ? null : String(cluster.canonical_entity_key),
      sourceCount: Number(cluster.source_count ?? 0),
      observationCount: Number(cluster.observation_count ?? 0),
      openFindingCount: Number(cluster.open_finding_count ?? 0),
      openConflictCount: Number(cluster.open_conflict_count ?? 0),
      possibleMatchCount: possibleMatches.length,
      updatedAt: String(cluster.updated_at ?? ""),
      title: pickTitle(id, summaryEvidence),
      sources,
      evidence: evidence.map(({ clusterId: _clusterId, ...item }) => item),
      conflicts: (conflictRows.results ?? []).map((row) => ({
        id: Number(row.id),
        fieldName: String(row.field_name ?? ""),
        impact: String(row.impact ?? "NORMAL") as "NORMAL" | "HIGH",
        status: String(row.status ?? "OPEN") as "OPEN" | "RESOLVED",
        selectedEvidenceId: row.selected_evidence_id == null ? null : Number(row.selected_evidence_id),
        detectedAt: String(row.detected_at ?? ""),
        updatedAt: String(row.updated_at ?? ""),
      })),
      findings: (findingRows.results ?? []).map((row) => ({
        id: Number(row.id),
        findingType: String(row.finding_type ?? ""),
        reviewStatus: String(row.review_status ?? ""),
        reason: String(row.reason ?? ""),
        sourceLabel: String(row.source_label ?? ""),
        lastDetectedAt: String(row.last_detected_at ?? ""),
      })),
      possibleMatches,
    };
  } catch (error) {
    if (isMissingSchema(error)) return null;
    throw error;
  }
}
