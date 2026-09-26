import { env } from "cloudflare:workers";
import { sha256Hex, stableJson } from "./data-automation";
import { getAutomationPossibleMatchReviewDetail } from "./data-automation-match-review";
import { mergeDirectoryPublicContactData, readDirectoryPublicContacts } from "./directory-profile-metadata";

type Database = Pick<D1Database, "prepare" | "batch">;
type RuntimeBindings = { DB?: D1Database };
type EntityType = "DIRECTORY" | "ORGANIZATION";

export const canonicalFieldApplyActions = ["KEEP_CANONICAL", "APPLY_INCOMING", "SKIP"] as const;
export type CanonicalFieldApplyAction = (typeof canonicalFieldApplyActions)[number];

export type CanonicalFieldSelection = {
  fieldName: string;
  action: CanonicalFieldApplyAction;
  evidenceId?: number | null;
  confirmConflict?: boolean;
};

type EvidenceRow = {
  id: number;
  cluster_id: number;
  observation_id: number;
  source_id: number;
  source_record_id: string;
  field_name: string;
  raw_value_json: string;
  normalized_value: string;
  source_role: string;
  authority_score: number;
  confidence: number;
  is_preferred: number;
  source_label: string;
};

type ConflictRow = {
  field_name: string;
  impact: "NORMAL" | "HIGH";
  selected_evidence_id: number | null;
  values_fingerprint: string;
};

type CanonicalTarget = {
  sourceClusterId: number;
  targetClusterId: number;
  canonicalEntityId: number;
  canonicalEntityKey: string | null;
  entityType: EntityType;
  sourceSemanticKind: string;
  targetSemanticKind: string;
};

type ApplyField = {
  fieldName: string;
  canonicalField: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  normalizedValue: string;
  evidenceId: number;
  observationId: number;
  sourceId: number;
  sourceRecordId: string;
  sourceLabel: string;
  sourceRole: string;
  authorityScore: number;
  confidence: number;
  highImpact: boolean;
  applyable: boolean;
  blocker: string | null;
  conflict: null | {
    impact: "NORMAL" | "HIGH";
    selectedEvidenceId: number | null;
    valuesFingerprint: string;
  };
};

export type CanonicalApplyPreview = {
  eligible: boolean;
  blockers: string[];
  entityType: EntityType;
  sourceClusterId: number;
  targetClusterId: number;
  canonicalEntityId: number | null;
  canonicalEntityKey: string | null;
  canonicalUpdatedAt: string | null;
  reviewDecisionId: number | null;
  reviewDecisionVersion: number | null;
  evidenceFingerprint: string;
  fields: ApplyField[];
};

export class CanonicalApplyConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalApplyConflictError";
  }
}
export class CanonicalApplyBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalApplyBlockedError";
  }
}
export class CanonicalApplyUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CanonicalApplyUnsupportedError";
  }
}

function database(input?: Database) {
  if (input?.prepare && input.batch) return input;
  const bound = (env as unknown as RuntimeBindings).DB;
  if (bound?.prepare && bound.batch) return bound;
  throw new Error("Data automation nemá pripojenú databázu.");
}

function parseJson(value: unknown) {
  try { return JSON.parse(String(value ?? "null")); } catch { return null; }
}
function parseObject(value: unknown): Record<string, unknown> {
  const parsed = parseJson(value);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
}
function text(value: unknown) {
  return value == null ? "" : String(value).trim();
}
function isArchived(row: Record<string, unknown>) {
  return Boolean(row.archived_at) || String(row.status ?? "").toUpperCase() === "ARCHIVED";
}
function organizationRootSemantic(kind: string) {
  return kind === "LEGAL_ORGANIZATION" || kind === "PUBLIC_ORGANIZATION" || kind === "RESCUE_GROUP";
}
function highImpact(entityType: EntityType, fieldName: string) {
  if (entityType === "DIRECTORY") {
    return ["name","category","municipality","street","houseNumber","postalCode","ico","registryId","registryNamespace","active","status"].includes(fieldName);
  }
  return ["organizationName","ico","registryId","registryNamespace","organizationType","activeStatus","status"].includes(fieldName);
}
function safeWebsite(raw: unknown, normalized: string) {
  const candidate = text(raw);
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return normalized ? `https://${normalized}` : "";
}
function normalizeIco(value: unknown) {
  const digits = text(value).replace(/\D+/g, "");
  return /^\d{8}$/.test(digits) ? digits : "";
}

