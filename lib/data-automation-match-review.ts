import { env } from "cloudflare:workers";
import { sha256Hex, stableJson } from "./data-automation";
import { automationSemanticKindsCompatible, type AutomationSemanticKind } from "./data-automation-identity";

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };

export const automationMatchReviewDecisions = ["SAME_ENTITY","DIFFERENT_ENTITY","RELATIONSHIP_ONLY","DEFER"] as const;
export type AutomationMatchReviewDecision = (typeof automationMatchReviewDecisions)[number];

export class AutomationMatchReviewConflictError extends Error {}
export class AutomationMatchReviewSemanticError extends Error {}

function database(input?: Database) {
  if (input?.prepare) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare) return bound;
  throw new Error("Data automation nemá pripojenú databázu.");
}
function missingSchema(error: unknown) {
  return /no such table:\s*automation_entity_match_decisions/i.test(error instanceof Error ? error.message : String(error));
}
function parseJson(value: unknown) {
  try { return JSON.parse(String(value ?? "null")); } catch { return null; }
}
function semanticCompatible(entityType: "DIRECTORY"|"ORGANIZATION", left: AutomationSemanticKind, right: AutomationSemanticKind) {
  return left === right || automationSemanticKindsCompatible(entityType, left, right);
}

type PairContext = {
  observationId: number;
  sourceClusterId: number;
  candidateClusterId: number;
  entityType: "DIRECTORY"|"ORGANIZATION";
  sourceSemanticKind: AutomationSemanticKind;
  targetSemanticKind: AutomationSemanticKind;
  matchReason: string;
  observationPayloadHash: string;
  sourceClusterUpdatedAt: string;
  candidateClusterUpdatedAt: string;
  sourceId: number;
  sourceLabel: string;
  sourceRole: string;
  sourceAuthority: number;
};

async function pairContext(observationId: number, candidateClusterId: number, db: Database): Promise<PairContext | null> {
  const row = await db.prepare(`SELECT
      mc.observation_id,
      source_cluster.id AS source_cluster_id,
      mc.candidate_cluster_id,
      source_cluster.entity_type,
      source_cluster.semantic_kind AS source_semantic_kind,
      target_cluster.semantic_kind AS target_semantic_kind,
      mc.match_reason,
      o.payload_hash,
      source_cluster.updated_at AS source_cluster_updated_at,
      target_cluster.updated_at AS candidate_cluster_updated_at,
      s.id AS source_id,
      s.label AS source_label,
      COALESCE(a.source_role,'UNKNOWN') AS source_role,
      COALESCE(a.authority_score,50) AS source_authority
    FROM automation_cluster_match_candidates mc
    JOIN automation_cluster_observations co ON co.observation_id=mc.observation_id
    JOIN automation_entity_clusters source_cluster ON source_cluster.id=co.cluster_id
    JOIN automation_entity_clusters target_cluster ON target_cluster.id=mc.candidate_cluster_id
    JOIN automation_observations o ON o.id=mc.observation_id
    JOIN automation_sources s ON s.id=o.source_id
    LEFT JOIN automation_source_authority a ON a.source_id=s.id
    WHERE mc.observation_id=? AND mc.candidate_cluster_id=? AND mc.match_quality='POSSIBLE'
      AND source_cluster.entity_type IN ('DIRECTORY','ORGANIZATION')
      AND target_cluster.entity_type=source_cluster.entity_type
    LIMIT 1`).bind(observationId,candidateClusterId).first<Record<string,unknown>>();
  if (!row) return null;
  return {
    observationId:Number(row.observation_id),
    sourceClusterId:Number(row.source_cluster_id),
    candidateClusterId:Number(row.candidate_cluster_id),
    entityType:String(row.entity_type) as "DIRECTORY"|"ORGANIZATION",
    sourceSemanticKind:String(row.source_semantic_kind ?? "UNKNOWN") as AutomationSemanticKind,
    targetSemanticKind:String(row.target_semantic_kind ?? "UNKNOWN") as AutomationSemanticKind,
    matchReason:String(row.match_reason ?? ""),
    observationPayloadHash:String(row.payload_hash ?? ""),
    sourceClusterUpdatedAt:String(row.source_cluster_updated_at ?? ""),
    candidateClusterUpdatedAt:String(row.candidate_cluster_updated_at ?? ""),
    sourceId:Number(row.source_id),
    sourceLabel:String(row.source_label ?? ""),
    sourceRole:String(row.source_role ?? "UNKNOWN"),
    sourceAuthority:Number(row.source_authority ?? 50),
  };
}

