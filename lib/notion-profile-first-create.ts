import { acquireUnifiedManualFence, releaseUnifiedManualFence } from "./notion-unified-manual-fence.ts";
import { notionRequest, notionRichTextProperty, type NotionSyncBindings, type NotionPage as BasePage } from "./notion-sync-shared.ts";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership.ts";
import { sameNotionProperty } from "./notion-selective-property-patch.ts";

type Page=BasePage&{archived?:boolean;in_trash?:boolean;parent?:{type?:string;data_source_id?:string;database_id?:string}};
const spec={
  directory:{table:"directory_profiles",kind:"directory",mapping:"directory_notion_sync",key:"directory_profile_id"},
  events:{table:"managed_events",kind:"events",mapping:"event_notion_sync",key:"event_id"},
  organizations:{table:"help_organizations",kind:"organizations",mapping:"notion_agenda_sync",key:"entity_id"},
  adoptions:{table:"adoption_dogs",kind:"adoptions",mapping:"notion_agenda_sync",key:"entity_id"},
  "lost-found":{table:"lost_found_dog_reports",kind:"lost-found",mapping:"notion_agenda_sync",key:"entity_id"},
  "help-cases":{table:"help_cases",kind:"help",mapping:"notion_agenda_sync",key:"entity_id"},
  eshops:{table:"managed_eshops",kind:"eshops",mapping:"eshop_notion_sync",key:"eshop_id"},
} as const;
type Agenda=keyof typeof spec;
type Snapshot={revision:string;hash:string;properties:Record<string,unknown>;reviewed:boolean};

/** Create a first remote copy only; never patch an already existing page.
 * The fence persists on ambiguous POST/mapping outcome. Recovery must verify
 * the exact remote identity; do not automatically send a second POST. */