async function targetContext(
  observationId: number,
  candidateClusterId: number,
  db: Database,
): Promise<CanonicalTarget | null> {
  const row = await db.prepare(`SELECT
      source_cluster.id AS source_cluster_id,
      target_cluster.id AS target_cluster_id,
      source_cluster.entity_type,
      source_cluster.semantic_kind AS source_semantic_kind,
      target_cluster.semantic_kind AS target_semantic_kind,
      source_cluster.canonical_entity_id AS source_canonical_entity_id,
      target_cluster.canonical_entity_id,
      target_cluster.canonical_entity_key
    FROM automation_cluster_match_candidates mc
    JOIN automation_cluster_observations co ON co.observation_id=mc.observation_id
    JOIN automation_entity_clusters source_cluster ON source_cluster.id=co.cluster_id
    JOIN automation_entity_clusters target_cluster ON target_cluster.id=mc.candidate_cluster_id
    WHERE mc.observation_id=? AND mc.candidate_cluster_id=? AND mc.match_quality='POSSIBLE'
      AND source_cluster.entity_type IN ('DIRECTORY','ORGANIZATION')
      AND target_cluster.entity_type=source_cluster.entity_type
    LIMIT 1`).bind(observationId,candidateClusterId).first<Record<string,unknown>>();
  if (!row) return null;
  const canonicalEntityId = Number(row.canonical_entity_id);
  if (!Number.isSafeInteger(canonicalEntityId) || canonicalEntityId < 1) return {
    sourceClusterId:Number(row.source_cluster_id),
    targetClusterId:Number(row.target_cluster_id),
    canonicalEntityId:0,
    canonicalEntityKey:row.canonical_entity_key==null?null:String(row.canonical_entity_key),
    entityType:String(row.entity_type) as EntityType,
    sourceSemanticKind:String(row.source_semantic_kind ?? "UNKNOWN"),
    targetSemanticKind:String(row.target_semantic_kind ?? "UNKNOWN"),
  };
  const sourceCanonical = row.source_canonical_entity_id == null ? null : Number(row.source_canonical_entity_id);
  if (sourceCanonical != null && sourceCanonical !== canonicalEntityId) {
    throw new CanonicalApplyBlockedError("Incoming cluster je už naviazaný na iný canonical záznam; destructive merge nie je v G5 povolený.");
  }
  return {
    sourceClusterId:Number(row.source_cluster_id),
    targetClusterId:Number(row.target_cluster_id),
    canonicalEntityId,
    canonicalEntityKey:row.canonical_entity_key==null?null:String(row.canonical_entity_key),
    entityType:String(row.entity_type) as EntityType,
    sourceSemanticKind:String(row.source_semantic_kind ?? "UNKNOWN"),
    targetSemanticKind:String(row.target_semantic_kind ?? "UNKNOWN"),
  };
}

async function preferredEvidence(clusterId: number, db: Database) {
  const rows = await db.prepare(`SELECT e.id,e.cluster_id,e.observation_id,e.source_id,e.source_record_id,e.field_name,
      e.raw_value_json,e.normalized_value,e.source_role,e.authority_score,e.confidence,e.is_preferred,
      s.label AS source_label
    FROM automation_field_evidence e
    JOIN automation_sources s ON s.id=e.source_id
    WHERE e.cluster_id=? AND e.is_current=1 AND e.is_preferred=1
    ORDER BY e.field_name,e.id`).bind(clusterId).all<EvidenceRow>();
  return rows.results;
}