async function evidenceFingerprint(context: PairContext) {
  return sha256Hex({
    entityType: context.entityType,
    sourceClusterId: context.sourceClusterId,
    candidateClusterId: context.candidateClusterId,
    observationPayloadHash: context.observationPayloadHash,
    matchReason: context.matchReason,
    sourceClusterUpdatedAt: context.sourceClusterUpdatedAt,
    candidateClusterUpdatedAt: context.candidateClusterUpdatedAt,
  });
}

async function clusterEvidence(clusterId: number, db: Database) {
  const rows = await db.prepare(`SELECT e.field_name,e.raw_value_json,e.normalized_value,e.is_preferred,
      e.source_role,e.authority_score,e.confidence,s.label AS source_label
    FROM automation_field_evidence e JOIN automation_sources s ON s.id=e.source_id
    WHERE e.cluster_id=? AND e.is_current=1
    ORDER BY e.field_name,e.is_preferred DESC,e.authority_score DESC,e.confidence DESC,e.id ASC`)
    .bind(clusterId).all<Record<string,unknown>>();
  return rows.results.map(row=>({
    fieldName:String(row.field_name ?? ""),
    rawValue:parseJson(row.raw_value_json),
    normalizedValue:String(row.normalized_value ?? ""),
    preferred:Boolean(row.is_preferred),
    sourceLabel:String(row.source_label ?? ""),
    sourceRole:String(row.source_role ?? "UNKNOWN"),
    authorityScore:Number(row.authority_score ?? 50),
    confidence:Number(row.confidence ?? 75),
  }));
}

async function activeDecision(sourceClusterId:number,candidateClusterId:number,db:Database) {
  try {
    return await db.prepare(`SELECT * FROM automation_entity_match_decisions
      WHERE source_cluster_id=? AND candidate_cluster_id=? AND is_active=1
      ORDER BY id DESC LIMIT 1`).bind(sourceClusterId,candidateClusterId).first<Record<string,unknown>>();
  } catch (error) {
    if (missingSchema(error)) return null;
    throw error;
  }
}

