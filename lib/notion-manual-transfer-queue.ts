import { NOTION_AUTHORITY_GROUPS } from "./notion-field-authority";
import {
  validateManualTransferRequest,
  areaOfManualTransferScope,
  type ManualTransferRequest,
  type NotionManualTransferDirection,
} from "./notion-manual-transfer-contract";
import { runNotionBreedSyncSweep, type NotionBreedSyncBindings } from "./notion-breed-sync";
import { runNotionDirectorySyncSweep, type NotionDirectorySyncBindings } from "./notion-directory-sync";
import { runNotionEventsHelpSyncSweep, type NotionEventsHelpSyncBindings } from "./notion-events-help-sync";
import { runNotionEshopSyncSweep, type NotionEshopSyncBindings } from "./notion-eshop-sync";
import type { BidirectionalAgendaKey } from "./notion-events-help-adapters";

export type ManualTransferBindings = NotionBreedSyncBindings &
  NotionDirectorySyncBindings & NotionEventsHelpSyncBindings &
  NotionEshopSyncBindings & {
    NOTION_MANUAL_TRANSFER_ENABLED?: string;
  };

type LinkRow = {scope:string;profile_id:number;notion_page_id:string};
type Job = LinkRow & {
  id:number;run_id:string;attempts:number;
  direction:NotionManualTransferDirection;area:string;
};
const MAX_LINKS=10000;
const MAX_ATTEMPTS=8;
const BATCH_SIZE=2;
const ALLOWED_SCOPES=new Set(NOTION_AUTHORITY_GROUPS
  .filter(group=>group.active && areaOfManualTransferScope(group.scope)!==null)
  .map(group=>group.scope));

function uuid(value:string) {
  return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
}
function enabled(value:unknown) {return value==="true" || value==="1";}
function errorCode(error:unknown) {
  const message=error instanceof Error?error.message:"TRANSFER_ADAPTER_FAILED";
  return /^[A-Z][A-Z0-9_]{2,100}$/.test(message) ? message : "TRANSFER_ADAPTER_FAILED";
}
function pageValid(value:string):boolean {return uuid(value);}

/** The migration is deployed only by the protected Production D1 workflow. */
export async function manualTransferSchemaReady(db:D1Database):Promise<boolean> {
  const result=await db.prepare("SELECT COUNT(*) AS n FROM sqlite_master " +
    "WHERE type='table' AND name IN " +
    "('notion_manual_transfer_runs','notion_manual_transfer_items','notion_manual_transfer_field_results')")
    .first<{n:number}>();
  return result?.n===3;
}

function requestedScopes(request:ManualTransferRequest):string[]{
  if(request.scope) return [request.scope];
  return NOTION_AUTHORITY_GROUPS
    .filter(group=>group.active && areaOfManualTransferScope(group.scope)===request.area)
    .map(group=>group.scope);
}

/**
 * Only existing explicit one-to-one mappings are eligible. This operation
 * never invents a Notion page or creates a canonical profile.
 */
