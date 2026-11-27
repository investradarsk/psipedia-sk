/**
 * Per-field bridge for the 12 *new* typed Notion breed properties.
 * Stores their exact values separately from the historical expert prose in
 * managed_breeds. It only uses the existing 344 ACTIVE work-copy links.
 */
import { readStandaloneReviewLock } from "./notion-reviewed-profile-export.ts";
import { reserveUnifiedField, confirmUnifiedField, assertUnifiedReservationCurrent } from "./notion-unified-field-transfer.ts";
import { readUnifiedAdminEdit } from "./notion-unified-admin-edits.ts";
import { breedAdminFieldReceipt } from "./notion-breed-admin-receipts.ts";
import { planBreedSqlV2FieldWrite } from "./breed-sql-v2-bridge.mjs";
import { notionPageIsTombstoned } from "./admin-record-lifecycle";
import { getManagedBreed } from "@/lib/breed-store";
import {
  breedSqlV2ControlledStatements,breedSqlV2CasGuard,
} from "@/lib/breed-sql-v2-writer.mjs";
import { notionRequest, notionFlagEnabled, notionRichTextProperty,
  type NotionPage, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import {
  emptyBreedControlledValues, parseBreedControlledValues,
  readBreedControlledNotionPage, touchedBreedControlledKeys,
  breedControlledNotionPayload, breedControlledKeys, sameBreedControlledValue, BREED_CONTROLLED_FIELDS,
  validateBreedControlledValue,
} from "@/lib/breed-workcopy-controlled.mjs";

export type ControlledBreedBindings = NotionSyncBindings & {
  NOTION_BREED_SYNC_ENABLED?:string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?:string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?:string;
  BREED_SQL_V2_WRITE_MODE?:string;
  NOTION_UNIFIED_FIELD_SYNC_ENABLED?:string;
};
type Link = { breed_id:number; work_notion_page_id:string; canonical_slug:string; fci_number:number|null; status:string };
type Raw = { breed_id:number; values_json:string; notion_values_json:string; revision:number };
export type ControlledBreedState = {
  values:Record<string,unknown>; revision:number; pendingKeys:string[];
  rejectedKeys?:string[];
};
const normalized=(s:string)=>s.replaceAll("-","").toLowerCase();
const eq=sameBreedControlledValue;
const keys=new Set<string>(breedControlledKeys);

function requireNewEngine(bindings:ControlledBreedBindings) {
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"&&bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED!=="true")throw Error("PROFILE_AUTHORITY_REQUIRES_V2");
  if (!notionFlagEnabled(bindings.NOTION_BREED_WORKCOPY_SYNC_ENABLED) ||
      notionFlagEnabled(bindings.NOTION_BREED_SYNC_ENABLED))
    throw Error("BREED_CONTROLLED_WORKCOPY_INACTIVE");
  if (!/^[0-9a-f-]{36}$/i.test(bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID??""))
    throw Error("BREED_CONTROLLED_SOURCE_INVALID");
}
async function activeLink(database:D1Database,id:number):Promise<Link> {
  const link=await database.prepare(
    "SELECT breed_id,work_notion_page_id,canonical_slug,fci_number,status "+
    "FROM breed_notion_workcopy_links WHERE breed_id=? AND status='ACTIVE'",
  ).bind(id).first<Link>();
  if (!link) throw Error("BREED_CONTROLLED_LINK_MISSING");
  return link;
}
async function verifyPage(page:NotionPage,link:Link,bindings:ControlledBreedBindings) {
  const breed=await getManagedBreed(link.breed_id);
  // Data-source ownership and signed page-link routing stay enforced.
  // The sole BREED identity match is the numeric Psipedia ID; FCI and slug
  // are ordinary editable information and cannot veto unrelated field edits.
  if (!breed || breed.id!==link.breed_id ||
      normalized(page.id)!==normalized(link.work_notion_page_id) ||
      !notionPageBelongsToDataSource(page,bindings.NOTION_BREEDS_WORK_DATA_SOURCE_ID!) ||
      notionRichTextProperty(page,"Psipedia ID")!==String(link.breed_id))
    throw Error("BREED_CONTROLLED_ID_MISMATCH");
}
async function record(database:D1Database,id:number):Promise<Raw|null> {
  return database.prepare(
    "SELECT breed_id,values_json,notion_values_json,revision "+
    "FROM breed_notion_controlled_values WHERE breed_id=?",
  ).bind(id).first<Raw>();
}
/**
 * CAS of the controlled receipt, the breed version and the exact SQL cells
 * are committed in ONE D1 batch. A rejected CAS aborts the entire batch.
 * Versioning the parent also blocks a stale Admin full-form overwrite.
 */
async function commitControlledShadow(args:{
  database:D1Database;breedId:number;row:Raw;values:Record<string,unknown>;
  notion:Record<string,unknown>;changes:Record<string,unknown>;
  incomingNotion:boolean;
  expectedBreedRevision?:string;
  recordAdminReceipts?:boolean;
  authorityReservation?:import("./notion-unified-field-transfer.ts").FieldReservation;
}):Promise<void>{
  const breed=await args.database.prepare(
    "SELECT updated_at FROM managed_breeds WHERE id=?"
  ).bind(args.breedId).first<{updated_at:string}>();
  if(!breed)throw Error("BREED_CONTROLLED_BREED_MISSING");
  if(args.expectedBreedRevision!==undefined && breed.updated_at!==args.expectedBreedRevision)
    throw Error("BREED_CONTROLLED_EDIT_CONFLICT");
  const prior=Date.parse(breed.updated_at);
  if(!Number.isFinite(prior))throw Error("BREED_CONTROLLED_VERSION_INVALID");
  const next=new Date(Math.max(Date.now(),prior+1)).toISOString();
  const sql=args.incomingNotion?
    "UPDATE breed_notion_controlled_values SET values_json=?,notion_values_json=?, "+
    "revision=revision+1,updated_at=? WHERE breed_id=? AND revision=?":
    "UPDATE breed_notion_controlled_values SET values_json=?,revision=revision+1, "+
    "updated_at=? WHERE breed_id=? AND revision=?";
  const now=new Date().toISOString();
  const params=args.incomingNotion?
    [JSON.stringify(args.values),JSON.stringify(args.notion),now,args.breedId,args.row.revision]:
    [JSON.stringify(args.values),now,args.breedId,args.row.revision];
  const authority=args.incomingNotion&&args.authorityReservation?.profileAuthority===true;
  const guard=authority?
    " AND status<>\'archived\' AND NOT EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type=\'BREED\' AND entity_id=managed_breeds.id)"+
    " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=\'breeds\' AND record_id=managed_breeds.id)"+
    " AND NOT EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda=\'breeds\' AND entity_id=CAST(managed_breeds.id AS TEXT))"+
    " AND EXISTS(SELECT 1 FROM breed_notion_workcopy_links WHERE breed_id=managed_breeds.id AND status=\'ACTIVE\' AND work_notion_page_id=?)"+
    " AND EXISTS(SELECT 1 FROM notion_unified_field_state WHERE agenda=\'breeds\' AND entity_id=CAST(managed_breeds.id AS TEXT) AND notion_page_id=? AND field_key=? AND version=? AND status=\'PENDING\')":"";
  const statements=[
    args.database.prepare(sql).bind(...params),
    breedSqlV2CasGuard(args.database),
    args.database.prepare(
      "UPDATE managed_breeds SET updated_at=? WHERE id=? AND updated_at=?"+guard
    ).bind(next,args.breedId,breed.updated_at,...(authority?[args.authorityReservation!.identity.pageId,args.authorityReservation!.identity.pageId,args.authorityReservation!.identity.field,args.authorityReservation!.version]:[])),
    breedSqlV2CasGuard(args.database),
    ...breedSqlV2ControlledStatements(args.database,args.breedId,args.changes),
    ...(args.recordAdminReceipts ? Object.entries(args.changes).flatMap(([key,value]) =>
      breedAdminFieldReceipt(args.database,{breedId:args.breedId,field:"controlled."+key,value,revision:next})) : []),
  ];
  try{await args.database.batch(statements)}
  catch{throw Error("BREED_CONTROLLED_EDIT_CONFLICT")}
}

/** SQL numeric FCI group and Notion select labels have distinct storage
 * types. Translate explicitly, never compare a number with its string label. */
async function canonicalControlledValue(database:D1Database,id:number,key:string):Promise<unknown>{
  const field=BREED_CONTROLLED_FIELDS.find(item=>item.key===key);
  if(!field)throw Error("BREED_CONTROLLED_UNKNOWN_FIELD");
  const sample=key==="fciGroupSelect"?1:field.type==="select"?"":field.type==="multi_select"?[]:null;
  const route=planBreedSqlV2FieldWrite("controlled."+key,sample);
  if(!route||!("column" in route))throw Error("BREED_CONTROLLED_SQL_OWNER_MISSING");
  const raw=await database.prepare("SELECT "+route.column+" AS value FROM "+route.table+
    " WHERE "+(route.table==="managed_breeds"?"id":"breed_id")+"=?").bind(id).first<{value:unknown}>();
  if(!raw)throw Error("BREED_CONTROLLED_CANONICAL_MISSING");
  let actual=raw.value;
  if(route.format==="json-array"){
    if(typeof actual!=="string")throw Error("BREED_CONTROLLED_LIST_UNKNOWN");
    actual=JSON.parse(actual);
  }
  if(key==="fciGroupSelect"&&typeof actual==="number")actual=String(actual);
  if(field.type==="select"&&actual==="")actual=null;
  return validateBreedControlledValue(key,actual);
}

export async function readNewBreedControlledProjection(database:D1Database,id:number){
  const values:Record<string,unknown>={},properties:Record<string,unknown>={};
  for(const key of breedControlledKeys){
    values[key]=await canonicalControlledValue(database,id,key);
    Object.assign(properties,breedControlledNotionPayload(key,values[key]));
  }
  const shadow=await record(database,id);
  if(shadow&&!eq(parseBreedControlledValues(shadow.values_json),values))
    throw Error("BREED_CONTROLLED_SQL_SHADOW_MISMATCH");
  return {values,properties};
}

async function observeControlledV2(database:D1Database,bindings:ControlledBreedBindings,
  link:Link,key:string) {
  const before=await getManagedBreed(link.breed_id);
  const row=await record(database,link.breed_id);
  const active=await activeLink(database,link.breed_id);
  if(!before || !row || active.work_notion_page_id!==link.work_notion_page_id ||
      await notionPageIsTombstoned(database,link.work_notion_page_id))
    throw Error("BREED_CONTROLLED_V2_MAPPING_CHANGED");
  const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(link.work_notion_page_id));
  await verifyPage(page,active,bindings);
  const remote=readBreedControlledNotionPage(page,[key]);
  const remoteValues=remote.values as Record<string,unknown>;
  const shadow=parseBreedControlledValues(row.values_json);
  const actual=await canonicalControlledValue(database,link.breed_id,key);
  const after=await getManagedBreed(link.breed_id);
  const current=await record(database,link.breed_id);
  if(!after || after.updatedAt!==before.updatedAt || current?.revision!==row.revision)
    throw Error("BREED_CONTROLLED_V2_REVISION_CHANGED");
  // The legacy shadow is only transport metadata. Reject disagreement with
  // the typed canonical owner rather than copying the shadow into SQL.
  if(!eq(actual,shadow[key]))throw Error("BREED_CONTROLLED_SQL_SHADOW_MISMATCH");
  return {page,row,revision:after.updatedAt,
    notion:remote.errors.length || !Object.hasOwn(remote.values,key)
      ? {present:false as const} : {present:true as const,value:remoteValues[key]},
    psipedia:{present:true as const,value:actual},
  };
}

