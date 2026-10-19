/**
 * Services V3 phase 3C: administrative lifecycle writes on the existing 0133 schema.
 * Never call this module without verified Admin authorization and BOTH write gates.
 * Notion is a mirror; a public Admin request cannot claim a successful mirror sync.
 */
import {validateCatalogOptionDraft} from "./service-option-governance-contract.ts";
import type {AdminCatalogOptionDto,CatalogMirrorStatus,CatalogOptionStatus} from "./service-catalog-admin-api-contract.ts";
import {canTransitionCatalogStatus,canTransitionMirrorStatus} from "./service-catalog-admin-api-contract.ts";
import {normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {ServiceCatalogConflictError,ServiceCatalogInputError,ServiceCatalogSchemaError} from "./service-catalog-admin-store.ts";

type DB=Pick<D1Database,"prepare">;
type Row={id:string;kind:"service"|"attribute";label:string;normalized_label:string;group_name:string;meaning:string;primary_category:string;categories_json:string;status:CatalogOptionStatus;notion_mirror_status:CatalogMirrorStatus;version:number};
type Mutation={id:string;expectedVersion:number;action:"edit"|"approve"|"retire"|"retryMirror";name?:string;category?:string;group?:string;meaning?:string};
function email(value:string):string{
  const actor=value.trim().toLowerCase();
  if(!actor||actor.length>254||!actor.includes("@"))throw new ServiceCatalogInputError("Authenticated Admin actor missing.");
  return actor;
}
function inputObject(raw:unknown):Record<string,unknown>{
  if(raw===null||typeof raw!=="object"||Array.isArray(raw))throw new ServiceCatalogInputError("Invalid lifecycle payload.");
  return raw as Record<string,unknown>;
}
function exactFields(value:Record<string,unknown>,keys:readonly string[]){
  if(Object.keys(value).some(key=>!keys.includes(key)))throw new ServiceCatalogInputError("Unsupported or server-controlled lifecycle fields.");
}
function requireVersion(raw:unknown):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<1)throw new ServiceCatalogInputError("A positive expectedVersion is required.");
  return raw as number;
}
function optionId(raw:unknown):string{
  if(typeof raw!=="string"||!(/^(svc|attr)\.admin\.[a-f0-9]{32}$/.test(raw)))
    throw new ServiceCatalogInputError("Only dynamic canonical options can change.");
  return raw;
}
function asDto(row:Row):AdminCatalogOptionDto{
  const categories=JSON.parse(row.categories_json) as string[];
  return {id:row.id,kind:row.kind,label:row.label,group:row.group_name,meaning:row.meaning,
    categories,status:row.status,notionMirrorStatus:row.notion_mirror_status,version:row.version};
}
function dbError(err:unknown):never{
  const msg=err instanceof Error?err.message:String(err);
  if(/UNIQUE constraint|constraint failed/i.test(msg))throw new ServiceCatalogConflictError("Canonical label already exists or an integrity constraint failed.");
  if(/no such table|no such column/i.test(msg))throw new ServiceCatalogSchemaError("Schema 0133 is not provisioned.");
  throw err;
}
async function find(db:DB,id:string):Promise<Row>{
  try{
    const row=await db.prepare("SELECT * FROM service_catalog_admin_options WHERE id=?1").bind(id).first<Row>();
    if(!row)throw new ServiceCatalogConflictError("Option not found; reload catalog.");
    return row;
  }catch(err){return dbError(err);}
}
function editPayload(raw:Record<string,unknown>,kind:Row["kind"]){
  exactFields(raw,["action","expectedVersion","name","category","group","meaning"]);
  if(typeof raw.name!=="string"||typeof raw.category!=="string"||typeof raw.group!=="string"||typeof raw.meaning!=="string")
    throw new ServiceCatalogInputError("All editable fields are required.");
  let draft:ReturnType<typeof validateCatalogOptionDraft>;
  try{draft=validateCatalogOptionDraft({name:raw.name,category:raw.category,group:raw.group,kind});}
  catch(err){throw new ServiceCatalogInputError(err instanceof Error?err.message:"Invalid canonical option.");}
  const meaning=raw.meaning.normalize("NFC").trim().replace(/\s+/g," ");
  if(meaning.length<10||meaning.length>500)throw new ServiceCatalogInputError("Meaning must contain 10 to 500 characters.");
  return {...draft,meaning,normalized:normalizeCatalogLabel(draft.name)};
}
/**
 * CAS uses version AND the original lifecycle/mirror states in the UPDATE predicate.
 * ID/kind/created_at/created_by are immutable. ACTIVE edits and retired changes
 * intentionally remain unavailable pending a separate semantic reapproval policy.
 */
