/**
 * Notion "Služby z katalógu" ↔ canonical Psipedia service selections.
 *
 * One-way data-source ownership: the Notion relation can select *existing*
 * canonical service IDs, but never create new D1 catalog identities.
 * An acknowledged relation baseline makes "deselect all" unambiguous.
 * Divergent changes on both sides are never silently merged or overwritten.
 * The old Notion "Služby" rich-text property is preserved for historical data.
 */
import {notionRequest,type NotionSyncBindings} from "./notion-sync-shared";
import {planCatalogRelationSync} from "./service-catalog-notion-relation-plan";
import {serviceCatalog} from "./service-catalog-contract";
import {importNotionServiceChoices,projectServiceChoiceToDirectoryNotion} from "./service-profile-notion-bridge";
import {PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING} from "./service-catalog-notion-http-port";

const SOURCE=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
const PROPERTY="Služby z katalógu";
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const ID=/^svc\.(?:admin\.[a-f0-9]{32}|[a-z0-9._-]+)$/;
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
  const items=new Map<string,Item>();
  for(const s of serviceCatalog)if(s.categories.some(x=>x===category))
    items.set(s.id,{id:s.id,label:s.label,categories:s.categories});
  const data=await db.prepare(
    "SELECT id,label,categories_json FROM service_catalog_admin_options WHERE kind='service' AND status='ACTIVE'"
  ).all<{id:string;label:string;categories_json:string}>();
  for(const x of data.results??[]){
    const cats=JSON.parse(x.categories_json) as string[];
    if(Array.isArray(cats)&&cats.includes(category))items.set(x.id,{id:x.id,label:x.label,categories:cats});
  }
  return items;
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
async function readRemote(bindings:NotionSyncBindings,pageId:string){
  const p=await notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId),{method:"GET"});
  if(normal(p.id??"")!==normal(pageId))throw Error("SERVICES_PROFILE_NOTION_PAGE_ID_CHANGED");
  return p;
}
export async function syncProfileCatalogRelation(input:{
 db:D1Database;bindings:NotionSyncBindings;pageId:string;profileId:number;category:string;
 lookup:CatalogRelationLookup;
}):Promise<"skipped"|"unchanged"|"pushed"|"pulled">{
 const {db,bindings,pageId,profileId,category,lookup}=input;
 if(!await schemaExists(db))return "skipped"; // Migration not yet applied: do not break existing sync.
 const page=await readRemote(bindings,pageId);
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
 const plan=planCatalogRelationSync(local,remote,previous);
 if(plan.action==="conflict")throw Error("SERVICES_RELATION_BOTH_SIDES_CHANGED_REVIEW");
 if(plan.action==="pull"){
   // Recheck the relation before touching D1; never import a truncated/superseded page.
   const latest=relationIds(await readRemote(bindings,pageId));
   if(JSON.stringify(latest?.sort())!==JSON.stringify([...raw].sort()))
     throw Error("SERVICES_RELATION_CHANGED_BEFORE_IMPORT");
   const before=new Set(local);
   await importNotionServiceChoices(db,profileId,category,plan.target.map(id=>available.get(id)!.label));
   const after=new Set(await canonicalYes(db,profileId,available));
   for(const id of new Set([...before,...after])){
     if(before.has(id)===after.has(id))continue;
     await projectServiceChoiceToDirectoryNotion(db,profileId,id,after.has(id)?"yes":"unknown");
   }
   const confirmed=await canonicalYes(db,profileId,available);
   if(JSON.stringify(confirmed)!==JSON.stringify([...plan.target].sort()))
     throw Error("SERVICES_RELATION_IMPORT_INCOMPLETE");
 }
 if(plan.action==="push"){
   // Recheck before PATCH. PATCH touches only our relation, no editorial/identity fields.
   const latest=relationIds(await readRemote(bindings,pageId));
   if(JSON.stringify(latest?.sort())!==JSON.stringify([...raw].sort()))
     throw Error("SERVICES_RELATION_CHANGED_BEFORE_EXPORT");
   const pages=plan.target.map(id=>({id:lookup.serviceToPage.get(id)!}));
   const ack=await notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId),{
     method:"PATCH",body:JSON.stringify({properties:{[PROPERTY]:{relation:pages}}})
   },{retryTransient:false}); // Unknown outcome must be read back, not blindly retried.
   if(normal(ack.id??"")!==normal(pageId))throw Error("SERVICES_RELATION_WRITE_UNCERTAIN");
   const observed=relationIds(await readRemote(bindings,pageId));
   if(JSON.stringify(observed?.sort())!==JSON.stringify(pages.map(x=>x.id).sort()))
     throw Error("SERVICES_RELATION_WRITE_NOT_VERIFIED");
 }
 const now=new Date().toISOString();
 await db.prepare(
   "INSERT INTO directory_service_notion_relation_sync (directory_profile_id,notion_page_id,confirmed_ids_json,synced_at) "+
   "VALUES (?1,?2,?3,?4) ON CONFLICT(directory_profile_id) DO UPDATE SET "+
   "confirmed_ids_json=excluded.confirmed_ids_json,synced_at=excluded.synced_at "+
   "WHERE notion_page_id=excluded.notion_page_id"
 ).bind(profileId,pageId,JSON.stringify([...plan.target].sort()),now).run();
 return plan.action==="pull"?"pulled":plan.action==="push"?"pushed":"unchanged";
}