async function openConflicts(clusterId: number, db: Database) {
  const rows = await db.prepare(`SELECT field_name,impact,selected_evidence_id,values_fingerprint
    FROM automation_field_conflicts
    WHERE cluster_id=? AND status='OPEN'
    ORDER BY field_name`).bind(clusterId).all<ConflictRow>();
  return new Map(rows.results.map(row => [String(row.field_name), row]));
}

async function canonicalRow(target: CanonicalTarget, db: Database) {
  const table = target.entityType === "DIRECTORY" ? "directory_profiles" : "help_organizations";
  return db.prepare(`SELECT * FROM ${table} WHERE id=? LIMIT 1`).bind(target.canonicalEntityId)
    .first<Record<string,unknown>>();
}

function canonicalFieldValue(entityType: EntityType, fieldName: string, row: Record<string,unknown>) {
  if (entityType === "DIRECTORY") {
    const contacts = readDirectoryPublicContacts(parseObject(row.source_data_json) as Record<string,string|number|null>, text(row.website_url));
    switch (fieldName) {
      case "name": return row.name ?? "";
      case "category": return row.category ?? "";
      case "municipality": return row.city ?? "";
      case "street": return row.street ?? "";
      case "houseNumber": return row.house_number ?? "";
      case "postalCode": return row.postal_code ?? "";
      case "phone": return contacts.phone;
      case "email": return contacts.email;
      case "domain": return row.website_url ?? "";
      case "ico": return parseObject(row.source_data_json)["IČO"] ?? "";
      case "registryId": return parseObject(row.source_data_json)["Registry ID"] ?? "";
      case "registryNamespace": return parseObject(row.source_data_json)["Registry namespace"] ?? "";
      case "active":
      case "status": return row.status ?? "";
      default: return null;
    }
  }
  switch (fieldName) {
    case "organizationName": return row.legal_name || row.name || "";
    case "municipality": return row.city ?? "";
    case "domain": return row.website_url ?? "";
    case "phone": return row.public_phone ?? "";
    case "email": return row.public_email ?? "";
    case "ico": return row.registration_number ?? "";
    case "registryId": return parseObject(row.source_data_json)["registryId"] ?? "";
    case "registryNamespace": return parseObject(row.source_data_json)["registryNamespace"] ?? "";
    case "organizationType": return row.type ?? "";
    case "activeStatus":
    case "status": return row.status ?? "";
    case "facilityRegistryId": return parseObject(row.source_data_json)["sourceApprovalNumber"] ?? "";
    case "operatorMeaning": return parseObject(row.source_data_json)["operatorName"] ?? "";
    default: return null;
  }
}

function canonicalFieldName(entityType: EntityType, fieldName: string) {
  if (entityType === "DIRECTORY") {
    return ({
      name:"name",category:"category",municipality:"city",street:"street",houseNumber:"house_number",
      postalCode:"postal_code",phone:"source_data_json.Telefón",email:"source_data_json.E-mail",
      domain:"website_url",ico:"source_data_json.IČO",registryId:"source_data_json.Registry ID",
      registryNamespace:"source_data_json.Registry namespace",
    } as Record<string,string>)[fieldName] ?? null;
  }
  return ({
    organizationName:"legal_name",municipality:"city",domain:"website_url",phone:"public_phone",email:"public_email",
    ico:"registration_number",registryId:"source_data_json.registryId",registryNamespace:"source_data_json.registryNamespace",
    organizationType:"type",
  } as Record<string,string>)[fieldName] ?? null;
}

