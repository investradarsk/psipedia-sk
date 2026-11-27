import { decodeBreedCursor, encodeBreedCursor } from "./notion-breed-recovery-cursor.mjs";
import { nonMirroredBreedPredicate } from "./notion-breed-unified-policy.ts";
import { UNIFIED_SYNC_AGENDAS, decideUnifiedField, type FieldIdentity, type UnifiedSyncAgenda } from "./notion-unified-field-sync.ts";
import { readUnifiedFieldState } from "./notion-unified-field-state.ts";
import { recoverDirectoryV2Field, directoryV2RecoveryFields, type NotionDirectorySyncBindings } from "./notion-directory-sync.ts";
import { recoverBreedV2Field, breedV2RecoveryFields, retryBreedV2AdminField, type BreedWorkCopyBindings } from "./notion-breed-workcopy-sync.ts";
import { recoverControlledBreedV2Field, controlledBreedV2RecoveryFields, retryControlledBreedV2AdminField, type ControlledBreedBindings } from "./notion-breed-workcopy-controlled.ts";
import { recoverEventV2Field, syncEventAdminFields, type EventFieldSyncBindings } from "./notion-event-field-sync.ts";
import { EVENT_NOTION_PATHS, type EventNotionField } from "./notion-event-field-contract.ts";
import { recoverEventsHelpV2Field, type NotionEventsHelpSyncBindings } from "./notion-events-help-sync.ts";
import { syncOneAdminHelpRecord } from "./notion-targeted-admin-help.ts";
import { recoverEshopV2Field, runNotionEshopSyncSweep, type NotionEshopSyncBindings, type EshopEventField } from "./notion-eshop-sync.ts";
import { ESHOP_V2_FIELDS } from "./notion-eshop-v2-contract.ts";
import { ORGANIZATION_V2_COLUMNS, ORGANIZATION_LOCATION_V2_COLUMNS } from "./notion-organization-admin-receipts.ts";
import { ADOPTION_V2_FIELDS } from "./notion-adoption-v2-contract.ts";
import { LOST_FOUND_V2_FIELDS } from "./notion-lost-found-v2-contract.ts";
import { HELP_CASE_V2_FIELDS, HELP_CASE_V2_SEO } from "./notion-help-case-v2-contract.ts";

type Bindings=NotionDirectorySyncBindings & BreedWorkCopyBindings & ControlledBreedBindings &
  EventFieldSyncBindings & NotionEventsHelpSyncBindings & NotionEshopSyncBindings & {
    NOTION_UNIFIED_FIELD_SYNC_ENABLED?:string;
    NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?:string;
  };
