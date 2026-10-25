/**
 * Internal, opt-in Services V3 -> Notion catalog mirror executor.
 * No route/cron invokes this. Notion is NEVER allowed to mutate canonical D1.
 * Requires a server-owned, cross-worker exclusive lease and approved page mapping.
 * Transport and owner mapping are injected, not accepted from HTTP requests.
 */
import {requireServiceCatalogAuditSchema} from "./service-catalog-admin-store.ts";
import {validateServiceNotionReceiptProof} from "./service-catalog-notion-receipt-proof.ts";

type Fields={
  kind:"service"|"attribute";label:string;group:string;meaning:string;
  primaryCategory:string;categories:string[];valueKind:"tri_state";
};
type Local=Fields & {
  id:string;version:number;status:"DRAFT"|"ACTIVE"|"RETIRED";
  notionMirrorStatus:"PENDING"|"SYNCED"|"CONFLICT";
};
type Row={id:string;version:number;status:Local["status"];notion_mirror_status:Local["notionMirrorStatus"];
  kind:Fields["kind"];label:string;group_name:string;meaning:string;primary_category:string;
  categories_json:string;value_kind:"tri_state"};
type ReceiptRow={
  option_id:string;option_version:number;notion_page_id:string;
  notion_last_edited_at:string;remote_payload_sha256:string;
};
type Target={optionId:string;pageId:string;dataSourceId:string};
type RemotePage={pageId:string;dataSourceId:string;sourceOptionId:string;
  sourceOptionVersion:number;notionLastEditedAt:string;archived:boolean;inTrash:boolean;fields:Fields};
type Ack={pageId:string;notionLastEditedAt:string};
type DB=Pick<D1Database,"prepare"|"batch">;
export type CatalogMirrorDependencies={
  db:DB;
  // All three must be explicitly enabled in an APPROVED internal worker, not a public route.
  flags:{adminWrites?:string;notionMirrorReady?:string;mirrorExecutor?:string};
  // A durable, cross-instance exclusive option lease. No in-process mutex fallback.
  lease:{runExclusive<T>(optionId:string,work:()=>Promise<T>):Promise<T>};
  // Registry is independent of Notion payloads and owned by the service.
  registry:{get(optionId:string):Promise<Target|null>;list():Promise<Target[]>};
  notion:{
    readPage(pageId:string):Promise<RemotePage>;
    writePage(pageId:string,local:Local):Promise<Ack>;
  };
  // Time and identity are server-owned, never supplied by a browser/Notion field.
  now?:()=>Date;
};
export type CatalogMirrorResult=
  | {state:"VERIFIED";optionId:string;version:number;pageId:string}
  | {state:"RETRY"|"REVIEW"|"BLOCKED";reason:string;optionId:string};

export class CatalogMirrorError extends Error {
  readonly code:string;
  readonly disposition:"RETRY"|"REVIEW"|"BLOCKED";
  constructor(code:string,disposition:"RETRY"|"REVIEW"|"BLOCKED"){
    super(code);
    this.code=code;
    this.disposition=disposition;
  }
}
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const fail=(code:string,disposition:"RETRY"|"REVIEW"|"BLOCKED"="REVIEW"):never=>{
  throw new CatalogMirrorError(code,disposition);
};
const sameUuid=(a:string,b:string)=>a.replaceAll("-","").toLowerCase()===b.replaceAll("-","").toLowerCase();
const validTarget=(t:Target|null,id:string):t is Target=>
  !!t&&t.optionId===id&&UUID.test(t.pageId)&&UUID.test(t.dataSourceId);