function fieldBlocker(entityType: EntityType, evidence: EvidenceRow, row: Record<string,unknown>) {
  const fieldName = String(evidence.field_name);
  const raw = parseJson(evidence.raw_value_json);
  if (!text(raw) && raw !== false && raw !== 0) return "EMPTY_INCOMING_NOT_APPLYABLE";
  if (entityType === "DIRECTORY") {
    if (fieldName === "active" || fieldName === "status") return "LIFECYCLE_FIELD_NOT_SUPPORTED";
    if (!canonicalFieldName(entityType,fieldName)) return "FIELD_NOT_SUPPORTED";
    if (["municipality","street","houseNumber","postalCode"].includes(fieldName)) {
      if (String(row.service_address_confirmation ?? "") !== "CONFIRMED_SERVICE_LOCATION" || !String(row.address_format ?? "")) {
        return "SERVICE_ADDRESS_NOT_CONFIRMED";
      }
    }
    if (fieldName === "ico" && !normalizeIco(raw)) return "INVALID_ICO";
    return null;
  }
  if (fieldName === "activeStatus" || fieldName === "status") return "LIFECYCLE_FIELD_NOT_SUPPORTED";
  if (fieldName === "facilityRegistryId" || fieldName === "operatorMeaning") return "FACILITY_EVIDENCE_BLOCKED_ON_ORGANIZATION_ROOT";
  if (!canonicalFieldName(entityType,fieldName)) return "FIELD_NOT_SUPPORTED";
  if (fieldName === "ico" && !normalizeIco(raw)) return "INVALID_ICO";
  if (fieldName === "organizationType" && !["SHELTER","CIVIC_ASSOCIATION","RESCUE_ORGANIZATION","MUNICIPAL_ORGANIZATION","NONPROFIT","OTHER"].includes(text(raw))) {
    return "UNSUPPORTED_ORGANIZATION_TYPE";
  }
  return null;
}

function semanticBlockers(target: CanonicalTarget) {
  if (target.entityType === "DIRECTORY") {
    return target.sourceSemanticKind === "FACILITY_OR_SERVICE_PROFILE" && target.targetSemanticKind === "FACILITY_OR_SERVICE_PROFILE"
      ? [] : ["DIRECTORY_SEMANTIC_KIND_BLOCKED"];
  }
  return organizationRootSemantic(target.sourceSemanticKind) && organizationRootSemantic(target.targetSemanticKind)
    ? [] : ["ORGANIZATION_SEMANTIC_KIND_BLOCKED"];
}

export async function getAutomationCanonicalApplyPreview(input:{
  observationId:number;
  candidateClusterId:number;
}, dbInput?:Database): Promise<CanonicalApplyPreview | null> {
  const db=database(dbInput);
  const review=await getAutomationPossibleMatchReviewDetail(input.observationId,input.candidateClusterId,db);
  if(!review) return null;
  const target=await targetContext(input.observationId,input.candidateClusterId,db);
  if(!target) return null;

  const blockers:string[]=[];
  if(!review.semanticCompatible) blockers.push("SEMANTICALLY_INCOMPATIBLE");
  blockers.push(...semanticBlockers(target));
  if(!review.currentDecision) blockers.push("MISSING_REVIEW_DECISION");
  else {
    if(review.currentDecision.decision!=="SAME_ENTITY") blockers.push(`DECISION_${review.currentDecision.decision}_BLOCKS_APPLY`);
    if(review.currentDecision.evidenceFingerprint!==review.evidenceFingerprint) blockers.push("STALE_REVIEW_DECISION");
  }
  if(target.canonicalEntityId<1) blockers.push("CANONICAL_TARGET_MISSING");

  const row=target.canonicalEntityId>0?await canonicalRow(target,db):null;
  if(target.canonicalEntityId>0&&!row) blockers.push("CANONICAL_TARGET_NOT_FOUND");
  if(row&&isArchived(row)) blockers.push("CANONICAL_TARGET_ARCHIVED");

  const [evidence,conflicts]=await Promise.all([
    preferredEvidence(target.sourceClusterId,db),
    openConflicts(target.sourceClusterId,db),
  ]);
  const fields:ApplyField[] = row ? evidence.map(item=>{
    const fieldName=String(item.field_name);
    const conflict=conflicts.get(fieldName)??null;
    const blocker=fieldBlocker(target.entityType,item,row);
    return {
      fieldName,
      canonicalField:canonicalFieldName(target.entityType,fieldName),
      currentValue:canonicalFieldValue(target.entityType,fieldName,row),
      proposedValue:parseJson(item.raw_value_json),
      normalizedValue:String(item.normalized_value ?? ""),
      evidenceId:Number(item.id),
      observationId:Number(item.observation_id),
      sourceId:Number(item.source_id),
      sourceRecordId:String(item.source_record_id ?? ""),
      sourceLabel:String(item.source_label ?? ""),
      sourceRole:String(item.source_role ?? "UNKNOWN"),
      authorityScore:Number(item.authority_score ?? 50),
      confidence:Number(item.confidence ?? 75),
      highImpact:highImpact(target.entityType,fieldName),
      applyable:!blocker,
      blocker,
      conflict:conflict?{
        impact:conflict.impact,
        selectedEvidenceId:conflict.selected_evidence_id==null?null:Number(conflict.selected_evidence_id),
        valuesFingerprint:String(conflict.values_fingerprint),
      }:null,
    };
  }):[];

  return {
    eligible:blockers.length===0,
    blockers,
    entityType:target.entityType,
    sourceClusterId:target.sourceClusterId,
    targetClusterId:target.targetClusterId,
    canonicalEntityId:target.canonicalEntityId>0?target.canonicalEntityId:null,
    canonicalEntityKey:target.canonicalEntityKey,
    canonicalUpdatedAt:row?String(row.updated_at ?? ""):null,
    reviewDecisionId:review.currentDecision?.id??null,
    reviewDecisionVersion:review.currentDecision?.version??null,
    evidenceFingerprint:review.evidenceFingerprint,
    fields,
  };
}

