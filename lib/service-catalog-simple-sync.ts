/**
 * Simple, one-way Services V3 catalog sync: Admin/D1 -> Notion.
 *
 * New ACTIVE services work immediately in Admin. Reuse the dedicated Notion
 * catalog; never edit profiles or import a Notion option back into D1.
 * Run small batches on the existing five-minute scheduled trigger.
 *
 * The only non-negotiable checks are stable IDs, exact destination, an
 * idempotent update/readback, and a one-time claim for page creation.
 */
import {normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING} from "./service-catalog-notion-http-port.ts";

const source=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.dataSourceId;
const p=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING.properties;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const optionId=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const sameUuid=(a:string,b:string)=>a.replaceAll("-","").toLowerCase()===b.replaceAll("-","").toLowerCase();
const text=(value:unknown,key:"rich_text"|"title")=>{
  const items=(value as Record<string,unknown>|undefined)?.[key];
  return Array.isArray(items)?items.map(x=>String(x?.plain_text??x?.text?.content??"")).join("").trim():"";
};
type Row={id:string;kind:"service"|"attribute";label:string;group_name:string;
  meaning:string;primary_category:string;categories_json:string;value_kind:"tri_state";
  version:number;status:"ACTIVE"|"DRAFT"|"RETIRED";notion_mirror_status:string};
type Page={id?:string;parent?:{type?:string;data_source_id?:string};
  archived?:boolean;in_trash?:boolean;properties?:Record<string,unknown>};
type Query={results?:Page[];has_more?:boolean;next_cursor?:string|null};
type Env={NOTION_API_TOKEN?:string;SERVICE_CATALOG_NOTION_AUTO_ENABLED?:string};
type DB=Pick<D1Database,"prepare">;
export type SimpleCatalogSyncSummary={state:"DISABLED"|"BLOCKED"|"IDLE"|"SYNCED"|"REVIEW";
  created:number;updated:number;verified:number;conflicts:number;reason?:string};
