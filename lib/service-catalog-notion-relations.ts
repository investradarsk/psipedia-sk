/**
 * Notion "Služby z katalógu" ↔ canonical Psipedia service selections.
 *
 * One-way data-source ownership: the Notion relation can select *existing*
 * canonical service IDs, but never create new D1 catalog identities.
 * An acknowledged relation baseline makes "deselect all" unambiguous.
 * Independent changes to different service IDs are merged against the last
 * acknowledged baseline; unverified initial deletions are never guessed.
 * The old Notion "Služby" rich-text property is preserved for historical data.
 */
import {notionRequest,type NotionSyncBindings} from "./notion-sync-shared";
import {planCatalogRelationSync,planSignedCatalogRelationSync} from "./service-catalog-notion-relation-plan";
import {loadResolvedServiceDefinitions} from "./service-catalog-resolved";
import {importNotionServiceIds} from "./service-profile-notion-bridge";
import {PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING} from "./service-catalog-notion-http-port";
import {notionPageBelongsToDataSource} from "./notion-sync-page-ownership";

const SOURCE=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
const PROPERTY="Služby z katalógu";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID=/^svc\.(?:admin\.[a-f0-9]{32}|[a-z0-9._-]+)$/;
/** Stable, verified mapping of canonical Service V3 IDs to Notion catalog pages. */
export type CatalogRelationLookup={
  serviceToPage:Map<string,string>;
  pageToService:Map<string,string>;
};
type Item={id:string;label:string;categories:readonly string[]};
type Page={id:string;parent?:{type?:string;data_source_id?:string};
  properties?:Record<string,unknown>;archived?:boolean;in_trash?:boolean};