async function reserveControlledV2(database:D1Database,bindings:ControlledBreedBindings,
  link:Link,key:string,direction:"pull"|"push"|"observe") {
  const observed=await observeControlledV2(database,bindings,link,key);
  const identity={agenda:"breeds" as const,entityId:String(link.breed_id),
    pageId:link.work_notion_page_id,field:"controlled."+key};
  const receipt=await readUnifiedAdminEdit(database,identity,observed.revision);
  const reservation=await reserveUnifiedField({database,identity,authorityBindings:bindings,
    authorityProperty:observed.page.properties?.[BREED_CONTROLLED_FIELDS.find(field=>field.key===key)?.notion??""],historicalBaseline:null,
    notion:observed.notion,psipedia:observed.psipedia,psipediaEdit:receipt,direction});
  return {...observed,reservation};
}

function state(row:Raw):ControlledBreedState {
  const values=parseBreedControlledValues(row.values_json);
  const notion=parseBreedControlledValues(row.notion_values_json);
  return {values,revision:row.revision,
    pendingKeys:breedControlledKeys.filter((key:string)=>!eq(values[key],notion[key]))};
}
async function seed(database:D1Database,link:Link,page:NotionPage,_bindings:ControlledBreedBindings) {
  // The first verified encounter snapshots only current controlled properties;
  // blank and malformed fields are NOT inferred from old descriptive text.
  const parsed=readBreedControlledNotionPage(page);
  const values=parseBreedControlledValues({...emptyBreedControlledValues(),...parsed.values});
  const json=JSON.stringify(values);
  {
    const previous=await database.prepare("SELECT updated_at FROM managed_breeds WHERE id=?")
      .bind(link.breed_id).first<{updated_at:string}>();
    if(!previous)throw Error("BREED_CONTROLLED_BREED_MISSING");
    const prior=Date.parse(previous.updated_at);
    if(!Number.isFinite(prior))throw Error("BREED_CONTROLLED_VERSION_INVALID");
    const next=new Date(Math.max(Date.now(),prior+1)).toISOString();
    try{
      await database.batch([
        database.prepare(
          "INSERT OR IGNORE INTO breed_notion_controlled_values "+
          "(breed_id,values_json,notion_values_json,revision) VALUES (?,?,?,0)"
        ).bind(link.breed_id,json,json),
        breedSqlV2CasGuard(database),
        database.prepare("UPDATE managed_breeds SET updated_at=? WHERE id=? AND updated_at=?")
          .bind(next,link.breed_id,previous.updated_at),
        breedSqlV2CasGuard(database),
        database.prepare("INSERT OR IGNORE INTO breed_public_facts (breed_id) VALUES (?)")
          .bind(link.breed_id),
        ...breedSqlV2ControlledStatements(database,link.breed_id,values),
      ]);
    }catch(error){
      if(!await record(database,link.breed_id))throw error;
      // A concurrent seeder won; leave its values untouched.
    }
  }
  if (parsed.errors.length)
    console.warn("breed_controlled_seed_incomplete",{breedId:link.breed_id,count:parsed.errors.length});
  const saved=await record(database,link.breed_id);
  if (!saved) throw Error("BREED_CONTROLLED_SEED_FAILED");
  return saved;
}