export async function ensureFirstProfileNotionCopy(input:{
  database:D1Database;bindings:NotionSyncBindings;agenda:Agenda;id:number;sourceId:string;
  snapshot:()=>Promise<Snapshot>;
}):Promise<{pageId:string;created:boolean}>{
  const {database:db,bindings,agenda,id,sourceId}=input;
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text"||!Number.isSafeInteger(id)||id<1||!sourceId)
    throw Error("PROFILE_FIRST_CREATE_SCOPE");
  const s=spec[agenda],shared=s.mapping==="notion_agenda_sync";
  const mappingScope=shared?" AND agenda=?":"";
  const scopeArgs=shared?[agenda]:[];
  const mapping=()=>db.prepare("SELECT notion_page_id FROM "+s.mapping+" WHERE "+s.key+"=?"+mappingScope)
    .bind(id,...scopeArgs).first<{notion_page_id:string}>();
  const eligible=()=>db.prepare("SELECT updated_at FROM "+s.table+" p WHERE id=? AND lower(status)<>'archived'"+
    " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones t WHERE t.kind=? AND t.record_id=p.id)")
    .bind(id,s.kind).first<{updated_at:string}>();
  const read=async(pageId:string)=>{
    const page=await notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId));
    if(page.id!==pageId||page.archived||page.in_trash||!notionPageBelongsToDataSource(page,sourceId)||
      notionRichTextProperty(page,"Psipedia ID")!==String(id))throw Error("PROFILE_FIRST_CREATE_REMOTE_IDENTITY");
    return page;
  };
  const existing=await mapping();
  if(existing){await read(existing.notion_page_id);return {pageId:existing.notion_page_id,created:false};}
  const source=await notionRequest<{properties?:Record<string,{type?:string}>}>(bindings,"/data_sources/"+encodeURIComponent(sourceId));
  async function snapshot(){
    const row=await eligible();
    if(!row)throw Error("PROFILE_FIRST_CREATE_CANONICAL_MISSING");
    const snap=await input.snapshot();
    const properties={...snap.properties,"Odkontrolované":{checkbox:snap.reviewed}};
    if(snap.revision!==row.updated_at||(await eligible())?.updated_at!==row.updated_at)
      throw Error("PROFILE_FIRST_CREATE_REVISION_CHANGED");
    if(!Object.hasOwn(properties,"Psipedia ID")||source.properties?.["Odkontrolované"]?.type!=="checkbox")
      throw Error("PROFILE_FIRST_CREATE_SCHEMA_MISSING");
    for(const [name,payload] of Object.entries(properties)){
      if(!payload||typeof payload!=="object"||Array.isArray(payload)||!source.properties?.[name]||
        source.properties[name].type!==Object.keys(payload)[0])throw Error("PROFILE_FIRST_CREATE_SCHEMA_MISMATCH: "+name);
    }
    return {...snap,properties};
  }
  await snapshot(); // no durable fence for a known preflight failure
  const fence=await acquireUnifiedManualFence(db,{scope:agenda,profile_id:id});
  const currentMapping=await mapping();
  if(currentMapping){
    await read(currentMapping.notion_page_id);
    await releaseUnifiedManualFence(db,fence);
    return {pageId:currentMapping.notion_page_id,created:false};
  }
  const expected=await snapshot();
  const result=await notionRequest<{results?:Page[];has_more?:boolean}>(bindings,"/data_sources/"+encodeURIComponent(sourceId)+"/query",{
    method:"POST",body:JSON.stringify({filter:{property:"Psipedia ID",rich_text:{equals:String(id)}},page_size:3})
  });
  if(!Array.isArray(result.results)||result.has_more||result.results.length>1)throw Error("PROFILE_FIRST_CREATE_AMBIGUOUS");
  if(JSON.stringify(await snapshot())!==JSON.stringify(expected)||await mapping())throw Error("PROFILE_FIRST_CREATE_REVISION_CHANGED");
  const created=result.results.length===0;
  const page=created?await notionRequest<Page>(bindings,"/pages",{method:"POST",body:JSON.stringify({
    parent:{type:"data_source_id",data_source_id:sourceId},properties:expected.properties
  })},{retryTransient:false}):result.results[0];
  if(!page?.id)throw Error("PROFILE_FIRST_CREATE_UNKNOWN_RESULT");
  const verified=await read(page.id);
  for(const [name,payload] of Object.entries(expected.properties)){
    const raw=verified.properties?.[name] as Record<string,unknown>|undefined;
    const type=Object.keys(payload as Record<string,unknown>)[0];
    if(!raw||raw.type!==type||!Object.hasOwn(raw,type)||raw.has_more===true||
      (Array.isArray(raw[type])&&(raw[type] as unknown[]).length>=25)||!sameNotionProperty(raw,payload))
      throw Error("PROFILE_FIRST_CREATE_UNVERIFIED: "+name);
  }
  if(JSON.stringify(await snapshot())!==JSON.stringify(expected))throw Error("PROFILE_FIRST_CREATE_REVISION_CHANGED");
  const now=new Date().toISOString();
  const insert=await db.prepare("INSERT INTO "+s.mapping+" ("+(shared?"agenda,":"")+
    "notion_page_id,"+s.key+",content_hash,notion_last_edited_time,psipedia_updated_at,last_synced_at,created_at,updated_at) "+
    "SELECT "+(shared?"?,":"")+"?,?,?,?,?,?,?,? WHERE "+
    "EXISTS(SELECT 1 FROM "+s.table+" p WHERE id=? AND updated_at=? AND lower(status)<>'archived')"+
    " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=?)"+
    " AND EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda=? AND entity_id=? AND owner_token=?)"+
    " AND NOT EXISTS(SELECT 1 FROM "+s.mapping+" WHERE "+s.key+"=?"+mappingScope+")"+
    " ON CONFLICT DO NOTHING")
    .bind(...scopeArgs,verified.id,id,expected.hash,verified.last_edited_time??now,expected.revision,now,now,now,
      id,expected.revision,s.kind,id,agenda,String(id),fence.token,id,...scopeArgs).run();
  if(!insert.success||insert.meta.changes!==1||(await mapping())?.notion_page_id!==verified.id)
    throw Error("PROFILE_FIRST_CREATE_MAPPING_CONFLICT");
  await releaseUnifiedManualFence(db,fence);
  return {pageId:verified.id,created};
}
