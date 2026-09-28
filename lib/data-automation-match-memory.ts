import { sha256Hex } from "./data-automation.ts";
type Database = Pick<D1Database, "prepare">;

function missingSchema(error: unknown) {
  return /no such table:\s*automation_entity_match_decisions/i.test(error instanceof Error ? error.message : String(error));
}

export async function shouldSuppressAutomationPossibleCandidate(input:{
  observationId:number;
  sourceClusterId:number;
  candidateClusterId:number;
  matchReason:string;
}, database:Database) {
  try {
    const row=await database.prepare(`SELECT o.payload_hash,
        source_cluster.entity_type,
        source_cluster.semantic_kind AS source_semantic_kind,
        target_cluster.semantic_kind AS target_semantic_kind,
        source_cluster.updated_at AS source_cluster_updated_at,
        target_cluster.updated_at AS candidate_cluster_updated_at
      FROM automation_observations o
      JOIN automation_entity_clusters source_cluster ON source_cluster.id=?
      JOIN automation_entity_clusters target_cluster ON target_cluster.id=?
      WHERE o.id=? AND source_cluster.entity_type IN ('DIRECTORY','ORGANIZATION')
        AND target_cluster.entity_type=source_cluster.entity_type
      LIMIT 1`)
      .bind(input.sourceClusterId,input.candidateClusterId,input.observationId)
      .first<Record<string,unknown>>();
    if (!row) return false;

    const current=await database.prepare(`SELECT decision,evidence_fingerprint
      FROM automation_entity_match_decisions
      WHERE source_cluster_id=? AND candidate_cluster_id=? AND is_active=1
      ORDER BY id DESC LIMIT 1`)
      .bind(input.sourceClusterId,input.candidateClusterId)
      .first<{decision:string;evidence_fingerprint:string}>();
    if (!current || current.decision==="DEFER") return false;

    const fingerprint=await sha256Hex({
      entityType:String(row.entity_type),
      sourceClusterId:input.sourceClusterId,
      candidateClusterId:input.candidateClusterId,
      observationPayloadHash:String(row.payload_hash ?? ""),
      matchReason:input.matchReason,
      sourceClusterUpdatedAt:String(row.source_cluster_updated_at ?? ""),
      candidateClusterUpdatedAt:String(row.candidate_cluster_updated_at ?? ""),
    });
    return current.evidence_fingerprint===fingerprint;
  } catch (error) {
    if (missingSchema(error)) return false;
    throw error;
  }
}
