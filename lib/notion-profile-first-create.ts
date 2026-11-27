import { acquireUnifiedManualFence, releaseUnifiedManualFence } from "./notion-unified-manual-fence.ts";
import { notionRequest, notionRichTextProperty, type NotionSyncBindings, type NotionPage as BasePage } from "./notion-sync-shared.ts";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership.ts";
import { sameNotionProperty } from "./notion-selective-property-patch.ts";

type Page=BasePage&{archived?:boolean;in_trash?:boolean;parent?:{type?:string;data_source_id?:string;database_id?:string}};
const spec={
  breeds:{table:"managed_breeds",kind:"breeds",mapping:"breed_notion_workcopy_links",key:"breed_id"},
  directory:{table:"directory_profiles",kind:"directory",mapping:"directory_notion_sync",key:"directory_profile_id"},
  events:{table:"managed_events",kind:"events",mapping:"event_notion_sync",key:"event_id"},
  organizations:{table:"help_organizations",kind:"organizations",mapping:"notion_agenda_sync",key:"entity_id"},
  adoptions:{table:"adoption_dogs",kind:"adoptions",mapping:"notion_agenda_sync",key:"entity_id"},
  "lost-found":{table:"lost_found_dog_reports",kind:"lost-found",mapping:"notion_agenda_sync",key:"entity_id"},
  "help-cases":{table:"help_cases",kind:"help",mapping:"notion_agenda_sync",key:"entity_id"},
  eshops:{table:"managed_eshops",kind:"eshops",mapping:"eshop_notion_sync",key:"eshop_id"},
} as const;
type Agenda=keyof typeof spec;
type Snapshot={revision:string;hash:string;properties:Record<string,unknown>;reviewed:boolean;breedControlledValues?:Record<string,unknown>};

/** Create a first remote copy only; never patch an already existing page.
 * The fence persists on ambiguous POST/mapping outcome. Recovery must verify
 * the exact remote identity; do not automatically send a second POST. */