type Query={results?:Page[];has_more?:boolean;next_cursor?:string|null};
type D1Row={option_id:string;choice:string;version:number};
type Baseline={notion_page_id:string;confirmed_ids_json:string};
function relationIds(page:Page):string[]|null{
  const p=page.properties?.[PROPERTY];
  if(p===undefined)return null; // Old Notion integration/schema: do nothing.
  if(!p||typeof p!=="object"||(p as {type?:string}).type!=="relation")throw Error("SERVICES_RELATION_SCHEMA_INVALID");
  const relation=(p as {relation?:Array<{id?:string}>;has_more?:boolean}).relation;
  if(!Array.isArray(relation)||(p as {has_more?:boolean}).has_more===true||
    !relation.every(x=>typeof x?.id==="string"&&UUID.test(x.id)))
    throw Error("SERVICES_RELATION_INCOMPLETE");
  const ids=relation.map(x=>x.id!.toLowerCase());
  if(new Set(ids).size!==ids.length)throw Error("SERVICES_RELATION_DUPLICATES");
  return ids;
}
function text(p:unknown,field:"rich_text"|"title"){
  const parts=(p as Record<string,unknown>|undefined)?.[field];
  return Array.isArray(parts)?parts.map(x=>String(x?.plain_text??x?.text?.content??"")).join("").trim():"";
}
function normal(id:string){return id.toLowerCase().replaceAll("-","");}
/** Query the complete dedicated catalog, never the Directory source. */
export async function loadNotionCatalogRelationLookup(bindings:NotionSyncBindings):Promise<CatalogRelationLookup>{
  const serviceToPage=new Map<string,string>(),pageToService=new Map<string,string>();
  let cursor:string|undefined;
  const seen=new Set<string>();
  for(let n=0;n<20;n++){
    const data=await notionRequest<Query>(bindings,"/data_sources/"+SOURCE+"/query",{
      method:"POST",body:JSON.stringify(cursor?{page_size:100,start_cursor:cursor}:{page_size:100})
    });
    if(!Array.isArray(data.results)||typeof data.has_more!=="boolean"||
      data.results.length>100||(data.has_more&&!data.next_cursor))throw Error("SERVICES_CATALOG_NOTION_QUERY_INCOMPLETE");
    for(const page of data.results){
      if(!UUID.test(page.id)||page.archived||page.in_trash||
        normal(page.parent?.data_source_id??"")!==normal(SOURCE))
        throw Error("SERVICES_CATALOG_REMOTE_OWNER_MISMATCH");
      const props=page.properties??{};
      const optionId=text(props["Option ID"],"rich_text");
      const kind=String((props["Typ"] as {select?:{name?:string}}|undefined)?.select?.name??"");
      if(!optionId){continue;} // Draft Notion catalog option has no D1 identity yet.
      if(kind!=="service")continue; // attributes are not profile services
      if(!ID.test(optionId))throw Error("SERVICES_CATALOG_REMOTE_ID_INVALID");
      const remotePage=page.id.toLowerCase();
      if(serviceToPage.has(optionId)||pageToService.has(remotePage))
        throw Error("SERVICES_CATALOG_REMOTE_DUPLICATE");
      serviceToPage.set(optionId,remotePage);pageToService.set(remotePage,optionId);
    }
    if(!data.has_more)return {serviceToPage,pageToService};
    if(!data.next_cursor||seen.has(data.next_cursor))throw Error("SERVICES_CATALOG_CURSOR_LOOP");
    cursor=data.next_cursor;seen.add(cursor);
  }
  throw Error("SERVICES_CATALOG_MAX_PAGES");
}
async function canonicalItems(db:D1Database,category:string):Promise<Map<string,Item>>{
  // Use the same effective names/categories as Admin and the Notion text
  // bridge: built-in D1 overrides must affect relation eligibility too.
  const resolved=await loadResolvedServiceDefinitions(db,category);
  return new Map<string,Item>(resolved.map(x=>[x.id,{id:x.id,label:x.label,categories:x.categories}] as const));
}
async function canonicalYes(db:D1Database,profileId:number,known:Map<string,Item>){
  const result=await db.prepare(
    "SELECT option_id,choice,version FROM service_profile_option_choices WHERE profile_id=?1 AND choice='yes'"
  ).bind(profileId).all<D1Row>();
  return (result.results??[]).map(x=>x.option_id).filter(id=>known.has(id)).sort();
}
async function schemaExists(db:D1Database){
  return !!await db.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name='directory_service_notion_relation_sync'").first();
}
async function readRemote(bindings:NotionSyncBindings,pageId:string,expectedDirectorySourceId:string){
  const p=await notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId),{method:"GET"});
  if(normal(p.id??"")!==normal(pageId))throw Error("SERVICES_PROFILE_NOTION_PAGE_ID_CHANGED");
  // Revalidate ownership on every read, including pre-PATCH and post-PATCH.
  // A moved/archived/trashed page must never receive the Services V3 relation.
  if(!notionPageBelongsToDataSource(p,expectedDirectorySourceId))
    throw Error("SERVICES_PROFILE_NOTION_SOURCE_CHANGED");
  return p;
}
/** Canonical relations never write the legacy "Služby" text. */
export async function syncProfileCatalogRelation(input:{
 db:D1Database;bindings:NotionSyncBindings;pageId:string;profileId:number;category:string;
 directoryDataSourceId:string;lookup:CatalogRelationLookup;
 /** Signed relation event; absent services can only be deleted with confirmed baseline. */
 notionExplicitEdit?:boolean;
 /** Only a fresh explicit Admin checkbox save may establish an initial D1→Notion baseline. */
 adminChoiceSave?:boolean;
}):Promise<"skipped"|"unchanged"|"pushed"|"pulled"|"merged">{
 const {db,bindings,pageId,profileId,category,lookup,directoryDataSourceId}=input;
 if(!await schemaExists(db))return "skipped"; // Migration not yet applied: do not break existing sync.
 const page=await readRemote(bindings,pageId,directoryDataSourceId);
 const raw=relationIds(page);
 if(raw===null)return "skipped";
 const available=await canonicalItems(db,category);
 const remote:string[]=[];
 for(const pageId of raw){
   const id=lookup.pageToService.get(pageId);
   if(!id||!available.has(id))throw Error("SERVICES_RELATION_UNKNOWN_OR_WRONG_CATEGORY");
   remote.push(id);
 }
 const local=await canonicalYes(db,profileId,available);
 for(const id of local)if(!lookup.serviceToPage.has(id))
   throw Error("SERVICES_RELATION_CATALOG_NOT_YET_MIRRORED");
 const baseline=await db.prepare(
   "SELECT notion_page_id,confirmed_ids_json FROM directory_service_notion_relation_sync WHERE directory_profile_id=?1"
 ).bind(profileId).first<Baseline>();
 if(baseline&&normal(baseline.notion_page_id)!==normal(pageId))
   throw Error("SERVICES_RELATION_PROFILE_MAPPING_CONFLICT");
 let previous:string[]|null=null;
 if(baseline){
   const decoded=JSON.parse(baseline.confirmed_ids_json);
   if(!Array.isArray(decoded)||!decoded.every(x=>typeof x==="string"))
     throw Error("SERVICES_RELATION_BAD_BASELINE");
   previous=decoded;
 }
 // A signed relation event cannot authorize deletion without a prior
 // confirmed common state. After that, every service is reconciled by ID.
 if(previous===null&&local.some(id=>!remote.includes(id))){
   if(input.notionExplicitEdit)throw Error("SERVICES_RELATION_UNVERIFIED_DELETE");
   if(!input.adminChoiceSave)throw Error("SERVICES_RELATION_UNVERIFIED_INITIAL_PUSH");
 }
 const plan=input.notionExplicitEdit
   ?planSignedCatalogRelationSync(local,remote,previous)
   :planCatalogRelationSync(local,remote,previous);
 if(plan.action==="conflict")throw Error("SERVICES_RELATION_BOTH_SIDES_CHANGED_REVIEW");
 if(plan.action==="pull"||plan.action==="merge"){
   // Recheck the relation before touching D1; never import a truncated/superseded page.
   const latest=relationIds(await readRemote(bindings,pageId,directoryDataSourceId));
   if(JSON.stringify(latest?.sort())!==JSON.stringify([...raw].sort()))
     throw Error("SERVICES_RELATION_CHANGED_BEFORE_IMPORT");
   const currentLocal=await canonicalYes(db,profileId,available);
   if(JSON.stringify(currentLocal)!==JSON.stringify(local))
     throw Error("SERVICES_RELATION_LOCAL_CHANGED_BEFORE_IMPORT");
   await importNotionServiceIds(db,profileId,category,plan.target);
   const confirmed=await canonicalYes(db,profileId,available);
   if(JSON.stringify(confirmed)!==JSON.stringify([...plan.target].sort()))
     throw Error("SERVICES_RELATION_IMPORT_INCOMPLETE");
 }
 if(plan.action==="push"||plan.action==="merge"){
   // Recheck before PATCH. PATCH touches only our relation, no editorial/identity fields.
   const currentLocal=await canonicalYes(db,profileId,available);
   if(JSON.stringify(currentLocal)!==JSON.stringify([...plan.target].sort()))
     throw Error("SERVICES_RELATION_LOCAL_CHANGED_BEFORE_EXPORT");
   const latest=relationIds(await readRemote(bindings,pageId,directoryDataSourceId));
   if(JSON.stringify(latest?.sort())!==JSON.stringify([...raw].sort()))
     throw Error("SERVICES_RELATION_CHANGED_BEFORE_EXPORT");
   const pages=plan.target.map(id=>({id:lookup.serviceToPage.get(id)!}));
   const ack=await notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId),{
     method:"PATCH",body:JSON.stringify({properties:{[PROPERTY]:{relation:pages}}})
   },{retryTransient:false}); // Unknown outcome must be read back, not blindly retried.
   if(normal(ack.id??"")!==normal(pageId))throw Error("SERVICES_RELATION_WRITE_UNCERTAIN");
   const observed=relationIds(await readRemote(bindings,pageId,directoryDataSourceId));
   if(JSON.stringify(observed?.sort())!==JSON.stringify(pages.map(x=>x.id).sort()))
     throw Error("SERVICES_RELATION_WRITE_NOT_VERIFIED");
 }
 // Legacy editorial services are separate; relation reconciliation does not edit them.
 // Do not commit a baseline if the remote relation changed while reconciling.
 const finalRelation=relationIds(await readRemote(bindings,pageId,directoryDataSourceId));
 const targetPages=plan.target.map(id=>lookup.serviceToPage.get(id)!);
 if(!finalRelation||JSON.stringify([...finalRelation].sort())!==JSON.stringify([...targetPages].sort()))
   throw Error("SERVICES_RELATION_CHANGED_BEFORE_BASELINE");
 const now=new Date().toISOString();
 await db.prepare(
   "INSERT INTO directory_service_notion_relation_sync (directory_profile_id,notion_page_id,confirmed_ids_json,synced_at) "+
   "VALUES (?1,?2,?3,?4) ON CONFLICT(directory_profile_id) DO UPDATE SET "+
   "confirmed_ids_json=excluded.confirmed_ids_json,synced_at=excluded.synced_at "+
   "WHERE notion_page_id=excluded.notion_page_id"
 ).bind(profileId,pageId,JSON.stringify([...plan.target].sort()),now).run();
 return plan.action==="pull"?"pulled":plan.action==="push"?"pushed":plan.action==="merge"?"merged":"unchanged";
}