function normalizedSelections(selections:CanonicalFieldSelection[]) {
  const seen=new Set<string>();
  return selections.map(item=>({
    fieldName:text(item.fieldName),
    action:item.action,
    evidenceId:item.evidenceId==null?null:Number(item.evidenceId),
    confirmConflict:Boolean(item.confirmConflict),
  })).filter(item=>{
    if(!item.fieldName||seen.has(item.fieldName)) return false;
    seen.add(item.fieldName);
    return true;
  }).sort((a,b)=>a.fieldName.localeCompare(b.fieldName));
}

async function applyFingerprint(input:{
  entityType:EntityType;
  canonicalEntityId:number;
  reviewDecisionId:number;
  reviewDecisionVersion:number;
  evidenceFingerprint:string;
  expectedCanonicalUpdatedAt:string;
  selections:CanonicalFieldSelection[];
}) {
  return sha256Hex({
    entityType:input.entityType,
    canonicalEntityId:input.canonicalEntityId,
    reviewDecisionId:input.reviewDecisionId,
    reviewDecisionVersion:input.reviewDecisionVersion,
    evidenceFingerprint:input.evidenceFingerprint,
    expectedCanonicalUpdatedAt:input.expectedCanonicalUpdatedAt,
    selectedFields:normalizedSelections(input.selections),
  });
}

async function existingOperation(fingerprint:string,db:Database) {
  return db.prepare(`SELECT id,status,canonical_entity_id,selected_fields_json,before_json,after_json,applied_by,applied_at
    FROM automation_canonical_apply_operations WHERE apply_fingerprint=? LIMIT 1`).bind(fingerprint)
    .first<Record<string,unknown>>();
}

function setSourceMetadata(sourceData:Record<string,unknown>,key:string,value:unknown) {
  if(value===undefined) return;
  if(value===null||text(value)==="") delete sourceData[key];
  else sourceData[key]=value;
}