export async function shouldSuppressAutomationPossibleCandidate(input:{
  observationId:number; sourceClusterId:number; candidateClusterId:number; matchReason:string;
}, dbInput:Database) {
  const db=database(dbInput);
  try {
    const row=await db.prepare(`SELECT o.payload_hash,s.id AS source_id,s.label AS source_label,
        source_cluster.entity_type,source_cluster.semantic_kind AS source_semantic_kind,
        target_cluster.semantic_kind AS target_semantic_kind,
        source_cluster.updated_at AS source_cluster_updated_at,target_cluster.updated_at AS candidate_cluster_updated_at,
        COALESCE(a.source_role,'UNKNOWN') AS source_role,COALESCE(a.authority_score,50) AS source_authority
      FROM automation_observations o
      JOIN automation_sources s ON s.id=o.source_id
      JOIN automation_entity_clusters source_cluster ON source_cluster.id=?
      JOIN automation_entity_clusters target_cluster ON target_cluster.id=?
      LEFT JOIN automation_source_authority a ON a.source_id=s.id
      WHERE o.id=? AND source_cluster.entity_type IN ('DIRECTORY','ORGANIZATION')
        AND target_cluster.entity_type=source_cluster.entity_type LIMIT 1`)
      .bind(input.sourceClusterId,input.candidateClusterId,input.observationId).first<Record<string,unknown>>();
    if (!row) return false;
    const context:PairContext={
      observationId:input.observationId,sourceClusterId:input.sourceClusterId,candidateClusterId:input.candidateClusterId,
      entityType:String(row.entity_type) as "DIRECTORY"|"ORGANIZATION",
      sourceSemanticKind:String(row.source_semantic_kind ?? "UNKNOWN") as AutomationSemanticKind,
      targetSemanticKind:String(row.target_semantic_kind ?? "UNKNOWN") as AutomationSemanticKind,
      matchReason:input.matchReason,observationPayloadHash:String(row.payload_hash ?? ""),
      sourceClusterUpdatedAt:String(row.source_cluster_updated_at ?? ""),candidateClusterUpdatedAt:String(row.candidate_cluster_updated_at ?? ""),
      sourceId:Number(row.source_id),sourceLabel:String(row.source_label ?? ""),sourceRole:String(row.source_role ?? "UNKNOWN"),sourceAuthority:Number(row.source_authority ?? 50),
    };
    const current=await activeDecision(context.sourceClusterId,context.candidateClusterId,db);
    if (!current || String(current.decision)==="DEFER") return false;
    const fingerprint=await evidenceFingerprint(context);
    return String(current.evidence_fingerprint)===fingerprint;
  } catch (error) {
    if (missingSchema(error)) return false;
    throw error;
  }
}

export async function getAutomationPossibleMatchReviewDetail(observationId:number,candidateClusterId:number,dbInput?:Database) {
  const db=database(dbInput);
  const context=await pairContext(observationId,candidateClusterId,db);
  if (!context) return null;
  const fingerprint=await evidenceFingerprint(context);
  const [sourceEvidence,targetEvidence,historyResult,current]=await Promise.all([
    clusterEvidence(context.sourceClusterId,db),
    clusterEvidence(context.candidateClusterId,db),
    db.prepare(`SELECT id,decision,reviewer,note,evidence_fingerprint,previous_decision_id,decision_version,created_at
      FROM automation_entity_match_decisions
      WHERE source_cluster_id=? AND candidate_cluster_id=?
      ORDER BY id DESC`).bind(context.sourceClusterId,context.candidateClusterId).all<Record<string,unknown>>().catch((error)=> {
        if (missingSchema(error)) return {results:[]}; throw error;
      }),
    activeDecision(context.sourceClusterId,context.candidateClusterId,db),
  ]);
  const conflicts = sourceEvidence.filter(left => targetEvidence.some(right =>
    right.fieldName===left.fieldName && right.normalizedValue && left.normalizedValue && right.normalizedValue!==left.normalizedValue
  )).map(item=>item.fieldName).filter((value,index,array)=>array.indexOf(value)===index);
  return {
    ...context,
    evidenceFingerprint:fingerprint,
    sourceEvidence,
    targetEvidence,
    conflicts,
    semanticCompatible:semanticCompatible(context.entityType,context.sourceSemanticKind,context.targetSemanticKind),
    currentDecision: current ? {
      id:Number(current.id), decision:String(current.decision) as AutomationMatchReviewDecision,
      evidenceFingerprint:String(current.evidence_fingerprint), reviewer:String(current.reviewer),
      note:current.note==null?null:String(current.note), version:Number(current.decision_version),
      createdAt:String(current.created_at),
    } : null,
    history:historyResult.results.map(row=>({
      id:Number(row.id),decision:String(row.decision),reviewer:String(row.reviewer),
      note:row.note==null?null:String(row.note),evidenceFingerprint:String(row.evidence_fingerprint),
      previousDecisionId:row.previous_decision_id==null?null:Number(row.previous_decision_id),
      version:Number(row.decision_version),createdAt:String(row.created_at),
    })),
  };
}