function project(row:Row):Local{
  let categories:unknown;
  try{categories=JSON.parse(row.categories_json);}catch{fail("INVALID_CANONICAL_ROW");}
  if(!ID.test(row.id)||!Number.isSafeInteger(row.version)||row.version<1||
     !Array.isArray(categories)||!categories.every(x=>typeof x==="string")||
     (row.kind==="service"&&!row.id.startsWith("svc."))||
     (row.kind==="attribute"&&!row.id.startsWith("attr.")))fail("INVALID_CANONICAL_ROW");
  return {id:row.id,version:row.version,status:row.status,notionMirrorStatus:row.notion_mirror_status,
    kind:row.kind,label:row.label,group:row.group_name,meaning:row.meaning,
    primaryCategory:row.primary_category,categories:categories as string[],valueKind:row.value_kind};
}
function sameRow(a:Row,b:Row):boolean{
  return ["id","version","status","notion_mirror_status","kind","label","group_name","meaning",
    "primary_category","categories_json","value_kind"].every(k=>a[k as keyof Row]===b[k as keyof Row]);
}
function hashProjection(id:string,version:number,f:Fields):Promise<string>{
  const payload=JSON.stringify({schema:"psipedia.service-option.v1",
    source:"psipedia-d1:service_catalog_admin_options",optionId:id,version,
    kind:f.kind,label:f.label,group:f.group,meaning:f.meaning,
    primaryCategory:f.primaryCategory,categories:[...f.categories].sort(),valueKind:f.valueKind});
  return crypto.subtle.digest("SHA-256",new TextEncoder().encode(payload)).then(d=>
    Array.from(new Uint8Array(d),x=>x.toString(16).padStart(2,"0")).join(""));
}
async function snapshot(db:DB,id:string):Promise<Row>{
  const row=await db.prepare("SELECT id,version,status,notion_mirror_status,kind,label,group_name,meaning,primary_category,categories_json,value_kind FROM service_catalog_admin_options WHERE id=?1 LIMIT 1")
    .bind(id).first<Row>();
  if(!row)fail("CANONICAL_OPTION_MISSING");
  return row;
}
async function receipts(db:DB):Promise<ReceiptRow[]>{
  return (await db.prepare("SELECT option_id,option_version,notion_page_id,notion_last_edited_at,remote_payload_sha256 FROM service_catalog_admin_notion_receipts").all<ReceiptRow>()).results;
}
function ownership(target:Target,all:Target[],receiptRows:ReceiptRow[]){
  if(all.some(x=>!x||!validTarget(x,x.optionId)))fail("INVALID_REGISTRY");
  const self=all.filter(x=>x.optionId===target.optionId);
  if(self.length!==1||!sameUuid(self[0].pageId,target.pageId)||!sameUuid(self[0].dataSourceId,target.dataSourceId))
    fail("AMBIGUOUS_MAPPING");
  if(all.some(x=>x.optionId!==target.optionId&&sameUuid(x.pageId,target.pageId)))fail("PAGE_OWNERSHIP_CONFLICT");
  if(receiptRows.some(x=>x.option_id!==target.optionId&&sameUuid(x.notion_page_id,target.pageId)))
    fail("PAGE_OWNERSHIP_CONFLICT");
  if(receiptRows.some(x=>x.option_id===target.optionId&&!sameUuid(x.notion_page_id,target.pageId)))
    fail("PAGE_MAPPING_CHANGED");
}
function verifyPage(page:RemotePage,target:Target,id:string){
  if(!page||!UUID.test(page.pageId)||!UUID.test(page.dataSourceId)||
     !sameUuid(page.pageId,target.pageId)||!sameUuid(page.dataSourceId,target.dataSourceId)||
     page.sourceOptionId!==id||page.archived||page.inTrash)
    fail("WRONG_NOTION_TARGET");
}
/**
 * Receipt INSERT is FIRST, with a scalar guarded lookup for option_id.
 * On failed CAS/ownership the scalar returns NULL, violating receipt.option_id
 * NOT NULL. D1.batch rolls back the complete transaction, never a partial receipt.
 * The second statement can succeed only after the first inserted that version.
 * No blind UPDATE or separate unpaired lifecycle hook.
 */