type Candidate={agenda:UnifiedSyncAgenda;entity_id:string;notion_page_id:string;field_key:string};
const identity=(row:Candidate):FieldIdentity=>({agenda:row.agenda,entityId:row.entity_id,pageId:row.notion_page_id,field:row.field_key});
const mappingSql:Record<UnifiedSyncAgenda,string>={
  directory:"SELECT directory_profile_id AS id,notion_page_id AS page FROM directory_notion_sync WHERE directory_profile_id>=? ORDER BY directory_profile_id LIMIT 1",
  breeds:"SELECT breed_id AS id,work_notion_page_id AS page FROM breed_notion_workcopy_links WHERE status='ACTIVE' AND breed_id>=? ORDER BY breed_id LIMIT 1",
  events:"SELECT event_id AS id,notion_page_id AS page FROM event_notion_sync WHERE event_id>=? ORDER BY event_id LIMIT 1",
  eshops:"SELECT eshop_id AS id,notion_page_id AS page FROM eshop_notion_sync WHERE eshop_id>=? ORDER BY eshop_id LIMIT 1",
  organizations:"SELECT entity_id AS id,notion_page_id AS page FROM notion_agenda_sync WHERE agenda='organizations' AND entity_id>=? ORDER BY entity_id LIMIT 1",
  adoptions:"SELECT entity_id AS id,notion_page_id AS page FROM notion_agenda_sync WHERE agenda='adoptions' AND entity_id>=? ORDER BY entity_id LIMIT 1",
  "lost-found":"SELECT entity_id AS id,notion_page_id AS page FROM notion_agenda_sync WHERE agenda='lost-found' AND entity_id>=? ORDER BY entity_id LIMIT 1",
  "help-cases":"SELECT entity_id AS id,notion_page_id AS page FROM notion_agenda_sync WHERE agenda='help-cases' AND entity_id>=? ORDER BY entity_id LIMIT 1",
};
async function fields(database:D1Database,agenda:UnifiedSyncAgenda,id:number):Promise<string[]>{
  switch(agenda){
    case "directory":return directoryV2RecoveryFields(database,id);
    case "breeds":return [...breedV2RecoveryFields(),...controlledBreedV2RecoveryFields()].sort();
    case "events":return [...EVENT_NOTION_PATHS].sort();
    case "eshops":return Object.keys(ESHOP_V2_FIELDS).sort();
    case "organizations":return [...Object.keys(ORGANIZATION_V2_COLUMNS),...Object.keys(ORGANIZATION_LOCATION_V2_COLUMNS)].sort();
    case "adoptions":return Object.keys(ADOPTION_V2_FIELDS).sort();
    case "lost-found":return Object.keys(LOST_FOUND_V2_FIELDS).sort();
    case "help-cases":return [...Object.keys(HELP_CASE_V2_FIELDS),...Object.keys(HELP_CASE_V2_SEO)].sort();
  }
}
async function observe(database:D1Database,bindings:Bindings,field:FieldIdentity,direction:"observe"|"pull"="observe"){
  const id=Number(field.entityId);
  if(!Number.isSafeInteger(id)||id<1)throw Error("UNIFIED_RECOVERY_ID");
  switch(field.agenda){
    case "directory":return recoverDirectoryV2Field(database,bindings,id,field.pageId,field.field,direction);
    case "breeds":return field.field.startsWith("controlled.")
      ?recoverControlledBreedV2Field(database,bindings,id,field.pageId,field.field.slice(11),direction)
      :recoverBreedV2Field(database,bindings,id,field.pageId,field.field,direction);
    case "events":return recoverEventV2Field(database,bindings,id,field.pageId,field.field,direction);
    case "eshops":return recoverEshopV2Field(database,bindings,id,field.pageId,field.field,direction);
    default:return recoverEventsHelpV2Field(database,bindings,field.agenda,id,field.pageId,field.field,direction);
  }
}
async function retryVerifiedAdminEdit(database:D1Database,bindings:Bindings,identity:FieldIdentity){
  if(bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED!=="true")return false;
  const state=await readUnifiedFieldState(database,identity);
  if(!state||state.status!=="REVIEW"||state.reason!=="RECOVERY_DIRECTION_REQUIRED"||
     !state.baselineVersion||!state.psipediaEdit||state.baseline===undefined||
     state.notion===undefined||state.psipedia===undefined)return false;
  const edit=state.psipediaEdit;
  // A read-only observation never fabricates a human edit. Only the exact
  // current revision-bound receipt may initiate a retry. The target adapter
  // re-observes, re-reserves and verifies the field before/after mutation.
  if(edit.source!=="psipedia"||edit.baselineVersion!==state.baselineVersion||
     JSON.stringify(edit.identity)!==JSON.stringify(identity)||
     JSON.stringify(edit.value)!==JSON.stringify(state.psipedia))return false;
  if(decideUnifiedField({identity,baseline:{value:state.baseline,version:state.baselineVersion},
    notion:{present:true,value:state.notion},psipedia:{present:true,value:state.psipedia},
    psipediaEdit:edit}).action!=="push")return false;
  return pushRecoveryField(database,bindings,identity);
}
async function pushRecoveryField(database:D1Database,bindings:Bindings,identity:FieldIdentity,initial=false){
  if(bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED!=="true")return false;
  const id=Number(identity.entityId);
  switch(identity.agenda){
    case "events":
      return await syncEventAdminFields({database,bindings,eventId:id,changedFields:[identity.field as EventNotionField]})==="synced";
    case "eshops":{
      const result=await runNotionEshopSyncSweep({database,bindings,targetShopId:id,adminChangedFields:[identity.field as EshopEventField]});
      return result.enabled&&result.schemaReady&&!result.failed&&Boolean(result.pushedToNotion||result.unchanged);
    }
    case "organizations":case "adoptions":case "lost-found":case "help-cases":
      return await syncOneAdminHelpRecord({database,bindings,agenda:identity.agenda,entityId:id,expectedNotionPageId:identity.pageId,changedHelpFields:[identity.field]})==="synced";
    case "directory":
      await recoverDirectoryV2Field(database,bindings,id,identity.pageId,identity.field,"push");return true;
    case "breeds":
      if(identity.field.startsWith("controlled.")){if(initial)await recoverControlledBreedV2Field(database,bindings,id,identity.pageId,identity.field.slice(11),"push");else await retryControlledBreedV2AdminField(database,bindings,id,identity.pageId,identity.field.slice(11));return true;}
      return retryBreedV2AdminField(database,bindings,id,identity.pageId,identity.field);
  }
}
async function recoverOne(database:D1Database,bindings:Bindings,row:Candidate){
  const key=identity(row);
  await observe(database,bindings,key);
  const observed=await readUnifiedFieldState(database,key);
  // Catch missed inbound events only where one current value differs from a
  // verified baseline. The adapter re-observes and reserves before writing.
  // A confirmed blank may be filled from SQL without a fabricated receipt;
  // its scoped marker must survive the adapter's fresh pre-write check.
  // Never fabricate a signed event, resolve a dual edit or erase with blanks.
  if(observed?.status==="REVIEW"&&observed.reason==="INITIAL_FILL_PULL"){
    await observe(database,bindings,key,"pull");
  }else if(observed?.status==="REVIEW"&&(observed.reason==="INITIAL_FILL_PUSH"||observed.reason==="CONFIRMED_BLANK_PUSH")){
    await pushRecoveryField(database,bindings,key,true);
  }else if(observed?.status==="REVIEW"&&observed.reason==="RECOVERY_DIRECTION_REQUIRED"&&
    observed.baselineVersion&&observed.baseline!==undefined&&observed.notion!==undefined&&observed.psipedia!==undefined&&
    decideUnifiedField({identity:key,baseline:{value:observed.baseline,version:observed.baselineVersion},
      notion:{present:true,value:observed.notion},psipedia:{present:true,value:observed.psipedia}}).action==="pull"){
    await observe(database,bindings,key,"pull");
  }else await retryVerifiedAdminEdit(database,bindings,key);
  const state=await readUnifiedFieldState(database,key);
  return state?.status==="SYNCED"?"synced":"review";
}