/** Called by the Admin's authenticated editor GET; never rewrites Notion. */
export async function getBreedControlledState(args:{
  database:D1Database;bindings:ControlledBreedBindings;breedId:number;
}):Promise<ControlledBreedState> {
  requireNewEngine(args.bindings);
  const link=await activeLink(args.database,args.breedId);
  let row=await record(args.database,args.breedId);
  if (!row) {
    if(args.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"||args.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED==="true")
      throw Error("BREED_CONTROLLED_V2_BASELINE_UNAVAILABLE");
    const page=await notionRequest<NotionPage>(args.bindings,
      "/pages/"+encodeURIComponent(link.work_notion_page_id));
    await verifyPage(page,link,args.bindings);
    row=await seed(args.database,link,page,args.bindings);
  }
  return state(row);
}

/**
 * An incoming signed webhook is authoritative ONLY for its named property
 * IDs. Invalid controlled values are reported but never block other fields
 * or existing prose fields in the same webhook.
 */
export async function receiveBreedControlledNotionEdit(args:{
  database:D1Database;bindings:ControlledBreedBindings;breedId:number;
  page:NotionPage;changedProperties:readonly string[];
}):Promise<{updated:boolean;invalidKeys:string[]}> {
  requireNewEngine(args.bindings);
  if(args.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text"&&await readStandaloneReviewLock(args.database,"breeds",args.breedId))return {updated:false,invalidKeys:[]};
  const link=await activeLink(args.database,args.breedId);
  await verifyPage(args.page,link,args.bindings);
  const edited=touchedBreedControlledKeys(args.page,args.changedProperties);
  if (!edited.length) return {updated:false,invalidKeys:[]};
  const parsed=readBreedControlledNotionPage(args.page,edited);
  let row=await record(args.database,args.breedId);
  if (!row) {
    if(args.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED==="true")
      throw Error("BREED_CONTROLLED_V2_BASELINE_UNAVAILABLE");
    await seed(args.database,link,args.page,args.bindings);
    return {updated:true,invalidKeys:parsed.errors.map((e:{key:string})=>e.key)};
  }
  if (!Object.keys(parsed.values).length)
    return {updated:false,invalidKeys:parsed.errors.map((e:{key:string})=>e.key)};
  if(args.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED==="true") {
    const invalidKeys=parsed.errors.map((e:{key:string})=>e.key);
    let updated=false;
    for(const key of Object.keys(parsed.values)) {
      try {
        const pilot=await reserveControlledV2(args.database,args.bindings,link,key,"pull");
        if(!pilot.reservation)continue;
        const value=pilot.reservation.value;
        const values={...parseBreedControlledValues(pilot.row.values_json),[key]:value};
        const notion={...parseBreedControlledValues(pilot.row.notion_values_json),[key]:value};
        if(pilot.reservation.profileAuthority){
          const latest=await observeControlledV2(args.database,args.bindings,link,key);
          if(latest.revision!==pilot.revision||latest.row.revision!==pilot.row.revision||!eq(latest.notion,pilot.notion)||latest.page.last_edited_time!==pilot.page.last_edited_time)throw Error("BREED_CONTROLLED_V2_REVISION_CHANGED");
          await assertUnifiedReservationCurrent(args.database,pilot.reservation);
        }
        await commitControlledShadow({database:args.database,breedId:link.breed_id,row:pilot.row,
          values,notion,changes:{[key]:value},incomingNotion:true,expectedBreedRevision:pilot.revision,authorityReservation:pilot.reservation});
        const fresh=await observeControlledV2(args.database,args.bindings,link,key);
        await confirmUnifiedField(args.database,pilot.reservation,fresh.notion,fresh.psipedia);
        updated=true;
      }catch(error) {
        invalidKeys.push(key);
        console.warn("breed_controlled_v2_pending",{breedId:link.breed_id,key,
          code:error instanceof Error?error.message:"UNKNOWN"});
      }
    }
    return {updated,invalidKeys};
  }
  for (let attempt=0;attempt<3;attempt++) {
    const values=parseBreedControlledValues(row.values_json);
    const notion=parseBreedControlledValues(row.notion_values_json);
    let modified=false;
    for (const [key,value] of Object.entries(parsed.values)) {
      if (!eq(values[key],value) || !eq(notion[key],value)) modified=true;
      values[key]=value;
      notion[key]=value;
    }
    if (!modified) return {updated:false,invalidKeys:parsed.errors.map((e:{key:string})=>e.key)};
    {
      const changed=Object.fromEntries(Object.entries(parsed.values)
        .filter(([key,value])=>!eq(parseBreedControlledValues(row!.values_json)[key],value)));
      try{
        await commitControlledShadow({database:args.database,breedId:link.breed_id,
          row,values,notion,changes:changed,incomingNotion:true});
        return {updated:true,invalidKeys:parsed.errors.map((e:{key:string})=>e.key)};
      }catch(error){
        if(!(error instanceof Error)||error.message!=="BREED_CONTROLLED_EDIT_CONFLICT")
          throw error;
      }
    }
    row=await record(args.database,link.breed_id);
    if (!row) throw Error("BREED_CONTROLLED_RECORD_DISAPPEARED");
  }
  throw Error("BREED_CONTROLLED_CONCURRENT_EDIT");
}
async function acknowledge(database:D1Database,id:number,key:string,value:unknown) {
  for (let attempt=0;attempt<3;attempt++) {
    const row=await record(database,id);
    if (!row) throw Error("BREED_CONTROLLED_RECORD_MISSING");
    const values=parseBreedControlledValues(row.values_json);
    if (!eq(values[key],value)) return; // Another Admin/Notion edit is newer.
    const notion=parseBreedControlledValues(row.notion_values_json);
    notion[key]=value;
    const result=await database.prepare(
      "UPDATE breed_notion_controlled_values SET notion_values_json=?, "+
      "revision=revision+1,updated_at=? WHERE breed_id=? AND revision=?",
    ).bind(JSON.stringify(notion),new Date().toISOString(),id,row.revision).run();
    if (result.meta.changes===1) return;
  }
  throw Error("BREED_CONTROLLED_ACK_CONCURRENT");
}

/**
 * Admin edits use an explicit changedKeys array and optimistic D1 revision.
 * A failure to PATCH Notion leaves the locally saved field visibly pending.
 * An intervening remote edit to the same cell is NOT silently overwritten.
 */
export async function saveBreedControlledFromAdmin(args:{
  database:D1Database;bindings:ControlledBreedBindings;breedId:number;
  expectedRevision:number;changes:Record<string,unknown>;
}):Promise<ControlledBreedState> {
  requireNewEngine(args.bindings);
  const link=await activeLink(args.database,args.breedId);
  if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision<0 ||
      !args.changes || typeof args.changes!=="object" || Array.isArray(args.changes))
    throw Error("BREED_CONTROLLED_INPUT_INVALID");
  const edited=Object.keys(args.changes);
  if (edited.some(key=>!keys.has(key))) throw Error("BREED_CONTROLLED_UNKNOWN_FIELD");
  const row=await record(args.database,args.breedId);
  if (!row) throw Error("BREED_CONTROLLED_NOT_LOADED");
  if (row.revision!==args.expectedRevision) throw Error("BREED_CONTROLLED_EDIT_CONFLICT");
  const values=parseBreedControlledValues(row.values_json);
  const notion=parseBreedControlledValues(row.notion_values_json);
  const changed:string[]=[];
  const rejectedKeys:string[]=[];
  for (const key of edited) {
    try {
      const value=validateBreedControlledValue(key,args.changes[key]);
      if (!eq(values[key],value)) { values[key]=value;changed.push(key); }
    } catch {
      rejectedKeys.push(key); // One invalid field never blocks valid siblings.
    }
  }
  const retry=edited.filter(key=>!rejectedKeys.includes(key) &&
    !changed.includes(key) && !eq(values[key],notion[key]));
  if (!changed.length && !retry.length) return {...state(row),rejectedKeys};
  if (changed.length) {
    {
      await commitControlledShadow({
        database:args.database,breedId:args.breedId,row,values,notion,
        changes:Object.fromEntries(changed.map(key=>[key,values[key]])),
        incomingNotion:false,
        recordAdminReceipts:args.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED==="true",
      });
    }
  }
  if(args.bindings.NOTION_PROFILE_AUTHORITY_MODE==="validated-text")return {...state((await record(args.database,args.breedId))!),rejectedKeys};
  for (const key of [...new Set([...changed,...retry])]) {
    try {
      const pilot=args.bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED==="true"
        ? await reserveControlledV2(args.database,args.bindings,link,key,"push") : null;
      if(pilot && !pilot.reservation){await acknowledge(args.database,args.breedId,key,values[key]);continue;}
      if(pilot?.reservation && !eq(pilot.reservation.value,values[key]))throw Error("BREED_CONTROLLED_V2_REVISION_CHANGED");
      const page=pilot?.page??await notionRequest<NotionPage>(args.bindings,
        "/pages/"+encodeURIComponent(link.work_notion_page_id));
      await verifyPage(page,link,args.bindings);
      const remote=readBreedControlledNotionPage(page,[key]);
      if (remote.errors.length) throw Error("BREED_CONTROLLED_REMOTE_INVALID");
      if (!pilot && !eq((remote.values as Record<string,unknown>)[key],notion[key]))
        throw Error("BREED_CONTROLLED_REMOTE_CHANGED");
      if (!eq((remote.values as Record<string,unknown>)[key],values[key])) {
        // Notion has no field-level CAS. Recheck the page revision and exact
        // target cell immediately before PATCH; unrelated concurrent edits
        // are deferred instead of risking a lost update.
        const preflight=await notionRequest<NotionPage>(args.bindings,
          "/pages/"+encodeURIComponent(link.work_notion_page_id));
        await verifyPage(preflight,link,args.bindings);
        const latestCell=readBreedControlledNotionPage(preflight,[key]);
        if (preflight.last_edited_time!==page.last_edited_time ||
            latestCell.errors.length || !eq((latestCell.values as Record<string,unknown>)[key],pilot ? (remote.values as Record<string,unknown>)[key] : notion[key]))
          throw Error("BREED_CONTROLLED_CONCURRENT_NOTION_EDIT");
        if(pilot){
          const current=await getManagedBreed(link.breed_id);
          const active=await activeLink(args.database,link.breed_id);
          if(!current || current.updatedAt!==pilot.revision || active.work_notion_page_id!==link.work_notion_page_id ||
              await notionPageIsTombstoned(args.database,link.work_notion_page_id))
            throw Error("BREED_CONTROLLED_V2_REVISION_CHANGED");
        }
        await notionRequest(args.bindings,
          "/pages/"+encodeURIComponent(link.work_notion_page_id),{
            method:"PATCH",body:JSON.stringify({properties:breedControlledNotionPayload(key,values[key])}),
          });
      }
      const confirmed=await notionRequest<NotionPage>(args.bindings,
        "/pages/"+encodeURIComponent(link.work_notion_page_id));
      await verifyPage(confirmed,link,args.bindings);
      const check=readBreedControlledNotionPage(confirmed,[key]);
      if (check.errors.length || !eq((check.values as Record<string,unknown>)[key],values[key]))
        throw Error("BREED_CONTROLLED_WRITE_NOT_CONFIRMED");
      if(pilot?.reservation){
        const fresh=await observeControlledV2(args.database,args.bindings,link,key);
        await confirmUnifiedField(args.database,pilot.reservation,fresh.notion,fresh.psipedia);
      }
      await acknowledge(args.database,args.breedId,key,values[key]);
    } catch(error) {
      console.warn("breed_controlled_write_pending",{
        breedId:args.breedId,key,code:error instanceof Error?error.message:"UNKNOWN",
      });
    }
  }
  const latest=await record(args.database,args.breedId);
  if (!latest) throw Error("BREED_CONTROLLED_RECORD_MISSING");
  return {...state(latest),rejectedKeys};
}

export async function recoverControlledBreedV2Field(database:D1Database,bindings:ControlledBreedBindings,id:number,pageId:string,key:string,direction:"observe"|"pull"|"push"="observe"){
  requireNewEngine(bindings);
  if(bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED!=="true"||!keys.has(key))throw Error("BREED_CONTROLLED_RECOVERY_SCOPE");
  const link=await activeLink(database,id);
  if(link.work_notion_page_id!==pageId)throw Error("BREED_CONTROLLED_RECOVERY_SCOPE");
  const planned=await reserveControlledV2(database,bindings,link,key,direction);
  if(direction==="push"&&planned.reservation){
    const fresh=await observeControlledV2(database,bindings,link,key);
    if(fresh.revision!==planned.revision||fresh.row.revision!==planned.row.revision||
       fresh.page.last_edited_time!==planned.page.last_edited_time||!eq(fresh.notion,planned.notion)||!eq(fresh.psipedia,planned.psipedia))
      throw Error("BREED_CONTROLLED_V2_REVISION_CHANGED");
    const value=validateBreedControlledValue(key,planned.reservation.value);
    await assertUnifiedReservationCurrent(database,planned.reservation);
    await notionRequest(bindings,"/pages/"+encodeURIComponent(link.work_notion_page_id),{
      method:"PATCH",body:JSON.stringify({properties:breedControlledNotionPayload(key,value)}),
    });
    const verified=await observeControlledV2(database,bindings,link,key);
    await confirmUnifiedField(database,planned.reservation,verified.notion,verified.psipedia);
    await acknowledge(database,id,key,value);
  }
  if(direction==="pull"&&planned.reservation){
    const fresh=await observeControlledV2(database,bindings,link,key);
    if(fresh.revision!==planned.revision||fresh.row.revision!==planned.row.revision||!eq(fresh.notion,planned.notion))throw Error("BREED_CONTROLLED_V2_REVISION_CHANGED");
    await assertUnifiedReservationCurrent(database,planned.reservation);
    const value=planned.reservation.value;
    await commitControlledShadow({database,breedId:id,row:planned.row,values:{...parseBreedControlledValues(planned.row.values_json),[key]:value},notion:{...parseBreedControlledValues(planned.row.notion_values_json),[key]:value},changes:{[key]:value},incomingNotion:true,expectedBreedRevision:planned.revision,authorityReservation:planned.reservation});
    const verified=await observeControlledV2(database,bindings,link,key);
    await confirmUnifiedField(database,planned.reservation,verified.notion,verified.psipedia);
  }
}

export function controlledBreedV2RecoveryFields():string[]{
  return [...keys].map(key=>"controlled."+key).sort();
}

export async function retryControlledBreedV2AdminField(database:D1Database,bindings:ControlledBreedBindings,id:number,pageId:string,key:string){
  requireNewEngine(bindings);
  if(bindings.NOTION_UNIFIED_FIELD_SYNC_ENABLED!=="true"||!keys.has(key))throw Error("BREED_CONTROLLED_RETRY_SCOPE");
  const link=await activeLink(database,id);
  if(link.work_notion_page_id!==pageId)throw Error("BREED_CONTROLLED_RETRY_SCOPE");
  const row=await record(database,id);
  if(!row)throw Error("BREED_CONTROLLED_RECORD_MISSING");
  const values=parseBreedControlledValues(row.values_json);
  // Existing exact controlled revision means this is a retry, not a new edit.
  await saveBreedControlledFromAdmin({database,bindings,breedId:id,expectedRevision:row.revision,changes:{[key]:values[key]}});
}


/** Export the existing SQL-owned controlled cells, never synthesized defaults
 * or an unverified Notion observation. A stale shadow fails closed. */
export async function readReviewedBreedControlledProjection(database:D1Database,id:number){
  const row=await record(database,id);
  if(!row)throw Error("BREED_CONTROLLED_CANONICAL_MISSING");
  const shadow=JSON.parse(row.values_json) as Record<string,unknown>;
  const properties:Record<string,unknown>={};
  for(const key of breedControlledKeys){
    if(!Object.hasOwn(shadow,key))throw Error("BREED_CONTROLLED_CANONICAL_INCOMPLETE");
    const actual=await canonicalControlledValue(database,id,key);
    if(!eq(actual,shadow[key]))throw Error("BREED_CONTROLLED_SQL_SHADOW_MISMATCH");
    Object.assign(properties,breedControlledNotionPayload(key,actual));
  }
  if((await record(database,id))?.revision!==row.revision)throw Error("BREED_CONTROLLED_EDIT_CONFLICT");
  return properties;
}