async function atomicReceipt(db:DB,l:Local,row:Row,candidate:Extract<Awaited<ReturnType<typeof validateServiceNotionReceiptProof>>,{ok:true}>,actor:string){
  const c=candidate.receipt,g=candidate.guard;
  const selected=[
    "SELECT id FROM service_catalog_admin_options WHERE id=?1 AND version=?2",
    "AND status='DRAFT' AND notion_mirror_status='PENDING'",
    "AND kind=?3 AND label=?4 AND group_name=?5 AND meaning=?6",
    "AND primary_category=?7 AND categories_json=?8 AND value_kind=?9",
    "AND NOT EXISTS (SELECT 1 FROM service_catalog_admin_notion_receipts WHERE option_id=?1 AND option_version=?10)",
    "AND NOT EXISTS (SELECT 1 FROM service_catalog_admin_notion_receipts WHERE notion_page_id=?11 AND option_id<>?1)"
  ].join(" ");
  const params=[l.id,g.expectedVersion,row.kind,row.label,row.group_name,row.meaning,
    row.primary_category,row.categories_json,row.value_kind,g.nextVersion,c.notion_page_id];
  const insert=db.prepare(
    "INSERT INTO service_catalog_admin_notion_receipts "+
    "(option_id,option_version,notion_page_id,notion_last_edited_at,remote_payload_sha256,verified_at,verified_by) "+
    "VALUES (("+selected+"),?12,?13,?14,?15,?16,?17)"
  ).bind(...params,c.option_version,c.notion_page_id,c.notion_last_edited_at,
    c.remote_payload_sha256,c.verified_at,c.verified_by);
  const update=db.prepare(
    "UPDATE service_catalog_admin_options SET notion_mirror_status='SYNCED',version=version+1,updated_at=?1,updated_by=?2 "+
    "WHERE id=?3 AND version=?4 AND status='DRAFT' AND notion_mirror_status='PENDING' "+
    "AND EXISTS(SELECT 1 FROM service_catalog_admin_notion_receipts WHERE option_id=?3 AND option_version=?5)"
  ).bind(c.verified_at,actor,l.id,g.expectedVersion,g.nextVersion);
  // Guaranteed all-or-nothing only under D1.batch transaction semantics.
  await db.batch([insert,update]);
  const after=await snapshot(db,l.id);
  if(after.version!==g.nextVersion||after.notion_mirror_status!=="SYNCED"||
     after.status!=="DRAFT")fail("POSTCOMMIT_STATE_MISMATCH");
}
/** No HTTP entrypoint, no background runner and no self-activation. */
export async function executeServiceCatalogNotionMirror(d:CatalogMirrorDependencies,optionId:string):Promise<CatalogMirrorResult>{
  if(!ID.test(optionId))return {state:"BLOCKED",reason:"INVALID_OPTION_ID",optionId};
  if(d.flags?.adminWrites!=="true"||d.flags.notionMirrorReady!=="true"||d.flags.mirrorExecutor!=="true")
    return {state:"BLOCKED",reason:"FEATURE_DISABLED",optionId};
  if(!d.lease?.runExclusive||!d.registry?.get||!d.registry?.list||
     !d.notion?.readPage||!d.notion?.writePage||!d.db?.batch)
    return {state:"BLOCKED",reason:"MISSING_TRUSTED_DEPENDENCY",optionId};
  try{
    return await d.lease.runExclusive(optionId,async()=>{
      try{await requireServiceCatalogAuditSchema(d.db);}
      catch{return fail("SCHEMA_0134_UNVERIFIED","BLOCKED");}
      const target=await d.registry.get(optionId);
      if(!validTarget(target,optionId))fail("NOTION_MAPPING_MISSING");
      const list=await d.registry.list();
      if(!Array.isArray(list))fail("INVALID_REGISTRY");
      const before=await snapshot(d.db,optionId),local=project(before);
      if(local.status!=="DRAFT"||local.notionMirrorStatus!=="PENDING")
        fail("NOT_PENDING");
      const priorReceipts=await receipts(d.db);
      ownership(target,list,priorReceipts);
      // Read before PATCH: refuse any unrelated profile/page even with a valid UUID.
      const pre=await d.notion.readPage(target.pageId);
      verifyPage(pre,target,optionId);
      // The previous VERIFIED receipt is the last shared snapshot of this
      // catalog item. A subsequent human Notion edit must not be overwritten
      // just because the D1 option has a newer record-level version.
      const previous = priorReceipts
        .filter(row=>row.option_id===optionId)
        .sort((a,b)=>b.option_version-a.option_version)[0];
      if(previous){
        const currentRemoteHash = await hashProjection(
          pre.sourceOptionId, pre.sourceOptionVersion, pre.fields);
        if(!sameUuid(previous.notion_page_id,target.pageId)||
          pre.sourceOptionVersion!==previous.option_version-1||
          previous.notion_last_edited_at!==pre.notionLastEditedAt||
          previous.remote_payload_sha256!==currentRemoteHash){
          fail("NOTION_CATALOG_REMOTE_CHANGED","REVIEW");
        }
      }
      // A timeout here has UNKNOWN remote outcome. Keep D1 PENDING; retry safely
      // only under exclusive lease, re-read target and PATCH the same projection.
      let ack:Ack;
      try{ack=await d.notion.writePage(target.pageId,local);}
      catch{return fail("WRITE_UNCERTAIN","RETRY");}
      if(!ack||!UUID.test(ack.pageId)||!sameUuid(ack.pageId,target.pageId))
        fail("INVALID_WRITE_ACK");
      let post:RemotePage;
      try{post=await d.notion.readPage(target.pageId);}
      catch{return fail("READBACK_UNAVAILABLE","RETRY");}
      const afterReadAt=(d.now??(()=>new Date()))().toISOString();
      const postWithHash={...post,fetchedAt:afterReadAt,
        payloadSha256:await hashProjection(post.sourceOptionId,post.sourceOptionVersion,post.fields)};
      const fresh=await snapshot(d.db,optionId);
      if(!sameRow(before,fresh))fail("STALE_CANONICAL_VERSION");
      const refreshedReceipts=await receipts(d.db);
      const refreshedMappings=await d.registry.list();
      ownership(target,refreshedMappings,refreshedReceipts);
      const decision=await validateServiceNotionReceiptProof({
        local,writeAck:{optionId,optionVersion:local.version,pageId:ack.pageId,
          notionLastEditedAt:ack.notionLastEditedAt,completedAt:afterReadAt},
        remoteRead:postWithHash,
        context:{expectedDataSourceId:target.dataSourceId,expectedPageId:target.pageId,
          verifiedAt:(d.now??(()=>new Date()))().toISOString(),
          verifiedBy:"service-catalog-notion-reconciler-v1",currentOptionId:fresh.id,
          currentVersion:fresh.version,receipts:refreshedReceipts.map(x=>({
            optionId:x.option_id,optionVersion:x.option_version,pageId:x.notion_page_id})),
          pageMappings:refreshedMappings.map(x=>({optionId:x.optionId,pageId:x.pageId}))}
      });
      if(!decision.ok)fail("PROOF_"+decision.reason,
        ["TIME_INVALID","REMOTE_PROOF_MISSING"].includes(decision.reason)?"RETRY":"REVIEW");
      try{await atomicReceipt(d.db,local,fresh,decision,"system:service-catalog-notion-reconciler-v1");}
      catch{return fail("ATOMIC_COMMIT_FAILED","REVIEW");}
      return {state:"VERIFIED",optionId,version:decision.guard.nextVersion,pageId:target.pageId};
    });
  }catch(error){
    if(error instanceof CatalogMirrorError)return {state:error.disposition,reason:error.code,optionId};
    // No optimistic claim when transport/lease/D1 fails. Preserve PENDING for review.
    return {state:"RETRY",reason:"UNEXPECTED_EXECUTION_FAILURE",optionId};
  }
}
