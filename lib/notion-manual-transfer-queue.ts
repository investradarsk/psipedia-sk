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
import { inspectManualTransferRecord, verifyManualTransferFields } from "./notion-manual-transfer-inspect";

export type ManualTransferBindings = NotionBreedSyncBindings &
  NotionDirectorySyncBindings & NotionEventsHelpSyncBindings &
  NotionEshopSyncBindings & {
    NOTION_MANUAL_TRANSFER_ENABLED?: string;
  };

type LinkRow = {scope:string;profile_id:number;notion_page_id:string};
type Job = LinkRow & {
  id:number;run_id:string;attempts:number;preview_hash:string|null;
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
}):Promise<{runId:string;items:number;status:"PREVIEW"}>{
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
    // Preview-only run. No content write until a separate owner confirmation.
  }catch(error){
    await input.database.prepare("UPDATE notion_manual_transfer_runs " +
      "SET status='FAILED',updated_at=?,finished_at=? WHERE id=? AND status='PREVIEW'")
      .bind(new Date().toISOString(),new Date().toISOString(),runId).run();
    throw error;
  }
  return {runId,items:links.length,status:"PREVIEW"};
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
  const head=await db.prepare("SELECT status FROM notion_manual_transfer_runs WHERE id=?")
    .bind(runId).first<{status:string}>();
  if(!head||!["PREVIEW","QUEUED","RUNNING"].includes(head.status))return;
  const preview=head.status==="PREVIEW";
  const totals=await db.prepare("SELECT COUNT(*) AS total,"+
    "SUM(CASE WHEN status IN ('PREVIEWED','DONE','PARTIAL','FAILED','SKIPPED') THEN 1 ELSE 0 END) AS settled,"+
    "SUM(CASE WHEN status='FAILED' THEN 1 ELSE 0 END) AS failed,"+
    "SUM(CASE WHEN status='PARTIAL' THEN 1 ELSE 0 END) AS partial "+
    "FROM notion_manual_transfer_items WHERE run_id=?")
    .bind(runId).first<{total:number;settled:number;failed:number;partial:number}>();
  if(!totals)return;
  const complete=totals.total>0&&totals.settled===totals.total;
  const status=preview
    ?(complete?(totals.failed?"FAILED":"PREVIEW_READY"):"PREVIEW")
    :(complete?(totals.failed||totals.partial?"PARTIAL":"COMPLETED"):"RUNNING");
  const fields=await db.prepare("SELECT "+
    "SUM(CASE WHEN f.status='UPDATED' THEN 1 ELSE 0 END) AS updated,"+
    "SUM(CASE WHEN f.status='CHANGE' THEN 1 ELSE 0 END) AS preview_changed,"+
    "SUM(CASE WHEN f.status='FAILED' THEN 1 ELSE 0 END) AS failed "+
    "FROM notion_manual_transfer_field_results f "+
    "JOIN notion_manual_transfer_items i ON i.id=f.item_id WHERE i.run_id=?")
    .bind(runId).first<{updated:number|null;preview_changed:number|null;failed:number|null}>();
  const now=new Date().toISOString();
  await db.prepare("UPDATE notion_manual_transfer_runs SET status=?,processed_profiles=?,"+
    "changed_fields=?,failed_fields=?,updated_at=?,finished_at=? "+
    "WHERE id=? AND status=?").bind(status,totals.settled,
      preview?(fields?.preview_changed??0):(fields?.updated??0),fields?.failed??0,now,
      !preview&&complete?now:null,runId,head.status).run();
}