export async function ensureFirstProfileNotionCopy(input:{
  database:D1Database;bindings:NotionSyncBindings;agenda:Agenda;id:number;sourceId:string;
  snapshot:(schema:Record<string,{type?:string}>)=>Promise<Snapshot>;
  allowCreate?:boolean;
}):Promise<{pageId:string;created:boolean}>{
  const {database:db,bindings,agenda,id,sourceId}=input;
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text"||!Number.isSafeInteger(id)||id<1||!sourceId)
    throw Error("PROFILE_FIRST_CREATE_SCOPE");
  const s=spec[agenda],shared=s.mapping==="notion_agenda_sync";
  const mappingScope=shared?" AND agenda=?":"";
  const scopeArgs=shared?[agenda]:[];
  const breed=agenda==="breeds";
  if(breed){
    const columns=await db.prepare("PRAGMA table_info(breed_notion_workcopy_links)").all<{name:string;notnull:number}>();
    if(!["original_notion_page_id","original_data_source_id","original_sync_receipt","fci_number"].every(name=>columns.results?.some(column=>column.name===name&&column.notnull===0)))throw Error("BREED_WORKONLY_SCHEMA_REQUIRED");
    const legacy=await db.prepare("SELECT 1 AS linked FROM breed_notion_sync WHERE breed_id=?").bind(id).first<{linked:number}>();
    if(legacy)throw Error("BREED_LEGACY_LINK_REQUIRES_REVIEW");
  }
  const mapping=()=>db.prepare("SELECT "+(breed?"work_notion_page_id AS notion_page_id":"notion_page_id")+" FROM "+s.mapping+" WHERE "+s.key+"=?"+mappingScope)
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
    const snap=await input.snapshot(source.properties??{});
    if(breed&&!snap.breedControlledValues)throw Error("BREED_CONTROLLED_PROJECTION_REQUIRED");
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
  if(created&&input.allowCreate===false){await releaseUnifiedManualFence(db,fence);throw Error("PROFILE_FIRST_CREATE_REMOTE_UNCERTAIN");}
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
  let insert:D1Result;
  if(breed){
    const controlledJson=JSON.stringify(expected.breedControlledValues);
    const guard="EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda='breeds' AND entity_id=? AND owner_token=?)";
    const batch=await db.batch([
      db.prepare("INSERT INTO breed_notion_workcopy_links(breed_id,work_notion_page_id,work_data_source_id,canonical_slug,fci_number,work_sync_receipt,work_last_synced_at,work_notion_last_edited_time,status,verified_at,activated_at,created_at,updated_at) "+
        "SELECT p.id,?,?,p.slug,p.fci_number,?,?,?,'ACTIVE',?,?,?,? FROM managed_breeds p WHERE p.id=? AND p.updated_at=? AND lower(p.status)<>'archived' "+
        "AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind='breeds' AND record_id=p.id) "+
        "AND NOT EXISTS(SELECT 1 FROM breed_notion_sync WHERE breed_id=p.id) "+
        "AND EXISTS(SELECT 1 FROM admin_entity_reviews WHERE entity_type=\'BREED\' AND entity_id=p.id)=? AND "+guard+
        " AND NOT EXISTS(SELECT 1 FROM breed_notion_workcopy_links WHERE breed_id=p.id) ON CONFLICT DO NOTHING")
        .bind(verified.id,sourceId,expected.hash,now,verified.last_edited_time??now,now,now,now,now,id,expected.revision,expected.reviewed?1:0,String(id),fence.token),
      db.prepare("SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('BREED_FIRST_COPY_CAS_FAILED','$') END"),
      db.prepare("INSERT INTO breed_notion_controlled_values(breed_id,values_json,notion_values_json,revision,updated_at) VALUES(?,?,?,0,?) ON CONFLICT(breed_id) DO NOTHING")
        .bind(id,controlledJson,controlledJson,now),
      db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM breed_notion_controlled_values WHERE breed_id=? AND json(values_json)=json(?)) THEN 1 ELSE json_extract('BREED_FIRST_COPY_CONTROLLED_MISMATCH','$') END")
        .bind(id,controlledJson),
    ]);
    insert=batch[0];
  }else{
    insert=await db.prepare("INSERT INTO "+s.mapping+" ("+(shared?"agenda,":"")+
    "notion_page_id,"+s.key+",content_hash,notion_last_edited_time,psipedia_updated_at,last_synced_at,created_at,updated_at) "+
    "SELECT "+(shared?"?,":"")+"?,?,?,?,?,?,?,? WHERE "+
    "EXISTS(SELECT 1 FROM "+s.table+" p WHERE id=? AND updated_at=? AND lower(status)<>'archived')"+
    " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=?)"+
    " AND EXISTS(SELECT 1 FROM notion_unified_manual_fence WHERE agenda=? AND entity_id=? AND owner_token=?)"+
    " AND NOT EXISTS(SELECT 1 FROM "+s.mapping+" WHERE "+s.key+"=?"+mappingScope+")"+
    " ON CONFLICT DO NOTHING")
    .bind(...scopeArgs,verified.id,id,expected.hash,verified.last_edited_time??now,expected.revision,now,now,now,
      id,expected.revision,s.kind,id,agenda,String(id),fence.token,id,...scopeArgs).run();
  }
  if(!insert.success||insert.meta.changes!==1||(await mapping())?.notion_page_id!==verified.id)
    throw Error("PROFILE_FIRST_CREATE_MAPPING_CONFLICT");
  await releaseUnifiedManualFence(db,fence);
  return {pageId:verified.id,created};
}

export const PROFILE_INBOUND_ID_PENDING="INBOUND_ID_PENDING";

/** Existing mapping is the only authority to acknowledge a new draft's identity.
 * A pending receipt is durable across lost PATCH responses. Only immutable
 * identity fields are written, never editorial content or a sync baseline. */
