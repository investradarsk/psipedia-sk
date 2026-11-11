/**
 * Per-field bridge for the 12 *new* typed Notion breed properties.
 * Stores their exact values separately from the historical expert prose in
 * managed_breeds. It only uses the existing 344 ACTIVE work-copy links.
 */
import { getManagedBreed } from "@/lib/breed-store";
import { notionRequest, notionFlagEnabled, notionRichTextProperty,
  type NotionPage, type NotionSyncBindings } from "@/lib/notion-sync-shared";
import { notionPageBelongsToDataSource } from "@/lib/notion-sync-page-ownership";
import {
  emptyBreedControlledValues, parseBreedControlledValues,
  readBreedControlledNotionPage, touchedBreedControlledKeys,
  breedControlledNotionPayload, breedControlledKeys, sameBreedControlledValue,
  validateBreedControlledValue,
} from "@/lib/breed-workcopy-controlled.mjs";

export type ControlledBreedBindings = NotionSyncBindings & {
  NOTION_BREED_SYNC_ENABLED?:string;
  NOTION_BREED_WORKCOPY_SYNC_ENABLED?:string;
  NOTION_BREEDS_WORK_DATA_SOURCE_ID?:string;
};
type Link = { breed_id:number; work_notion_page_id:string; canonical_slug:string; fci_number:number; status:string };
type Raw = { breed_id:number; values_json:string; notion_values_json:string; revision:number };
export type ControlledBreedState = {
  values:Record<string,unknown>; revision:number; pendingKeys:string[];
  rejectedKeys?:string[];
};
const normalized=(s:string)=>s.replaceAll("-","").toLowerCase();
const eq=sameBreedControlledValue;
const keys=new Set<string>(breedControlledKeys);

function requireNewEngine(bindings:ControlledBreedBindings) {
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
function state(row:Raw):ControlledBreedState {
  const values=parseBreedControlledValues(row.values_json);
  const notion=parseBreedControlledValues(row.notion_values_json);
  return {values,revision:row.revision,
    pendingKeys:breedControlledKeys.filter((key:string)=>!eq(values[key],notion[key]))};
}
async function seed(database:D1Database,link:Link,page:NotionPage) {
  // The first verified encounter snapshots only current controlled properties;
  // blank and malformed fields are NOT inferred from old descriptive text.
  const parsed=readBreedControlledNotionPage(page);
  const values=parseBreedControlledValues({...emptyBreedControlledValues(),...parsed.values});
  const json=JSON.stringify(values);
  await database.prepare(
    "INSERT OR IGNORE INTO breed_notion_controlled_values "+
    "(breed_id,values_json,notion_values_json,revision) VALUES (?,?,?,0)",
  ).bind(link.breed_id,json,json).run();
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
    const page=await notionRequest<NotionPage>(args.bindings,
      "/pages/"+encodeURIComponent(link.work_notion_page_id));
    await verifyPage(page,link,args.bindings);
    row=await seed(args.database,link,page);
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
  const link=await activeLink(args.database,args.breedId);
  await verifyPage(args.page,link,args.bindings);
  const edited=touchedBreedControlledKeys(args.page,args.changedProperties);
  if (!edited.length) return {updated:false,invalidKeys:[]};
  const parsed=readBreedControlledNotionPage(args.page,edited);
  let row=await record(args.database,args.breedId);
  if (!row) {
    await seed(args.database,link,args.page);
    return {updated:true,invalidKeys:parsed.errors.map((e:{key:string})=>e.key)};
  }
  if (!Object.keys(parsed.values).length)
    return {updated:false,invalidKeys:parsed.errors.map((e:{key:string})=>e.key)};
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
    const updated=await args.database.prepare(
      "UPDATE breed_notion_controlled_values SET values_json=?,notion_values_json=?, "+
      "revision=revision+1,updated_at=? WHERE breed_id=? AND revision=?",
    ).bind(JSON.stringify(values),JSON.stringify(notion),new Date().toISOString(),
      link.breed_id,row.revision).run();
    if (updated.meta.changes===1)
      return {updated:true,invalidKeys:parsed.errors.map((e:{key:string})=>e.key)};
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
    const updated=await args.database.prepare(
      "UPDATE breed_notion_controlled_values SET values_json=?,revision=revision+1, "+
      "updated_at=? WHERE breed_id=? AND revision=?",
    ).bind(JSON.stringify(values),new Date().toISOString(),args.breedId,row.revision).run();
    if (updated.meta.changes!==1) throw Error("BREED_CONTROLLED_EDIT_CONFLICT");
  }
  for (const key of [...new Set([...changed,...retry])]) {
    try {
      const page=await notionRequest<NotionPage>(args.bindings,
        "/pages/"+encodeURIComponent(link.work_notion_page_id));
      await verifyPage(page,link,args.bindings);
      const remote=readBreedControlledNotionPage(page,[key]);
      if (remote.errors.length) throw Error("BREED_CONTROLLED_REMOTE_INVALID");
      if (!eq(remote.values[key],notion[key]))
        throw Error("BREED_CONTROLLED_REMOTE_CHANGED");
      if (!eq(remote.values[key],values[key])) {
        // Notion has no field-level CAS. Recheck the page revision and exact
        // target cell immediately before PATCH; unrelated concurrent edits
        // are deferred instead of risking a lost update.
        const preflight=await notionRequest<NotionPage>(args.bindings,
          "/pages/"+encodeURIComponent(link.work_notion_page_id));
        await verifyPage(preflight,link,args.bindings);
        const latestCell=readBreedControlledNotionPage(preflight,[key]);
        if (preflight.last_edited_time!==page.last_edited_time ||
            latestCell.errors.length || !eq(latestCell.values[key],notion[key]))
          throw Error("BREED_CONTROLLED_CONCURRENT_NOTION_EDIT");
        await notionRequest(args.bindings,
          "/pages/"+encodeURIComponent(link.work_notion_page_id),{
            method:"PATCH",body:JSON.stringify({properties:breedControlledNotionPayload(key,values[key])}),
          });
      }
      const confirmed=await notionRequest<NotionPage>(args.bindings,
        "/pages/"+encodeURIComponent(link.work_notion_page_id));
      await verifyPage(confirmed,link,args.bindings);
      const check=readBreedControlledNotionPage(confirmed,[key]);
      if (check.errors.length || !eq(check.values[key],values[key]))
        throw Error("BREED_CONTROLLED_WRITE_NOT_CONFIRMED");
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