export async function listAutomationPossibleMatchReviews(input?:{
  status?:"unresolved"|"deferred"|"resolved"|"all";
  entityType?:"DIRECTORY"|"ORGANIZATION";
  sourceId?:number;
  minAuthority?:number;
  maxAgeDays?:number;
  limit?:number;
},dbInput?:Database) {
  const db=database(dbInput);
  const limit=Math.max(1,Math.min(200,input?.limit ?? 100));
  try {
    const rows=await db.prepare(`SELECT mc.observation_id,mc.candidate_cluster_id,mc.match_reason,mc.created_at,
      source_cluster.id AS source_cluster_id,source_cluster.entity_type,
      source_cluster.semantic_kind AS source_semantic_kind,target_cluster.semantic_kind AS target_semantic_kind,
      o.payload_hash,s.id AS source_id,s.label AS source_label,COALESCE(a.source_role,'UNKNOWN') AS source_role,
      COALESCE(a.authority_score,50) AS source_authority,
      d.id AS decision_id,d.decision,d.evidence_fingerprint AS decision_fingerprint,d.reviewer,d.created_at AS decision_created_at
    FROM automation_cluster_match_candidates mc
    JOIN automation_cluster_observations co ON co.observation_id=mc.observation_id
    JOIN automation_entity_clusters source_cluster ON source_cluster.id=co.cluster_id
    JOIN automation_entity_clusters target_cluster ON target_cluster.id=mc.candidate_cluster_id
    JOIN automation_observations o ON o.id=mc.observation_id
    JOIN automation_sources s ON s.id=o.source_id
    LEFT JOIN automation_source_authority a ON a.source_id=s.id
    LEFT JOIN automation_entity_match_decisions d ON d.source_cluster_id=source_cluster.id
      AND d.candidate_cluster_id=mc.candidate_cluster_id AND d.is_active=1
    WHERE mc.match_quality='POSSIBLE' AND source_cluster.entity_type IN ('DIRECTORY','ORGANIZATION')
      AND (? IS NULL OR source_cluster.entity_type=?)
      AND (? IS NULL OR s.id=?)
    ORDER BY mc.created_at ASC,mc.observation_id ASC,mc.candidate_cluster_id ASC LIMIT ?`)
      .bind(input?.entityType ?? null,input?.entityType ?? null,input?.sourceId ?? null,input?.sourceId ?? null,limit).all<Record<string,unknown>>();
    const mapped=[];
    for (const row of rows.results) {
      const context:PairContext={
        observationId:Number(row.observation_id),sourceClusterId:Number(row.source_cluster_id),
        candidateClusterId:Number(row.candidate_cluster_id),entityType:String(row.entity_type) as "DIRECTORY"|"ORGANIZATION",
        sourceSemanticKind:String(row.source_semantic_kind ?? "UNKNOWN") as AutomationSemanticKind,
        targetSemanticKind:String(row.target_semantic_kind ?? "UNKNOWN") as AutomationSemanticKind,
        matchReason:String(row.match_reason ?? ""),observationPayloadHash:String(row.payload_hash ?? ""),
        sourceClusterUpdatedAt:"",candidateClusterUpdatedAt:"",sourceId:Number(row.source_id),sourceLabel:String(row.source_label ?? ""),
        sourceRole:String(row.source_role ?? "UNKNOWN"),sourceAuthority:Number(row.source_authority ?? 50),
      };
      const full=await pairContext(context.observationId,context.candidateClusterId,db);
      if (!full) continue;
      const fingerprint=await evidenceFingerprint(full);
      const decision=row.decision==null?null:String(row.decision) as AutomationMatchReviewDecision;
      const sameEvidence=decision!=null && String(row.decision_fingerprint ?? "")===fingerprint;
      const status = decision==="DEFER" && sameEvidence ? "deferred" : decision && sameEvidence ? "resolved" : "unresolved";
      if (input?.status && input.status!=="all" && input.status!==status) continue;
      if (input?.minAuthority!=null && full.sourceAuthority<input.minAuthority) continue;
      if (input?.maxAgeDays!=null) {
        const created=Date.parse(String(row.created_at ?? ""));
        if (Number.isFinite(created) && Date.now()-created > input.maxAgeDays*86_400_000) continue;
      }
      mapped.push({...full,evidenceFingerprint:fingerprint,status,decision,decisionId:row.decision_id==null?null:Number(row.decision_id),
        reviewer:row.reviewer==null?null:String(row.reviewer),decisionCreatedAt:row.decision_created_at==null?null:String(row.decision_created_at)});
    }
    return mapped;
  } catch (error) {
    if (missingSchema(error)) return [];
    throw error;
  }
}