export async function mutateAdminCatalogOption(db:DB,idRaw:unknown,raw:unknown,actorRaw:string,now=new Date()):Promise<AdminCatalogOptionDto>{
  const actor=email(actorRaw),id=optionId(idRaw),body=inputObject(raw);
  const version=requireVersion(body.expectedVersion);
  const action=body.action;
  if(!["edit","approve","retire","retryMirror"].includes(action as string))throw new ServiceCatalogInputError("Unknown lifecycle action.");
  const row=await find(db,id);
  if(row.version!==version)throw new ServiceCatalogConflictError("Option changed concurrently; reload before saving.");
  const time=now.toISOString();
  let sql:string,params:unknown[];
  if(action==="edit"){
    if(row.status!=="DRAFT"||row.notion_mirror_status==="CONFLICT")
      throw new ServiceCatalogConflictError("Edit is limited to non-conflicted DRAFT options.");
    const draft=editPayload(body,row.kind);
    if(draft.name===row.label&&draft.group===row.group_name&&draft.meaning===row.meaning&&draft.category===row.primary_category)
      throw new ServiceCatalogInputError("No actual changes to save.");
    if(!canTransitionMirrorStatus(row.notion_mirror_status,"PENDING"))
      throw new ServiceCatalogConflictError("Mirror must be retried before editing.");
    sql="UPDATE service_catalog_admin_options SET label=?1,normalized_label=?2,group_name=?3,meaning=?4,primary_category=?5,categories_json=?6,notion_mirror_status='PENDING',version=version+1,updated_at=?7,updated_by=?8 WHERE id=?9 AND version=?10 AND status=?11 AND notion_mirror_status=?12 RETURNING *";
    params=[draft.name,draft.normalized,draft.group,draft.meaning,draft.category,JSON.stringify([draft.category]),time,actor,id,version,row.status,row.notion_mirror_status];
  }else{
    exactFields(body,["action","expectedVersion"]);
    if(action==="approve"){
      if(row.status!=="DRAFT"||!canTransitionCatalogStatus(row.status,"ACTIVE",row.notion_mirror_status))
        throw new ServiceCatalogConflictError("Approval requires a DRAFT option with confirmed SYNCED mirror.");
      sql="UPDATE service_catalog_admin_options SET status='ACTIVE',version=version+1,updated_at=?1,updated_by=?2 WHERE id=?3 AND version=?4 AND status='DRAFT' AND notion_mirror_status='SYNCED' RETURNING *";
      params=[time,actor,id,version];
    }else if(action==="retire"){
      if(row.status==="RETIRED"||!canTransitionCatalogStatus(row.status,"RETIRED",row.notion_mirror_status))
        throw new ServiceCatalogConflictError("RETIRED is terminal.");
      sql="UPDATE service_catalog_admin_options SET status='RETIRED',version=version+1,updated_at=?1,updated_by=?2 WHERE id=?3 AND version=?4 AND status=?5 AND notion_mirror_status=?6 RETURNING *";
      params=[time,actor,id,version,row.status,row.notion_mirror_status];
    }else{
      if(row.status==="RETIRED"||row.notion_mirror_status!=="CONFLICT"||!canTransitionMirrorStatus("CONFLICT","PENDING"))
        throw new ServiceCatalogConflictError("Only an unresolved, non-retired mirror conflict may be retried.");
      sql="UPDATE service_catalog_admin_options SET notion_mirror_status='PENDING',version=version+1,updated_at=?1,updated_by=?2 WHERE id=?3 AND version=?4 AND status=?5 AND notion_mirror_status='CONFLICT' RETURNING *";
      params=[time,actor,id,version,row.status];
    }
  }
  try{
    const saved=await db.prepare(sql).bind(...params).first<Row>();
    if(!saved)throw new ServiceCatalogConflictError("Option changed concurrently; reload before saving.");
    return asDto(saved);
  }catch(err){return dbError(err);}
}
/**
 * INTERNAL reconciliation hook only; deliberately no HTTP route.
 * Caller must independently verify actual Notion sync/reconciliation evidence.
 * With 0133 there is no append-only receipt table: provenance cannot be audited
 * durably until a separately approved schema change.
 */
export async function recordCatalogMirrorOutcome(db:DB,input:{
  id:string;expectedVersion:number;outcome:"SYNCED"|"CONFLICT";
  evidence:{origin:"verified_notion_reconciliation";externalId:string};
},actorRaw:string,now=new Date()):Promise<AdminCatalogOptionDto>{
  const actor=email(actorRaw),id=optionId(input?.id),version=requireVersion(input?.expectedVersion);
  if(!input.evidence||input.evidence.origin!=="verified_notion_reconciliation"
    ||typeof input.evidence.externalId!=="string"||input.evidence.externalId.trim().length<3)
    throw new ServiceCatalogInputError("Verified Notion reconciliation evidence required.");
  if(input.outcome!=="SYNCED"&&input.outcome!=="CONFLICT")throw new ServiceCatalogInputError("Invalid mirror outcome.");
  const row=await find(db,id);
  if(row.version!==version)throw new ServiceCatalogConflictError("Stale mirror result.");
  if(row.status==="RETIRED"||!canTransitionMirrorStatus(row.notion_mirror_status,input.outcome)
    ||row.notion_mirror_status===input.outcome)
    throw new ServiceCatalogConflictError("Invalid or unchanged mirror result; conflicts need explicit retry.");
  const time=now.toISOString();
  try{
    const saved=await db.prepare("UPDATE service_catalog_admin_options SET notion_mirror_status=?1,version=version+1,updated_at=?2,updated_by=?3 WHERE id=?4 AND version=?5 AND status=?6 AND notion_mirror_status=?7 RETURNING *")
      .bind(input.outcome,time,actor,id,version,row.status,row.notion_mirror_status).first<Row>();
    if(!saved)throw new ServiceCatalogConflictError("Stale mirror result.");
    return asDto(saved);
  }catch(err){return dbError(err);}
}