async function linkedProfiles(db:D1Database, request:ManualTransferRequest):Promise<LinkRow[]>{
  if(request.selection==="ONE" && request.area==="help" && !request.scope)
    throw Error("TRANSFER_HELP_SCOPE_REQUIRED");
  const output:LinkRow[]=[];
  for(const scope of requestedScopes(request)){
    if(!ALLOWED_SCOPES.has(scope))throw Error("TRANSFER_SCOPE_UNSUPPORTED");
    const byId=request.selection==="ONE";
    let sql:string;const bind:unknown[]=[];
    if(scope==="breeds"){
      sql="SELECT breed_id AS profile_id,notion_page_id FROM breed_notion_sync";
    }else if(scope.startsWith("directory:")){
      sql="SELECT m.directory_profile_id AS profile_id,m.notion_page_id FROM directory_notion_sync m " +
        "JOIN directory_profiles p ON p.id=m.directory_profile_id WHERE p.category=?";
      bind.push(scope.slice("directory:".length));
    }else if(scope==="events"){
      sql="SELECT event_id AS profile_id,notion_page_id FROM event_notion_sync";
    }else if(scope==="eshops"){
      sql="SELECT eshop_id AS profile_id,notion_page_id FROM eshop_notion_sync";
    }else{
      sql="SELECT entity_id AS profile_id,notion_page_id FROM notion_agenda_sync WHERE agenda=?";
      bind.push(scope);
    }
    const idColumn=scope==="breeds"?"breed_id"
      :scope==="events"?"event_id"
      :scope==="eshops"?"eshop_id"
      :scope.startsWith("directory:")?"m.directory_profile_id":"entity_id";
    sql+=(bind.length?" AND ":" WHERE ")+(byId?idColumn+"=?":"1=1");
    if(byId)bind.push(request.profileId);
    // A bounded single read per scope. Fail closed instead of reporting a
    // partial all-record queue as a completed whole-area transfer.
    const pageSize=250;
    for(let offset=0;;offset+=pageSize){
      const q=await db.prepare(sql+" ORDER BY profile_id LIMIT ? OFFSET ?")
        .bind(...bind,pageSize,offset)
        .all<{profile_id:number;notion_page_id:string}>();
      const rows=q.results??[];
      for(const row of rows){
        if(!Number.isSafeInteger(row.profile_id)||row.profile_id<=0
          ||!pageValid(row.notion_page_id))throw Error("TRANSFER_MAPPING_INVALID");
        output.push({scope,profile_id:row.profile_id,notion_page_id:row.notion_page_id});
        if(output.length>MAX_LINKS)throw Error("TRANSFER_TOO_MANY_PROFILES");
      }
      if(rows.length<pageSize)break;
    }
  }
  if(!output.length)throw Error("TRANSFER_NO_LINKED_PROFILES");
  if(request.selection==="ONE" && output.length!==1)
    throw Error("TRANSFER_PROFILE_AMBIGUOUS");
  const pages=new Set<string>();
  for(const row of output){
    if(pages.has(row.notion_page_id))throw Error("TRANSFER_DUPLICATE_NOTION_PAGE");
    pages.add(row.notion_page_id);
  }
  return output;
}

export async function prepareManualTransferRun(input:{
  database:D1Database;
  request:unknown;
  actor:string;
}):Promise<{runId:string;items:number;status:"QUEUED"}>{
  const request=validateManualTransferRequest(input.request,NOTION_AUTHORITY_GROUPS);
  if(!input.actor.trim())throw Error("TRANSFER_ACTOR_REQUIRED");
  if(!await manualTransferSchemaReady(input.database))
    throw Error("TRANSFER_MIGRATION_REQUIRED");
  const links=await linkedProfiles(input.database,request);
  const runId=crypto.randomUUID();
  await input.database.prepare(
    "INSERT INTO notion_manual_transfer_runs " +
    "(id,area,scope,direction,selection,requested_profile_id,status,requested_by,total_profiles) " +
    "VALUES (?,?,?,?,?,?,'PREVIEW',?,?)"
  ).bind(runId,request.area,request.scope??null,request.direction,request.selection,
    request.profileId??null,input.actor,links.length).run();
  try{
    // PREVIEW is a non-runnable intermediate state. A partial queue never runs.
    for(let at=0;at<links.length;at+=40){
      await input.database.batch(links.slice(at,at+40).map(link=>
        input.database.prepare("INSERT INTO notion_manual_transfer_items " +
          "(run_id,scope,profile_id,notion_page_id) VALUES (?,?,?,?)")
          .bind(runId,link.scope,link.profile_id,link.notion_page_id)));
    }
    await input.database.prepare("UPDATE notion_manual_transfer_runs SET status='QUEUED',updated_at=? " +
      "WHERE id=? AND status='PREVIEW'").bind(new Date().toISOString(),runId).run();
  }catch(error){
    await input.database.prepare("UPDATE notion_manual_transfer_runs " +
      "SET status='FAILED',updated_at=?,finished_at=? WHERE id=? AND status='PREVIEW'")
      .bind(new Date().toISOString(),new Date().toISOString(),runId).run();
    throw error;
  }
  return {runId,items:links.length,status:"QUEUED"};
}