export async function reviewAutomationPossibleMatch(input:{
  observationId:number; candidateClusterId:number; decision:AutomationMatchReviewDecision;
  reviewer:string; note?:string|null; expectedDecisionId?:number|null; expectedEvidenceFingerprint:string;
  now?:Date;
},dbInput?:Database) {
  const db=database(dbInput);
  const detail=await getAutomationPossibleMatchReviewDetail(input.observationId,input.candidateClusterId,db);
  if (!detail) return null;
  if (detail.evidenceFingerprint!==input.expectedEvidenceFingerprint) {
    throw new AutomationMatchReviewConflictError("Dôkazy sa od otvorenia review zmenili. Obnov detail a rozhodni znova.");
  }
  const current=detail.currentDecision;
  if ((current?.id ?? null)!==(input.expectedDecisionId ?? null)) {
    throw new AutomationMatchReviewConflictError("Tento POSSIBLE match už medzitým posúdil iný admin. Obnov detail.");
  }
  if (input.decision==="SAME_ENTITY" && !detail.semanticCompatible) {
    throw new AutomationMatchReviewSemanticError(`SAME_ENTITY nie je dovolené pre ${detail.sourceSemanticKind} ↔ ${detail.targetSemanticKind}. Použi RELATIONSHIP_ONLY alebo DIFFERENT_ENTITY.`);
  }
  if (current?.decision===input.decision && current.evidenceFingerprint===detail.evidenceFingerprint) return detail;

  const now=(input.now ?? new Date()).toISOString();
  const note=input.note?.trim().slice(0,2000) || null;
  const snapshot=stableJson({
    matchReason:detail.matchReason,sourceSemanticKind:detail.sourceSemanticKind,targetSemanticKind:detail.targetSemanticKind,
    sourceRole:detail.sourceRole,sourceAuthority:detail.sourceAuthority,conflicts:detail.conflicts,
    sourceEvidence:detail.sourceEvidence,targetEvidence:detail.targetEvidence,
  });
  const nextVersion=(current?.version ?? 0)+1;
  if (current) {
    const changed=await db.prepare("UPDATE automation_entity_match_decisions SET is_active=0 WHERE id=? AND is_active=1")
      .bind(current.id).run();
    if ((changed.meta?.changes ?? 0)!==1) throw new AutomationMatchReviewConflictError("Rozhodnutie sa zmenilo súbežne. Obnov detail.");
  }
  await db.prepare(`INSERT INTO automation_entity_match_decisions
    (observation_id,source_cluster_id,candidate_cluster_id,entity_type,source_semantic_kind,target_semantic_kind,
     decision,match_reason,evidence_fingerprint,evidence_snapshot_json,reviewer,note,previous_decision_id,decision_version,is_active,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)`).bind(
      detail.observationId,detail.sourceClusterId,detail.candidateClusterId,detail.entityType,
      detail.sourceSemanticKind,detail.targetSemanticKind,input.decision,detail.matchReason,detail.evidenceFingerprint,
      snapshot,input.reviewer,note,current?.id ?? null,nextVersion,now
    ).run();
  return getAutomationPossibleMatchReviewDetail(input.observationId,input.candidateClusterId,db);
}