async function writeFieldResults(db:D1Database,itemId:number,
  entries:ReadonlyArray<{field:string;status:string;reason:string|null;attempts:number}>){
  for(let at=0;at<entries.length;at+=40){
    await db.batch(entries.slice(at,at+40).map(f=>db.prepare(
      "INSERT INTO notion_manual_transfer_field_results "+
      "(item_id,field_key,status,reason_code,attempts) VALUES (?,?,?,?,?) "+
      "ON CONFLICT(item_id,field_key) DO UPDATE SET "+
      "status=excluded.status,reason_code=excluded.reason_code,attempts=excluded.attempts"
    ).bind(itemId,f.field,f.status,f.reason,f.attempts)));
  }
}
async function previewOne(db:D1Database,bindings:ManualTransferBindings,
  item:Omit<Job,"direction"|"area">,direction:NotionManualTransferDirection){
  if(!await mappingStillLinked(db,item))throw Error("TRANSFER_IDENTITY_CHANGED");
  const info=await inspectManualTransferRecord({database:db,bindings,link:item,direction});
  await writeFieldResults(db,item.id,info.fields.map(f=>({
    field:f.field,status:f.status,reason:f.reason??null,attempts:0,
  })));
  const now=new Date().toISOString();
  await db.prepare("UPDATE notion_manual_transfer_items SET status='PREVIEWED',"+
    "preview_hash=?,previewed_at=?,changed_fields=?,failed_fields=0,"+
    "last_error_code=NULL,updated_at=? WHERE id=? AND status='PREVIEWING'")
    .bind(info.fingerprint,now,info.changed,now,item.id).run();
}
async function executeVerified(db:D1Database,bindings:ManualTransferBindings,job:Job){
  const before=await inspectManualTransferRecord({
    database:db,bindings,link:job,direction:job.direction,
  });
  if(!job.preview_hash||before.fingerprint!==job.preview_hash)
    throw Error("TRANSFER_PREVIEW_STALE");
  if(before.changed)await runOne({db,bindings,job});
  const after=await inspectManualTransferRecord({
    database:db,bindings,link:job,direction:job.direction,
  });
  const checked=verifyManualTransferFields(before,after);
  await writeFieldResults(db,job.id,checked.map(f=>({
    field:f.field,status:f.status,reason:f.reason_code,attempts:job.attempts,
  })));
  const failed=checked.filter(f=>f.status==="FAILED").length;
  const updated=checked.filter(f=>f.status==="UPDATED").length;
  const now=new Date().toISOString();
  await db.prepare("UPDATE notion_manual_transfer_items SET "+
    "status=?,changed_fields=?,failed_fields=?,last_error_code=?,"+
    "finished_at=?,updated_at=? WHERE id=? AND status='RUNNING'")
    .bind(failed?"PARTIAL":"DONE",updated,failed,
      failed?"TRANSFER_FIELD_VERIFICATION_FAILED":null,now,now,job.id).run();
  return failed?"PARTIAL" as const:"DONE" as const;
}