function properties(row:Row){
  const cats=JSON.parse(row.categories_json) as string[];
  if(!optionId.test(row.id)||!Array.isArray(cats)||!cats.length||
     !cats.includes(row.primary_category)||row.value_kind!=="tri_state")
    throw Error("INVALID_D1_CATALOG_OPTION");
  const rich=(v:string)=>({rich_text:[{text:{content:v}}]});
  const sel=(v:string)=>({select:{name:v}});
  return {
    [p.optionId]:rich(row.id),
    [p.optionVersion]:{number:row.version},
    [p.kind]:sel(row.kind),
    [p.label]:{title:[{text:{content:row.label}}]},
    [p.group]:rich(row.group_name),
    [p.meaning]:rich(row.meaning),
    [p.primaryCategory]:sel(row.primary_category),
    [p.categories]:{multi_select:cats.map(name=>({name}))},
    [p.valueKind]:sel(row.value_kind)
  };
}
function belongs(page:Page):boolean{
  return uuid.test(page.id??"")&&page.parent?.type==="data_source_id"&&
    sameUuid(page.parent?.data_source_id??"",source)&&
    page.archived!==true&&page.in_trash!==true;
}
function matching(page:Page,row:Row):boolean{
  if(!belongs(page))return false;
  const props=page.properties??{};
  const selected=(props[p.categories] as {multi_select?:Array<{name:string}>}|undefined)?.multi_select;
  const cats=JSON.parse(row.categories_json) as string[];
  return text(props[p.optionId],"rich_text")===row.id&&
    (props[p.optionVersion] as {number?:number}|undefined)?.number===row.version&&
    (props[p.kind] as {select?:{name?:string}}|undefined)?.select?.name===row.kind&&
    text(props[p.label],"title")===row.label&&
    text(props[p.group],"rich_text")===row.group_name&&
    text(props[p.meaning],"rich_text")===row.meaning&&
    (props[p.primaryCategory] as {select?:{name?:string}}|undefined)?.select?.name===row.primary_category&&
    (props[p.valueKind] as {select?:{name?:string}}|undefined)?.select?.name===row.value_kind&&
    Array.isArray(selected)&&selected.length===cats.length&&
    selected.map(x=>x.name).sort().join("|")===cats.slice().sort().join("|");
}
export async function runSimpleServiceCatalogSync(input:{
  db:DB;env:Env;fetcher?:typeof fetch;maxWrites?:number;now?:Date
}):Promise<SimpleCatalogSyncSummary>{
  const result:SimpleCatalogSyncSummary={state:"IDLE",created:0,updated:0,verified:0,conflicts:0};
  const {db,env}=input;
  if(env?.SERVICE_CATALOG_NOTION_AUTO_ENABLED!=="true")return {...result,state:"DISABLED"};
  if(!db?.prepare||!env.NOTION_API_TOKEN?.trim())return {...result,state:"BLOCKED",reason:"MISSING_DB_OR_NOTION_TOKEN"};
  const client=input.fetcher??fetch;
  const headers={"Authorization":"Bearer "+env.NOTION_API_TOKEN.trim(),
    "Notion-Version":"2025-09-03","Content-Type":"application/json"};
  async function request(path:string,method:"GET"|"POST"|"PATCH",body?:unknown):Promise<any>{
    const response=await client("https://api.notion.com/v1/"+path,{
      method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})
    });
    if(!response.ok)throw Error("NOTION_HTTP_"+response.status);
    return response.json();
  }
  // Always list before creation: a timed-out POST may already have succeeded.
  const pages:Page[]=[];
  let cursor:string|undefined;
  try{
    for(let n=0;n<25;n++){
      const data=await request("data_sources/"+source+"/query","POST",
        cursor?{page_size:100,start_cursor:cursor}:{page_size:100}) as Query;
      if(!Array.isArray(data.results)||typeof data.has_more!=="boolean"||
        (data.has_more&&!data.next_cursor))throw Error("INCOMPLETE_NOTION_CATALOG");
      for(const page of data.results){
        if(!belongs(page))throw Error("WRONG_NOTION_CATALOG_PAGE");
        pages.push(page);
      }
      if(!data.has_more){cursor=undefined;break;}
      if(cursor===data.next_cursor)throw Error("REPEATED_NOTION_CURSOR");
      cursor=data.next_cursor??undefined;
    }
    if(cursor)throw Error("NOTION_CATALOG_PAGINATION_LIMIT");
  }catch(e){return {...result,state:"BLOCKED",reason:e instanceof Error?e.message:"NOTION_READ_FAILED"};}
  const byId=new Map<string,Page>();
  for(const page of pages){
    const id=text(page.properties?.[p.optionId],"rich_text");
    if(!id)continue;
    if(byId.has(id))return {...result,state:"BLOCKED",reason:"DUPLICATE_NOTION_OPTION_ID"};
    byId.set(id,page);
  }
  let rows:Row[];
  try{
    rows=(await db.prepare(
      "SELECT id,kind,label,group_name,meaning,primary_category,categories_json,value_kind,version,status,notion_mirror_status "+
      "FROM service_catalog_admin_options WHERE status='ACTIVE' ORDER BY created_at,id"
    ).all<Row>()).results;
    if(!Array.isArray(rows))throw Error("D1_CATALOG_UNAVAILABLE");
  }catch(e){return {...result,state:"BLOCKED",reason:e instanceof Error?e.message:"D1_READ_FAILED"};}
  const max=Math.max(1,Math.min(12,input.maxWrites??8));
  let writes=0;
  async function markSynced(row:Row){
    const saved=await db.prepare(
      "UPDATE service_catalog_admin_options SET notion_mirror_status='SYNCED' "+
      "WHERE id=?1 AND version=?2 AND status='ACTIVE' AND notion_mirror_status<>'SYNCED' RETURNING id"
    ).bind(row.id,row.version).first<{id:string}>();
    if(saved)result.verified++;
  }
  for(const row of rows){
    if(writes>=max)break;
    try{
      const expected=properties(row);
      const found=byId.get(row.id);
      if(found){
        if(matching(found,row)){await markSynced(row);continue;}
        // PATCH on a known page is safe to retry; do not maintain a separate
        // permanent journal/approval workflow for routine updates.
        const ack=await request("pages/"+encodeURIComponent(found.id!),"PATCH",{properties:expected}) as Page;
        if(!uuid.test(ack.id??"")||!sameUuid(ack.id!,found.id!))throw Error("NOTION_PATCH_UNCONFIRMED");
        const saved=await request("pages/"+encodeURIComponent(found.id!),"GET") as Page;
        if(!matching(saved,row))throw Error("NOTION_PATCH_READBACK_MISMATCH");
        await markSynced(row);
        result.updated++;writes++;
        continue;
      }
      // Do not create a duplicate if a Notion page already has the same label
      // but has not yet been assigned its canonical ID.
      if(pages.some(x=>normalizeCatalogLabel(text(x.properties?.[p.label],"title"))===normalizeCatalogLabel(row.label)))
        throw Error("NOTION_NAME_ALREADY_EXISTS");
      const prior=await db.prepare(
        "SELECT outcome FROM service_catalog_notion_auto_attempts "+
        "WHERE option_id=?1 AND action='PROVISION_ONE' LIMIT 1"
      ).bind(row.id).first<{outcome:string}>();
      if(prior)throw Error("NOTION_CREATE_NEEDS_REVIEW");
      const at=(input.now??new Date()).toISOString();
      const claim=await db.prepare(
        "INSERT INTO service_catalog_notion_auto_attempts(option_id,option_version,action,claimed_at) "+
        "SELECT ?1,?2,'PROVISION_ONE',?3 WHERE EXISTS "+
        "(SELECT 1 FROM service_catalog_admin_options WHERE id=?1 AND version=?2 AND status='ACTIVE') "+
        "ON CONFLICT(option_id,option_version,action) DO NOTHING RETURNING option_id"
      ).bind(row.id,row.version,at).first<{option_id:string}>();
      if(!claim)continue; // another worker or newer D1 version
      const created=await request("pages","POST",{
        parent:{type:"data_source_id",data_source_id:source},properties:expected
      }) as Page;
      if(!belongs(created))throw Error("NOTION_CREATE_UNCONFIRMED");
      const readback=await request("pages/"+encodeURIComponent(created.id!),"GET") as Page;
      if(!matching(readback,row))throw Error("NOTION_CREATE_READBACK_MISMATCH");
      await db.prepare(
        "UPDATE service_catalog_notion_auto_attempts SET outcome='CREATED_NEEDS_MIRROR',finished_at=?1 "+
        "WHERE option_id=?2 AND option_version=?3 AND action='PROVISION_ONE' AND outcome='CLAIMED'"
      ).bind(new Date().toISOString(),row.id,row.version).run();
      await markSynced(row);
      pages.push(readback);byId.set(row.id,readback);
      result.created++;writes++;
    }catch(e){
      result.conflicts++;
      // If Notion accepted a create but the response was lost, the next run
      // will discover it by ID rather than creating another page.
      result.reason=e instanceof Error?e.message:"CATALOG_SYNC_FAILED";
      if(result.reason.startsWith("NOTION_HTTP_429"))break;
    }
  }
  return {...result,state:result.conflicts?"REVIEW":
    result.created||result.updated||result.verified?"SYNCED":"IDLE"};
}