function buildMutation(
  preview:CanonicalApplyPreview,
  current:Record<string,unknown>,
  selections:CanonicalFieldSelection[],
  actor:string,
  at:string,
  db:Database,
) {
  const selected=normalizedSelections(selections);
  const fieldMap=new Map(preview.fields.map(field=>[field.fieldName,field]));
  const assignments:string[]=[];
  const args:unknown[]=[];
  const appliedFields:string[]=[];
  const before:Record<string,unknown>={};
  const after:Record<string,unknown>={};
  const provenance:Array<Record<string,unknown>>=[];
  let sourceData=parseObject(current.source_data_json);
  let sourceDataChanged=false;
  let directoryContacts:ReturnType<typeof readDirectoryPublicContacts>|null=null;
  let contactChanged=false;

  for(const choice of selected){
    const field=fieldMap.get(choice.fieldName);
    if(!field) throw new CanonicalApplyUnsupportedError(`Pole ${choice.fieldName} nie je v aktuálnom preview.`);
    before[field.fieldName]=field.currentValue;
    after[field.fieldName]=field.currentValue;
    if(choice.action!=="APPLY_INCOMING") continue;
    if(!field.applyable||field.blocker) throw new CanonicalApplyBlockedError(`${field.fieldName}: ${field.blocker ?? "FIELD_BLOCKED"}`);
    if(choice.evidenceId!==field.evidenceId) throw new CanonicalApplyConflictError(`${field.fieldName}: selected evidence sa zmenila. Obnov preview.`);
    if(field.conflict){
      if(field.conflict.selectedEvidenceId!==field.evidenceId) throw new CanonicalApplyConflictError(`${field.fieldName}: preferred evidence už nie je selected conflict evidence.`);
      if(!choice.confirmConflict) throw new CanonicalApplyBlockedError(`${field.fieldName}: otvorený konflikt vyžaduje explicitné potvrdenie selected evidence.`);
    }
    const raw=field.proposedValue;
    let appliedValue:unknown=raw;
    if(preview.entityType==="DIRECTORY"){
      switch(field.fieldName){
        case "name":
          if(!text(raw)) throw new CanonicalApplyUnsupportedError("Názov nesmie byť prázdny.");
          assignments.push("name=?");args.push(text(raw));appliedValue=text(raw);break;
        case "category":
          if(!text(raw)) throw new CanonicalApplyUnsupportedError("Kategória nesmie byť prázdna.");
          assignments.push("category=?");args.push(text(raw));appliedValue=text(raw);break;
        case "municipality": assignments.push("city=?");args.push(text(raw));appliedValue=text(raw);break;
        case "street": assignments.push("street=?");args.push(text(raw));appliedValue=text(raw);break;
        case "houseNumber": assignments.push("house_number=?");args.push(text(raw));appliedValue=text(raw);break;
        case "postalCode": assignments.push("postal_code=?");args.push(text(raw));appliedValue=text(raw);break;
        case "domain": {
          const url=safeWebsite(raw,field.normalizedValue);
          assignments.push("website_url=?");args.push(url||null);appliedValue=url;break;
        }
        case "phone":
        case "email": {
          directoryContacts ??= readDirectoryPublicContacts(sourceData as Record<string,string|number|null>,text(current.website_url));
          directoryContacts={...directoryContacts,[field.fieldName]:text(raw)};
          contactChanged=true;appliedValue=text(raw);break;
        }
        case "ico": {
          const ico=normalizeIco(raw); if(!ico) throw new CanonicalApplyUnsupportedError("IČO musí mať 8 číslic.");
          setSourceMetadata(sourceData,"IČO",ico);sourceDataChanged=true;appliedValue=ico;break;
        }
        case "registryId": setSourceMetadata(sourceData,"Registry ID",text(raw));sourceDataChanged=true;appliedValue=text(raw);break;
        case "registryNamespace": setSourceMetadata(sourceData,"Registry namespace",text(raw));sourceDataChanged=true;appliedValue=text(raw);break;
        default: throw new CanonicalApplyUnsupportedError(`Pole ${field.fieldName} nie je bezpečne mapované.`);
      }
    } else {
      switch(field.fieldName){
        case "organizationName": assignments.push("legal_name=?");args.push(text(raw));appliedValue=text(raw);break;
        case "municipality": assignments.push("city=?");args.push(text(raw));appliedValue=text(raw);break;
        case "domain": {
          const url=safeWebsite(raw,field.normalizedValue);
          assignments.push("website_url=?");args.push(url||null);appliedValue=url;break;
        }
        case "phone": assignments.push("public_phone=?");args.push(text(raw)||null);appliedValue=text(raw);break;
        case "email": assignments.push("public_email=?");args.push(text(raw)||null);appliedValue=text(raw);break;
        case "ico": {
          const ico=normalizeIco(raw); if(!ico) throw new CanonicalApplyUnsupportedError("IČO musí mať 8 číslic.");
          assignments.push("registration_number=?");args.push(ico);appliedValue=ico;break;
        }
        case "registryId": setSourceMetadata(sourceData,"registryId",text(raw));sourceDataChanged=true;appliedValue=text(raw);break;
        case "registryNamespace": setSourceMetadata(sourceData,"registryNamespace",text(raw));sourceDataChanged=true;appliedValue=text(raw);break;
        case "organizationType": assignments.push("type=?");args.push(text(raw));appliedValue=text(raw);break;
        default: throw new CanonicalApplyUnsupportedError(`Pole ${field.fieldName} nie je bezpečne mapované.`);
      }
    }
    after[field.fieldName]=appliedValue;
    appliedFields.push(field.fieldName);
    provenance.push({
      fieldName:field.fieldName,evidenceId:field.evidenceId,observationId:field.observationId,
      sourceId:field.sourceId,sourceRecordId:field.sourceRecordId,sourceLabel:field.sourceLabel,
      sourceRole:field.sourceRole,authorityScore:field.authorityScore,confidence:field.confidence,
      previousValue:field.currentValue,newValue:appliedValue,conflict:field.conflict,
    });
  }

  if(contactChanged&&preview.entityType==="DIRECTORY"&&directoryContacts){
    sourceData=mergeDirectoryPublicContactData(sourceData as Record<string,string|number|null>,{
      publicPhone:directoryContacts.phone,
      publicEmail:directoryContacts.email,
    });
    sourceDataChanged=true;
  }
  if(sourceDataChanged){assignments.push("source_data_json=?");args.push(JSON.stringify(sourceData));}
  if(!appliedFields.length) throw new CanonicalApplyUnsupportedError("Vyber aspoň jedno pole APPLY_INCOMING.");

  assignments.push("updated_at=?","updated_by=?");
  args.push(at,actor,preview.canonicalEntityId,preview.canonicalUpdatedAt);
  const table=preview.entityType==="DIRECTORY"?"directory_profiles":"help_organizations";
  return {
    statement:db.prepare(`UPDATE ${table} SET ${assignments.join(",")}
      WHERE id=? AND updated_at=? AND archived_at IS NULL`).bind(...args),
    appliedFields,before,after,provenance,
  };
}