/** Only two small D1-claimed items per minute, read-only preview first. */
export async function runManualTransferQueueBatch(input:{
  database:D1Database;bindings:ManualTransferBindings;limit?:number;
}):Promise<{claimed:number;previewed:number;done:number;partial:number;retried:number;failed:number;disabled:boolean}>{
  const total={claimed:0,previewed:0,done:0,partial:0,retried:0,failed:0,disabled:false};
  if(!enabled(input.bindings.NOTION_MANUAL_TRANSFER_ENABLED)){
    total.disabled=true;return total;
  }
  if(!await manualTransferSchemaReady(input.database))return {...total,disabled:true};
  const limit=Math.min(BATCH_SIZE,Math.max(1,input.limit??1));
  for(let n=0;n<limit;n++){
    const now=new Date().toISOString();
    const stale=new Date(Date.now()-10*60*1000).toISOString();
    let isPreview=true;
    let item=await input.database.prepare(
      "UPDATE notion_manual_transfer_items SET status='PREVIEWING',"+
      "attempts=attempts+1,started_at=?,updated_at=? WHERE id=("+
      "SELECT i.id FROM notion_manual_transfer_items i "+
      "JOIN notion_manual_transfer_runs r ON r.id=i.run_id "+
      "WHERE r.status='PREVIEW' AND "+
      "((i.status='PENDING' AND i.next_attempt_at<=?) OR "+
      "(i.status='PREVIEWING' AND i.started_at<?)) "+
      "ORDER BY r.created_at,i.id LIMIT 1) "+
      "RETURNING id,run_id,scope,profile_id,notion_page_id,preview_hash,attempts"
    ).bind(now,now,now,stale).first<Omit<Job,"direction"|"area">>();
    if(!item){
      isPreview=false;
      item=await input.database.prepare(
        "UPDATE notion_manual_transfer_items SET status='RUNNING',"+
        "attempts=attempts+1,started_at=?,updated_at=? WHERE id=("+
        "SELECT i.id FROM notion_manual_transfer_items i "+
        "JOIN notion_manual_transfer_runs r ON r.id=i.run_id "+
        "WHERE r.status IN ('QUEUED','RUNNING') AND "+
        "((i.status='PENDING' AND i.next_attempt_at<=?) OR "+
        "(i.status='RUNNING' AND i.started_at<?)) "+
        "ORDER BY r.created_at,i.id LIMIT 1) "+
        "RETURNING id,run_id,scope,profile_id,notion_page_id,preview_hash,attempts"
      ).bind(now,now,now,stale).first<Omit<Job,"direction"|"area">>();
    }
    if(!item)break;
    total.claimed++;
    const header=await input.database.prepare(
      "SELECT area,direction FROM notion_manual_transfer_runs WHERE id=?"
    ).bind(item.run_id).first<{area:string;direction:NotionManualTransferDirection}>();
    if(!header)throw Error("TRANSFER_RUN_NOT_FOUND");
    try{
      if(isPreview){
        await previewOne(input.database,input.bindings,item,header.direction);
        total.previewed++;
      }else{
        const result=await executeVerified(input.database,input.bindings,{
          ...item,...header,
        });
        if(result==="PARTIAL")total.partial++;else total.done++;
      }
    }catch(error){
      const reason=errorCode(error);
      const terminal=reason==="TRANSFER_PREVIEW_STALE"||
        reason.includes("IDENTITY")||item.attempts>=MAX_ATTEMPTS;
      const date=new Date().toISOString();
      await input.database.prepare(
        "UPDATE notion_manual_transfer_items SET status=?,last_error_code=?,"+
        "next_attempt_at=?,finished_at=?,updated_at=? WHERE id=? AND status=?"
      ).bind(terminal?"FAILED":"PENDING",reason,
        new Date(Date.now()+Math.min(3600,30*2**Math.min(item.attempts,7))*1000).toISOString(),
        terminal?date:null,date,item.id,isPreview?"PREVIEWING":"RUNNING").run();
      if(terminal){
        total.failed++;
        await input.database.prepare("UPDATE notion_manual_transfer_field_results "+
          "SET status='FAILED',reason_code=? WHERE item_id=? AND status='CHANGE'")
          .bind(reason,item.id).run();
      }else total.retried++;
    }
    await updateRun(input.database,item.run_id);
  }
  return total;
}

/** Two-stage owner confirmation: never accept a failed/incomplete preview. */
export async function confirmManualTransferRun(db:D1Database,runId:string,actor:string){
  if(!uuid(runId))throw Error("TRANSFER_RUN_ID_INVALID");
  const head=await db.prepare(
    "SELECT status,requested_by,total_profiles FROM notion_manual_transfer_runs WHERE id=?"
  ).bind(runId).first<{status:string;requested_by:string;total_profiles:number}>();
  if(!head||head.requested_by!==actor)throw Error("TRANSFER_RUN_ACCESS_DENIED");
  if(head.status!=="PREVIEW_READY")throw Error("TRANSFER_PREVIEW_INCOMPLETE");
  const validated=await db.prepare("SELECT COUNT(*) AS n FROM notion_manual_transfer_items "+
    "WHERE run_id=? AND status='PREVIEWED' AND preview_hash IS NOT NULL")
    .bind(runId).first<{n:number}>();
  if(validated?.n!==head.total_profiles)throw Error("TRANSFER_PREVIEW_INCOMPLETE");
  const now=new Date().toISOString();
  const claimed=await db.prepare("UPDATE notion_manual_transfer_runs SET "+
    "status='QUEUED',processed_profiles=0,changed_fields=0,updated_at=? WHERE id=? AND status='PREVIEW_READY'")
    .bind(now,runId).run();
  if(claimed.meta.changes!==1)throw Error("TRANSFER_PREVIEW_CHANGED");
  await db.prepare("UPDATE notion_manual_transfer_items SET status='PENDING',"+
    "attempts=0,started_at=NULL WHERE run_id=? AND status='PREVIEWED'")
    .bind(runId).run();
  return {runId,status:"QUEUED" as const};
}