export async function acknowledgeInboundProfileIdentity(input:{
  database:D1Database;bindings:NotionSyncBindings;agenda:Exclude<Agenda,"breeds">;
  id:number;pageId:string;sourceId:string;revision:string;desired:Record<string,unknown>;
}):Promise<void>{
  const {database:db,bindings,agenda,id,pageId,sourceId,revision,desired}=input;
  if(bindings.NOTION_PROFILE_AUTHORITY_MODE!=="validated-text"||!Number.isSafeInteger(id)||id<1||!sourceId)
    throw Error("PROFILE_INBOUND_SCOPE");
  if(!Object.hasOwn(desired,"Psipedia ID")||Object.keys(desired).some(name=>!["Psipedia ID","Slug","URL Psipedia"].includes(name)))
    throw Error("PROFILE_INBOUND_IDENTITY_ONLY");
  const s=spec[agenda],scope=s.mapping==="notion_agenda_sync"?" AND agenda=?":"",args=scope?[agenda]:[];
  const local=()=>db.prepare("SELECT p.updated_at FROM "+s.table+" p JOIN "+s.mapping+" m ON m."+s.key+"=p.id WHERE p.id=? AND p.updated_at=? AND lower(p.status)='draft' AND m.notion_page_id=? AND m.content_hash=?"+(scope?" AND m.agenda=?":"")+
    " AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=p.id)")
    .bind(id,revision,pageId,PROFILE_INBOUND_ID_PENDING,...args,s.kind).first<{updated_at:string}>();
  const read=async()=>{
    const page=await notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId));
    if(page.id!==pageId||page.archived||page.in_trash||!notionPageBelongsToDataSource(page,sourceId))throw Error("PROFILE_INBOUND_PAGE_IDENTITY");
    for(const [name,wanted] of Object.entries(desired)){
      const raw=page.properties?.[name] as Record<string,unknown>|undefined;
      const type=Object.keys(wanted as Record<string,unknown>)[0];
      if(!raw||raw.type!==type||!Object.hasOwn(raw,type)||raw.has_more===true||
        (Array.isArray(raw[type])&&(raw[type] as unknown[]).length>=25))throw Error("PROFILE_INBOUND_IDENTITY_PROPERTY_MISSING: "+name);
    }
    const raw=page.properties?.["Psipedia ID"] as {type?:string;rich_text?:Array<{type?:string;plain_text?:string}>};
    if(raw.type!=="rich_text"||!Array.isArray(raw.rich_text)||raw.rich_text.some(p=>p.type!=="text"||typeof p.plain_text!=="string"))throw Error("PROFILE_INBOUND_ID_INVALID");
    const claimed=raw.rich_text.map(p=>p.plain_text).join("");
    if(claimed!==""&&claimed!==String(id))throw Error("PROFILE_INBOUND_ID_CONFLICT");
    return page;
  };
  if(!await local())throw Error("PROFILE_INBOUND_MAPPING_OR_REVISION");
  const page=await read();
  if(!await local())throw Error("PROFILE_INBOUND_MAPPING_OR_REVISION");
  const patch=Object.fromEntries(Object.entries(desired).filter(([name,value])=>!sameNotionProperty(page.properties?.[name],value)));
  if(Object.keys(patch).length)await notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId),{method:"PATCH",body:JSON.stringify({properties:patch})},{retryTransient:false});
  const verified=await read();
  if(!Object.entries(desired).every(([name,value])=>sameNotionProperty(verified.properties?.[name],value))||!await local())
    throw Error("PROFILE_INBOUND_IDENTITY_UNVERIFIED");
  const result=await db.prepare("UPDATE "+s.mapping+" SET content_hash='',notion_last_edited_time=?,psipedia_updated_at=?,updated_at=? WHERE "+s.key+"=? AND notion_page_id=? AND content_hash=?"+scope+
    " AND EXISTS(SELECT 1 FROM "+s.table+" p WHERE p.id=? AND p.updated_at=? AND lower(p.status)='draft' AND NOT EXISTS(SELECT 1 FROM admin_record_tombstones WHERE kind=? AND record_id=p.id))")
    .bind(verified.last_edited_time??null,revision,new Date().toISOString(),id,pageId,PROFILE_INBOUND_ID_PENDING,...args,id,revision,s.kind).run();
  if(!result.success||result.meta.changes!==1)throw Error("PROFILE_INBOUND_IDENTITY_CAS");
}