export async function applyAutomationCanonicalReview(input:{
  observationId:number;
  candidateClusterId:number;
  reviewerEmail:string;
  expectedDecisionId:number;
  expectedDecisionVersion:number;
  expectedEvidenceFingerprint:string;
  expectedCanonicalUpdatedAt:string;
  selections:CanonicalFieldSelection[];
  now?:Date;
},dbInput?:Database) {
  const db=database(dbInput);
  const target=await targetContext(input.observationId,input.candidateClusterId,db);
  if(!target||target.canonicalEntityId<1) throw new CanonicalApplyBlockedError("Canonical target nie je jednoznačne naviazaný.");
  const selections=normalizedSelections(input.selections);
  for(const item of selections){
    if(!canonicalFieldApplyActions.includes(item.action)) throw new CanonicalApplyUnsupportedError("Neplatná field apply akcia.");
  }
  const fingerprint=await applyFingerprint({
    entityType:target.entityType,canonicalEntityId:target.canonicalEntityId,
    reviewDecisionId:input.expectedDecisionId,reviewDecisionVersion:input.expectedDecisionVersion,
    evidenceFingerprint:input.expectedEvidenceFingerprint,
    expectedCanonicalUpdatedAt:input.expectedCanonicalUpdatedAt,selections,
  });
  const existing=await existingOperation(fingerprint,db);
  if(existing&&String(existing.status)==="SUCCESS"){
    return {operationId:Number(existing.id),applyFingerprint:fingerprint,idempotent:true,
      canonicalEntityId:Number(existing.canonical_entity_id),
      appliedFields:JSON.parse(String(existing.selected_fields_json||"[]")) as unknown};
  }

  const preview=await getAutomationCanonicalApplyPreview({
    observationId:input.observationId,candidateClusterId:input.candidateClusterId,
  },db);
  if(!preview) throw new CanonicalApplyBlockedError("Apply preview sa už nedá zostaviť.");
  if(!preview.eligible) throw new CanonicalApplyBlockedError(`Apply je blokovaný: ${preview.blockers.join(", ")}`);
  if(preview.reviewDecisionId!==input.expectedDecisionId||preview.reviewDecisionVersion!==input.expectedDecisionVersion)
    throw new CanonicalApplyConflictError("Review decision sa zmenilo. Obnov detail.");
  if(preview.evidenceFingerprint!==input.expectedEvidenceFingerprint)
    throw new CanonicalApplyConflictError("Evidence fingerprint sa zmenil. Obnov detail.");
  if(preview.canonicalUpdatedAt!==input.expectedCanonicalUpdatedAt)
    throw new CanonicalApplyConflictError("Canonical záznam sa medzitým zmenil. Obnov detail.");
  if(preview.canonicalEntityId!==target.canonicalEntityId)
    throw new CanonicalApplyConflictError("Canonical target sa zmenil. Obnov detail.");

  const current=await canonicalRow(target,db);
  if(!current||isArchived(current)) throw new CanonicalApplyConflictError("Canonical záznam už nie je bezpečne editovateľný.");
  const actor=input.reviewerEmail.trim().toLowerCase();
  const at=(input.now??new Date()).toISOString();
  const mutation=buildMutation(preview,current,selections,actor,at,db);
  const selectedJson=stableJson(selections);
  const audit=db.prepare(`INSERT INTO automation_canonical_apply_operations
    (apply_fingerprint,entity_type,canonical_entity_id,source_cluster_id,target_cluster_id,observation_id,
     review_decision_id,review_decision_version,evidence_fingerprint,expected_canonical_updated_at,
     selected_fields_json,before_json,after_json,provenance_json,status,failure_code,failure_detail,applied_by,applied_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,'SUCCESS',NULL,NULL,?,?)`).bind(
      fingerprint,preview.entityType,preview.canonicalEntityId,preview.sourceClusterId,preview.targetClusterId,input.observationId,
      input.expectedDecisionId,input.expectedDecisionVersion,input.expectedEvidenceFingerprint,input.expectedCanonicalUpdatedAt,
      selectedJson,stableJson(mutation.before),stableJson(mutation.after),stableJson(mutation.provenance),actor,at,
    );

  try{
    const results=await db.batch([mutation.statement,audit]);
    const changes=Number((results[0] as {meta?:{changes?:number}})?.meta?.changes??0);
    if(changes!==1) throw new CanonicalApplyConflictError("Canonical záznam sa zmenil súbežne. Obnov detail.");
  }catch(error){
    if(error instanceof CanonicalApplyConflictError) throw error;
    const message=error instanceof Error?error.message:String(error);
    if(/automation_canonical_apply_operations.*apply_fingerprint|UNIQUE constraint failed: automation_canonical_apply_operations\.apply_fingerprint/i.test(message)){
      const raced=await existingOperation(fingerprint,db);
      if(raced&&String(raced.status)==="SUCCESS") return {operationId:Number(raced.id),applyFingerprint:fingerprint,idempotent:true,
        canonicalEntityId:Number(raced.canonical_entity_id),appliedFields:mutation.appliedFields};
    }
    throw error;
  }

  const stored=await existingOperation(fingerprint,db);
  if(!stored) throw new Error("canonical_apply_audit_missing");
  return {
    operationId:Number(stored.id),applyFingerprint:fingerprint,idempotent:false,
    canonicalEntityId:preview.canonicalEntityId,appliedFields:mutation.appliedFields,
  };
}