async function mappingStillLinked(db:D1Database,link:LinkRow):Promise<boolean>{
  let sql:string,bind:unknown[];
  if(link.scope==="breeds"){
    sql="SELECT notion_page_id AS page FROM breed_notion_sync WHERE breed_id=?";
    bind=[link.profile_id];
  }else if(link.scope.startsWith("directory:")){
    sql="SELECT m.notion_page_id AS page FROM directory_notion_sync m " +
      "JOIN directory_profiles p ON p.id=m.directory_profile_id " +
      "WHERE m.directory_profile_id=? AND p.category=?";
    bind=[link.profile_id,link.scope.slice("directory:".length)];
  }else if(link.scope==="events"){
    sql="SELECT notion_page_id AS page FROM event_notion_sync WHERE event_id=?";
    bind=[link.profile_id];
  }else if(link.scope==="eshops"){
    sql="SELECT notion_page_id AS page FROM eshop_notion_sync WHERE eshop_id=?";
    bind=[link.profile_id];
  }else if(ALLOWED_SCOPES.has(link.scope)){
    sql="SELECT notion_page_id AS page FROM notion_agenda_sync WHERE agenda=? AND entity_id=?";
    bind=[link.scope,link.profile_id];
  }else throw Error("TRANSFER_SCOPE_UNSUPPORTED");
  const result=await db.prepare(sql).bind(...bind).first<{page:string}>();
  return result?.page===link.notion_page_id;
}

async function runOne(input:{db:D1Database;bindings:ManualTransferBindings;job:Job}){
  const {db,bindings,job}=input;
  if(!await mappingStillLinked(db,job))throw Error("TRANSFER_IDENTITY_CHANGED");
  if(job.scope==="breeds"){
    const summary=await runNotionBreedSyncSweep({
      database:db,bindings,targetPageId:job.notion_page_id,
      manualDirection:job.direction,
    });
    if(!summary.enabled)throw Error("TRANSFER_BREED_SYNC_DISABLED");
    if(summary.failed||summary.scanned!==1)throw Error("TRANSFER_BREED_ADAPTER_FAILED");
    return;
  }
  if(job.scope.startsWith("directory:")){
    const summary=await runNotionDirectorySyncSweep({
      database:db,bindings,targetProfileId:job.profile_id,
      manualDirection:job.direction,
    });
    if(!summary.enabled||!summary.schemaReady)throw Error("TRANSFER_DIRECTORY_SYNC_DISABLED");
    if(summary.failed||summary.pulledFromNotion+summary.pushedToNotion+summary.unchanged!==1)
      throw Error("TRANSFER_DIRECTORY_ADAPTER_FAILED");
    return;
  }
  if(job.scope==="eshops"){
    const summary=await runNotionEshopSyncSweep({
      database:db,bindings,targetShopId:job.profile_id,
      manualDirection:job.direction,
    });
    if(!summary.enabled||!summary.schemaReady)throw Error("TRANSFER_ESHOP_SYNC_DISABLED");
    if(summary.failed||summary.pulledFromNotion+summary.pushedToNotion+summary.unchanged!==1)
      throw Error("TRANSFER_ESHOP_ADAPTER_FAILED");
    return;
  }
  const agenda=job.scope as BidirectionalAgendaKey;
  const summary=await runNotionEventsHelpSyncSweep({
    database:db,bindings,
    mode:"sync",agendas:[agenda],targetPageId:job.notion_page_id,
    webhookMappedOnly:true,manualDirection:job.direction,
  });
  if(!summary.enabled||!summary.schemaReady)throw Error("TRANSFER_EVENTS_HELP_SYNC_DISABLED");
  const row=summary.agendas.find(x=>x.agenda===agenda);
  if(!row||row.failed||row.conflicts
    ||row.pulledFromNotion+row.pushedToNotion+row.unchanged!==1)
    throw Error("TRANSFER_EVENTS_HELP_ADAPTER_FAILED");
}

async function updateRun(db:D1Database,runId:string){
  const row=await db.prepare("SELECT COUNT(*) AS total, " +
    "SUM(CASE WHEN status IN ('DONE','PARTIAL','FAILED','SKIPPED') THEN 1 ELSE 0 END) AS processed, " +
    "SUM(CASE WHEN status IN ('FAILED','PARTIAL') THEN 1 ELSE 0 END) AS failed " +
    "FROM notion_manual_transfer_items WHERE run_id=?")
    .bind(runId).first<{total:number;processed:number;failed:number}>();
  if(!row)return;
  const now=new Date().toISOString();
  const finished=row.total>0&&row.processed===row.total;
  const state=finished?(row.failed>0?"PARTIAL":"COMPLETED"):"RUNNING";
  await db.prepare("UPDATE notion_manual_transfer_runs SET status=?,processed_profiles=?, " +
    "updated_at=?,finished_at=? WHERE id=? AND status IN ('QUEUED','RUNNING')")
    .bind(state,row.processed,now,finished?now:null,runId).run();
}