/** Existing minute cron, hard caps: at most two expired/REVIEW fields and
 * one initialization field and one authenticated-edit probe. Never replay the original body of a failed
 * remote write. Durable claims prevent overlapping cron runs from stealing
 * the same work; a failed field cannot prevent later records from rotating. */
export async function runNotionUnifiedRecoverySweep(input:{database:D1Database;bindings:Bindings;now?:Date}){
  const {database,bindings}=input;
  const result={checked:0,synced:0,review:0,failed:0,seeded:0};
  if(bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED!=="true")return result;
  const now=input.now??new Date(), stamp=now.toISOString();
  const expired=new Date(now.getTime()-600_000).toISOString();
  const next=new Date(now.getTime()+3600_000).toISOString();
  for(let i=0;i<2;i++){
    const row=await database.prepare(
      "UPDATE notion_unified_field_state SET recovery_after=? WHERE rowid=("+
      "SELECT rowid FROM notion_unified_field_state WHERE (recovery_after IS NULL OR recovery_after<=?) "+
      "AND ((status='PENDING' AND updated_at<=?) OR status='REVIEW') "+
      "AND NOT (agenda='breeds' AND field_key='accent') "+
      "AND NOT (status='REVIEW' AND reason='MISSING_FIELD' AND "+nonMirroredBreedPredicate()+") "+
      "AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence f WHERE f.agenda=notion_unified_field_state.agenda AND f.entity_id=notion_unified_field_state.entity_id) "+
      "ORDER BY COALESCE(recovery_after,''),updated_at,agenda,entity_id,field_key LIMIT 1) "+
      "RETURNING agenda,entity_id,notion_page_id,field_key"
    ).bind(next,stamp,expired).first<Candidate>();
    if(!row)break;
    result.checked++;
    try{const outcome=await recoverOne(database,bindings,row);result[outcome]++;}
    catch{result.failed++;}
  }
  // Prioritize authenticated edits even when the first direct writeback failed
  // before reserving any field. No stale receipt is replayed as a mutation.
  const receipt = await database.prepare(
    "UPDATE notion_unified_admin_field_edits SET recovery_after=? WHERE rowid=("+
    "SELECT e.rowid FROM notion_unified_admin_field_edits e "+
    "LEFT JOIN notion_unified_field_state s ON s.agenda=e.agenda AND s.entity_id=e.entity_id AND s.notion_page_id=e.notion_page_id AND s.field_key=e.field_key "+
    "WHERE (s.version IS NULL OR (s.status='SYNCED' AND s.baseline_version=e.baseline_version)) "+
    "AND (e.recovery_after IS NULL OR e.recovery_after<=?) "+
    "AND NOT "+nonMirroredBreedPredicate("e.")+" "+
    "AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence f WHERE f.agenda=e.agenda AND f.entity_id=e.entity_id) "+
    "ORDER BY e.observed_at,e.agenda,e.entity_id,e.field_key LIMIT 1) "+
    "RETURNING agenda,entity_id,notion_page_id,field_key"
  ).bind(next,stamp).first<Candidate>();
  if(receipt){
    result.checked++;
    try{const outcome=await recoverOne(database,bindings,receipt);result[outcome]++;}
    catch{result.failed++;}
  }
  await database.batch(UNIFIED_SYNC_AGENDAS.map(agenda=>database.prepare(
    "INSERT OR IGNORE INTO notion_unified_recovery_cursor(agenda) VALUES(?)").bind(agenda)));
  const cursor=await database.prepare(
    "UPDATE notion_unified_recovery_cursor SET lease_until=?,last_run_at=?,version=version+1 WHERE agenda=("+
    "SELECT agenda FROM notion_unified_recovery_cursor WHERE lease_until IS NULL OR lease_until<=? "+
    "ORDER BY last_run_at,agenda LIMIT 1) RETURNING agenda,entity_id,field_offset,version"
  ).bind(new Date(now.getTime()+600_000).toISOString(),stamp,stamp)
    .first<{agenda:UnifiedSyncAgenda;entity_id:number;field_offset:number;version:number}>();
  if(!cursor)return result;
  let id=cursor.entity_id, offset=cursor.field_offset;
  const breedCatalog=cursor.agenda==="breeds"?await fields(database,"breeds",0):null;
  if(breedCatalog){const decoded=decodeBreedCursor(breedCatalog,id,offset);id=decoded.id;offset=decoded.offset;}
  try{
    const mapping=await database.prepare(mappingSql[cursor.agenda]).bind(id).first<{id:number;page:string}>();
    if(!mapping){id=0;offset=0;}
    else{
      if(id!==mapping.id){id=mapping.id;offset=0;}
      const catalog=breedCatalog??await fields(database,cursor.agenda,id);
      if(offset>=catalog.length){id++;offset=0;}
      else{
        const key={agenda:cursor.agenda,entityId:String(id),pageId:mapping.page,field:catalog[offset]};
        offset++;
        const existing=await readUnifiedFieldState(database,key);
        if(!existing||existing.status==="SYNCED"){
          if(!existing)result.seeded++;
          result.checked++;
          try{const outcome=await recoverOne(database,bindings,{agenda:key.agenda,entity_id:key.entityId,notion_page_id:key.pageId,field_key:key.field});result[outcome]++;}
          catch{result.failed++;}
        }
      }
    }
  }catch{result.failed++;}
  finally{
    await database.prepare("UPDATE notion_unified_recovery_cursor SET entity_id=?,field_offset=?,lease_until=NULL WHERE agenda=? AND version=?")
      .bind(id,breedCatalog?encodeBreedCursor(breedCatalog,offset):offset,cursor.agenda,cursor.version).run();
  }
  return result;
}