/** Re-preview only failed records, never reuse stale previews or source values. */
export async function retryManualTransferFailed(db:D1Database,runId:string,actor:string){
  if(!uuid(runId))throw Error("TRANSFER_RUN_ID_INVALID");
  const row=await db.prepare("SELECT area,scope,direction,status,requested_by "+
    "FROM notion_manual_transfer_runs WHERE id=?").bind(runId)
    .first<{area:string;scope:string|null;direction:string;status:string;requested_by:string}>();
  if(!row||row.requested_by!==actor)throw Error("TRANSFER_RUN_ACCESS_DENIED");
  if(!["FAILED","PARTIAL"].includes(row.status))
    throw Error("TRANSFER_RETRY_UNAVAILABLE");
  const failed=await db.prepare("SELECT scope,profile_id,notion_page_id "+
    "FROM notion_manual_transfer_items WHERE run_id=? "+
    "AND status IN ('FAILED','PARTIAL') ORDER BY id")
    .bind(runId).all<LinkRow>();
  const entries=failed.results??[];
  if(!entries.length)throw Error("TRANSFER_NO_FAILED_ITEMS");
  const newId=crypto.randomUUID();
  await db.prepare("INSERT INTO notion_manual_transfer_runs "+
    "(id,area,scope,direction,selection,status,requested_by,total_profiles) "+
    "VALUES (?,?,?,?,'ALL','PREVIEW',?,?)")
    .bind(newId,row.area,row.scope,row.direction,actor,entries.length).run();
  for(let at=0;at<entries.length;at+=40){
    await db.batch(entries.slice(at,at+40).map(link=>db.prepare(
      "INSERT INTO notion_manual_transfer_items "+
      "(run_id,scope,profile_id,notion_page_id) VALUES (?,?,?,?)"
    ).bind(newId,link.scope,link.profile_id,link.notion_page_id)));
  }
  return {runId:newId,items:entries.length,status:"PREVIEW" as const};
}

export async function listManualTransferRuns(db:D1Database){
  if(!await manualTransferSchemaReady(db))return [];
  const result=await db.prepare("SELECT id,area,scope,direction,selection,status,"+
    "total_profiles,processed_profiles,changed_fields,failed_fields,created_at,updated_at "+
    "FROM notion_manual_transfer_runs ORDER BY created_at DESC LIMIT 15").all();
  return result.results??[];
}

export async function readManualTransferRun(
  db:D1Database,runId:string,offset=0,onlyErrors=false,
){
  if(!uuid(runId))throw Error("TRANSFER_RUN_ID_INVALID");
  if(!await manualTransferSchemaReady(db))throw Error("TRANSFER_MIGRATION_REQUIRED");
  if(!Number.isSafeInteger(offset)||offset<0||offset>10000)
    throw Error("TRANSFER_OFFSET_INVALID");
  const run=await db.prepare(
    "SELECT id,area,scope,direction,selection,requested_profile_id,status,"+
    "total_profiles,processed_profiles,changed_fields,failed_fields,created_at,updated_at,finished_at "+
    "FROM notion_manual_transfer_runs WHERE id=?"
  ).bind(runId).first();
  if(!run)throw Error("TRANSFER_RUN_NOT_FOUND");
  const clause=onlyErrors?" AND i.status IN ('PARTIAL','FAILED')":"";
  const rows=await db.prepare(
    "SELECT i.id,i.scope,i.profile_id,i.status,i.attempts,i.changed_fields,i.failed_fields,"+
    "i.last_error_code,i.updated_at FROM notion_manual_transfer_items i "+
    "WHERE i.run_id=?"+clause+" ORDER BY i.id LIMIT 100 OFFSET ?"
  ).bind(runId,offset).all<{id:number;scope:string;profile_id:number;
    status:string;attempts:number;changed_fields:number;failed_fields:number;
    last_error_code:string|null;updated_at:string}>();
  const items=[];
  for(const row of rows.results??[]){
    const fields=await db.prepare(
      "SELECT field_key,status,reason_code,attempts "+
      "FROM notion_manual_transfer_field_results WHERE item_id=? "+
      "ORDER BY field_key LIMIT 150"
    ).bind(row.id).all();
    items.push({...row,fields:fields.results??[]});
  }
  return {run,items,offset,limit:100,hasMore:(rows.results?.length??0)===100,
    onlyErrors};
}