/**
 * D1-claimed, idempotent, bounded execution. Called only from existing cron
 * under an explicit manual-transfer feature gate (OFF by default).
 */
export async function runManualTransferQueueBatch(input:{
  database:D1Database;bindings:ManualTransferBindings;limit?:number;
}):Promise<{claimed:number;done:number;retried:number;failed:number;disabled:boolean}>{
  const total={claimed:0,done:0,retried:0,failed:0,disabled:false};
  if(!enabled(input.bindings.NOTION_MANUAL_TRANSFER_ENABLED)){
    total.disabled=true;return total;
  }
  if(!await manualTransferSchemaReady(input.database))return {...total,disabled:true};
  const limit=Math.min(BATCH_SIZE,Math.max(1,input.limit??1));
  const now=new Date().toISOString();
  for(let i=0;i<limit;i++){
    const job=await input.database.prepare(
      "UPDATE notion_manual_transfer_items SET status='RUNNING',attempts=attempts+1, " +
      "started_at=?,updated_at=? WHERE id=(" +
      "SELECT i.id FROM notion_manual_transfer_items i " +
      "JOIN notion_manual_transfer_runs r ON r.id=i.run_id " +
      "WHERE r.status IN ('QUEUED','RUNNING') AND (" +
      "(i.status='PENDING' AND i.next_attempt_at<=?) OR " +
      "(i.status='RUNNING' AND i.started_at<?)) " +
      "ORDER BY r.created_at,i.id LIMIT 1) RETURNING id,run_id,scope,profile_id,notion_page_id,attempts"
    ).bind(now,now,now,new Date(Date.now()-10*60*1000).toISOString()).first<
      Omit<Job,"direction"|"area">>();
    if(!job)break;
    const run=await input.database.prepare(
      "SELECT area,direction FROM notion_manual_transfer_runs WHERE id=?"
    ).bind(job.run_id).first<{area:string;direction:NotionManualTransferDirection}>();
    if(!run)throw Error("TRANSFER_RUN_NOT_FOUND");
    const claimed={...job,...run};
    total.claimed++;
    try{
      await runOne({db:input.database,bindings:input.bindings,job:claimed});
      await input.database.prepare(
        "UPDATE notion_manual_transfer_items SET status='DONE',last_error_code=NULL, " +
        "finished_at=?,updated_at=? WHERE id=? AND status='RUNNING'"
      ).bind(new Date().toISOString(),new Date().toISOString(),job.id).run();
      total.done++;
    }catch(error){
      const failure=errorCode(error);
      const exhausted=job.attempts>=MAX_ATTEMPTS;
      const delay=Math.min(3600,30*2**Math.min(job.attempts,7));
      await input.database.prepare(
        "UPDATE notion_manual_transfer_items SET status=?,last_error_code=?, " +
        "next_attempt_at=?,finished_at=?,updated_at=? WHERE id=? AND status='RUNNING'"
      ).bind(exhausted?"FAILED":"PENDING",failure,
        new Date(Date.now()+delay*1000).toISOString(),
        exhausted?new Date().toISOString():null,
        new Date().toISOString(),job.id).run();
      if(exhausted)total.failed++;else total.retried++;
    }
    await updateRun(input.database,job.run_id);
  }
  return total;
}

export async function readManualTransferRun(db:D1Database,runId:string){
  if(!uuid(runId))throw Error("TRANSFER_RUN_ID_INVALID");
  if(!await manualTransferSchemaReady(db))throw Error("TRANSFER_MIGRATION_REQUIRED");
  const run=await db.prepare(
    "SELECT id,area,scope,direction,selection,requested_profile_id,status, " +
    "total_profiles,processed_profiles,changed_fields,failed_fields,created_at,updated_at,finished_at " +
    "FROM notion_manual_transfer_runs WHERE id=?"
  ).bind(runId).first();
  if(!run)throw Error("TRANSFER_RUN_NOT_FOUND");
  const items=await db.prepare(
    "SELECT scope,profile_id,status,attempts,changed_fields,failed_fields,last_error_code,updated_at " +
    "FROM notion_manual_transfer_items WHERE run_id=? ORDER BY id LIMIT 500"
  ).bind(runId).all();
  return {run,items:items.results??[],itemsLimit:500};
}
