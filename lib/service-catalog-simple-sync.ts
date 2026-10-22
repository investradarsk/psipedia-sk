/**
 * Services V3 catalog sync: a catalog entry is usable immediately in D1.
 * Notion is a second editor, not an approval gate. The existing 0139 journal
 * protects remote page creation/PATCH against an uncertain network outcome.
 *
 * The dedicated catalog source is NEVER the Directory profile source.
 * There is no automatic deletion, guessed matching, or last-write-wins.
 */
import {serviceCatalog,attributeCatalog,normalizeCatalogLabel} from "./service-catalog-contract.ts";
import {serviceFilterCategories} from "./directory-filter-contract.ts";
import {PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING} from "./service-catalog-notion-http-port.ts";
import {validateCatalogOptionDraft} from "./service-option-governance-contract.ts";

const binding=PSIPEDIA_SERVICE_CATALOG_NOTION_BINDING;
const sourceId=binding.dataSourceId;
const props=binding.properties;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const dynamic=/^(svc|attr)\.admin\.[a-f0-9]{32}$/;
const categories=new Set<string>(serviceFilterCategories);
const fallbackMeaning="Služba vedená v katalógu Psipedia.sk.";
const sourceActor="notion-service-catalog@psipedia.sk";
const notionVersion="2025-09-03";
const normalizeUuid=(id:string)=>id.toLowerCase().replaceAll("-","");
type DB=Pick<D1Database,"prepare">;
type Env={NOTION_API_TOKEN?:string;SERVICE_CATALOG_ADMIN_WRITES_ENABLED?:string;
  SERVICE_CATALOG_NOTION_MIRROR_READY?:string;SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED?:string;
  SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED?:string;SERVICE_CATALOG_NOTION_AUTO_ENABLED?:string;
  SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED?:string};
type Row={id:string;kind:"service"|"attribute";label:string;normalized_label:string;
  group_name:string;meaning:string;primary_category:string;categories_json:string;
  status:"DRAFT"|"ACTIVE"|"RETIRED";notion_mirror_status:"PENDING"|"SYNCED"|"CONFLICT";
  value_kind:string;version:number;updated_at:string};
type Fields={id:string;version:number;kind:"service"|"attribute";label:string;group:string;
  meaning:string;primaryCategory:string;categories:string[];valueKind:string};
type Remote={id:string;lastEdited:string;fields:Fields};
type RawPage={id?:string;parent?:{type?:string;data_source_id?:string};
  archived?:boolean;in_trash?:boolean;last_edited_time?:string;properties?:Record<string,unknown>};
type Summary={state:"DISABLED"|"BLOCKED"|"IDLE"|"SYNCED"|"REVIEW";
  created:number;updated:number;imported:number;verified:number;conflicts:number;reason?:string};
function readText(prop:unknown,key:"title"|"rich_text"):string{
  const list=(prop as Record<string,unknown>|undefined)?.[key];
  return Array.isArray(list)?list.map(x=>String(x?.plain_text??x?.text?.content??"")).join(""):"";
}
function readSelect(prop:unknown):string{
  return String((prop as {select?:{name?:string}}|undefined)?.select?.name??"");
}
function readMulti(prop:unknown):string[]{
  const values=(prop as {multi_select?:Array<{name?:string}>}|undefined)?.multi_select;
  return Array.isArray(values)?values.map(x=>x.name??"").filter(Boolean):[];
}
function extract(page:RawPage):Remote {
  if(!uuid.test(page.id??"")||page.parent?.type!=="data_source_id"||
    normalizeUuid(page.parent.data_source_id??"")!==normalizeUuid(sourceId)||
    page.archived||page.in_trash)throw Error("NOTION_CATALOG_OWNER_MISMATCH");
  const values=page.properties??{};
  const id=readText(values[props.optionId],"rich_text").trim();
  const version=Number((values[props.optionVersion] as {number?:number}|undefined)?.number??0);
  const label=readText(values[props.label],"title").normalize("NFC").trim();
  const kind=readSelect(values[props.kind])||"service";
  const selected=readMulti(values[props.categories]);
  const primaryCategory=readSelect(values[props.primaryCategory])||selected[0]||"";
  const group=readText(values[props.group],"rich_text").trim()||(kind==="service"?"Služby":"Vlastnosti");
  const meaning=readText(values[props.meaning],"rich_text").trim()||fallbackMeaning;
  const valueKind=readSelect(values[props.valueKind])||"tri_state";
  if(kind!=="service"&&kind!=="attribute")throw Error("NOTION_CATALOG_KIND_UNKNOWN");
  if(!Array.isArray(selected)||selected.length===0||selected.length>serviceFilterCategories.length||
     new Set(selected).size!==selected.length||selected.some(x=>!categories.has(x))||
     !selected.includes(primaryCategory)||label.length<3||label.length>100||
     !Number.isInteger(version)||version<0||id.length>100)
    throw Error("NOTION_CATALOG_FIELDS_INVALID");
  if(id&&!(dynamic.test(id)||serviceCatalog.some(s=>s.id===id)||attributeCatalog.some(s=>s.id===id)))
    throw Error("NOTION_CATALOG_UNKNOWN_ID");
  return {id:page.id!,lastEdited:page.last_edited_time??"",
    fields:{id,version,kind,label,group,meaning,primaryCategory,categories:selected,valueKind}};
}
function fromRow(row:Row):Fields{
  const cats=JSON.parse(row.categories_json) as string[];
  return {id:row.id,version:row.version,kind:row.kind,label:row.label,group:row.group_name,
    meaning:row.meaning,primaryCategory:row.primary_category,categories:cats,valueKind:row.value_kind};
}
function matching(a:Fields,b:Fields):boolean{
  return a.id===b.id&&a.kind===b.kind&&a.label===b.label&&a.group===b.group&&
    a.meaning===b.meaning&&a.primaryCategory===b.primaryCategory&&a.valueKind===b.valueKind&&
    [...a.categories].sort().join("|")===[...b.categories].sort().join("|");
}
function notionProperties(f:Fields){
  const rich=(str:string)=>({rich_text:[{text:{content:str}}]});
  const select=(str:string)=>({select:{name:str}});
  return {
    [props.optionId]:rich(f.id),
    [props.optionVersion]:{number:f.version},
    [props.kind]:select(f.kind),
    [props.label]:{title:[{text:{content:f.label}}]},
    [props.group]:rich(f.group),[props.meaning]:rich(f.meaning),
    [props.primaryCategory]:select(f.primaryCategory),
    [props.categories]:{multi_select:f.categories.map(name=>({name}))},
    [props.valueKind]:select(f.valueKind)
  };
}
export async function runSimpleServiceCatalogSync(input:{
  db:DB;env:Env;fetcher?:typeof fetch;maxWrites?:number;now?:Date
}):Promise<Summary>{
  const zero:Summary={state:"IDLE",created:0,updated:0,imported:0,verified:0,conflicts:0};
  const {env,db}=input;
  if(env?.SERVICE_CATALOG_NOTION_AUTO_ENABLED!=="true")return {...zero,state:"DISABLED"};
  if(!db?.prepare||!env.NOTION_API_TOKEN?.trim()||
     env.SERVICE_CATALOG_ADMIN_WRITES_ENABLED!=="true"||
     env.SERVICE_CATALOG_NOTION_MIRROR_READY!=="true"||
     env.SERVICE_CATALOG_NOTION_EXECUTOR_ENABLED!=="true")
    return {...zero,state:"BLOCKED",reason:"CATALOG_SYNC_CONFIGURATION"};
  const client=input.fetcher??fetch;
  const auth={"Authorization":"Bearer "+env.NOTION_API_TOKEN.trim(),
    "Notion-Version":notionVersion,"Content-Type":"application/json"};
  async function notion(path:string,method:"POST"|"PATCH",body:unknown):Promise<unknown>{
    const res=await client("https://api.notion.com/v1/"+path,{
      method,headers:auth,body:JSON.stringify(body)});
    if(!res.ok)throw Error("NOTION_HTTP_"+res.status);
    return res.json();
  }
  // Complete ownership inventory before ANY remote write. Do not assume that
  // an empty/error/partial query means no page exists.
  let remote:Remote[]=[];
  let cursor:string|undefined;
  const seenCursors=new Set<string>();
  try{
    for(let i=0;i<30;i++){
      const raw=await notion("data_sources/"+sourceId+"/query","POST",
        cursor?{page_size:100,start_cursor:cursor}:{page_size:100}) as {
        results?:RawPage[];has_more?:boolean;next_cursor?:string|null};
      if(!Array.isArray(raw.results)||typeof raw.has_more!=="boolean"||raw.results.length>100||
         (raw.has_more&&!raw.next_cursor))throw Error("NOTION_CATALOG_INCOMPLETE");
      remote.push(...raw.results.map(extract));
      if(!raw.has_more){cursor=undefined;break;}
      if(!raw.next_cursor||seenCursors.has(raw.next_cursor))throw Error("NOTION_CATALOG_CURSOR_LOOP");
      seenCursors.add(raw.next_cursor);cursor=raw.next_cursor;
    }
    if(cursor)throw Error("NOTION_CATALOG_PAGE_LIMIT");
  }catch(e){return {...zero,state:"BLOCKED",reason:e instanceof Error?e.message:"NOTION_CATALOG_READ_ERROR"};}
  const remoteById=new Map<string,Remote>();
  for(const page of remote){
    const id=page.fields.id;
    if(id){
      if(remoteById.has(id))return {...zero,state:"BLOCKED",reason:"DUPLICATE_NOTION_OPTION_ID"};
      remoteById.set(id,page);
    }
  }
  const rows=await db.prepare("SELECT id,kind,label,normalized_label,group_name,meaning,primary_category,categories_json,status,notion_mirror_status,value_kind,version,updated_at FROM service_catalog_admin_options ORDER BY id").all<Row>();
  const dynamicRows=rows.results??[];
  const byId=new Map(dynamicRows.map(x=>[x.id,x]));
  const statics:Fields[]=[
    ...serviceCatalog.map(s=>({id:s.id,version:1,kind:"service" as const,
      label:s.label,group:s.group,meaning:s.meaning,primaryCategory:s.categories[0],
      categories:[...s.categories],valueKind:"tri_state"})),
    ...attributeCatalog.map(s=>({id:s.id,version:1,kind:"attribute" as const,
      label:s.label,group:"Vlastnosti",meaning:s.meaning,primaryCategory:s.categories[0],
      categories:[...s.categories],valueKind:s.valueKind}))
  ];
  const all=[...statics,...dynamicRows.filter(x=>x.status!=="RETIRED").map(fromRow)];
  const knownNames=new Set(all.map(x=>normalizeCatalogLabel(x.label)));
  const limit=Math.max(1,Math.min(input.maxWrites??8,12));
  const now=(input.now??new Date()).toISOString();
  let operations=0;
  async function claim(f:Fields,action:"PROVISION_ONE"|"MIRROR_ONE"):Promise<boolean>{
    const result=await db.prepare(
      "INSERT INTO service_catalog_notion_auto_attempts (option_id,option_version,action,claimed_at) "+
      "VALUES (?1,?2,?3,?4) ON CONFLICT(option_id,option_version,action) DO NOTHING RETURNING option_id")
      .bind(f.id,f.version,action,now).first<{option_id:string}>();
    return !!result;
  }
  async function finish(f:Fields,action:"PROVISION_ONE"|"MIRROR_ONE",outcome:"CREATED_NEEDS_MIRROR"|"EXISTS"){
    await db.prepare("UPDATE service_catalog_notion_auto_attempts SET outcome=?1,finished_at=?2 "+
      "WHERE option_id=?3 AND option_version=?4 AND action=?5 AND outcome='CLAIMED'")
      .bind(outcome,new Date().toISOString(),f.id,f.version,action).run();
  }
  async function markSynced(row:Row){
    const result=await db.prepare(
      "UPDATE service_catalog_admin_options SET notion_mirror_status='SYNCED' "+
      "WHERE id=?1 AND version=?2 AND notion_mirror_status='PENDING' RETURNING id")
      .bind(row.id,row.version).first<{id:string}>();
    if(result)zero.verified++;
  }
  // Notion-created catalog options: deterministic D1 ID based on the owner page
  // makes retries idempotent and avoids duplicates when a remote write times out.
  for(const page of remote){
    if(operations>=limit)break;
    if(page.fields.id)continue;
    const f=page.fields;
    if(f.valueKind!=="tri_state"){zero.conflicts++;continue;}
    const id=(f.kind==="service"?"svc.admin.":"attr.admin.")+normalizeUuid(page.id);
    // A previous run may have committed the D1 import but timed out before
    // writing the canonical ID back to Notion. Recover that exact page, never
    // create a second D1 option with the same name.
    const saved=byId.get(id);
    if(saved){
      const wanted=fromRow(saved);
      if(saved.status==="RETIRED"||saved.notion_mirror_status==="CONFLICT"){zero.conflicts++;continue;}
      if(!await claim(wanted,"MIRROR_ONE")){zero.conflicts++;continue;}
      try{
        const ack=await notion("pages/"+encodeURIComponent(page.id),"PATCH",{properties:notionProperties(wanted)}) as RawPage;
        if(normalizeUuid(ack.id??"")!==normalizeUuid(page.id))throw Error("NOTION_IMPORT_ACK_INVALID");
        await finish(wanted,"MIRROR_ONE","EXISTS");
        zero.updated++;operations++;
      }catch{zero.conflicts++;}
      continue;
    }
    if(knownNames.has(normalizeCatalogLabel(f.label))){zero.conflicts++;continue;}
    let valid;
    try{valid=validateCatalogOptionDraft({name:f.label,kind:f.kind,categories:f.categories,group:f.group});}
    catch{zero.conflicts++;continue;}
    const inserted=await db.prepare(
      "INSERT INTO service_catalog_admin_options "+
      "(id,kind,label,normalized_label,group_name,meaning,primary_category,categories_json,value_kind,status,notion_mirror_status,version,created_at,updated_at,created_by,updated_by) "+
      "VALUES (?1,?2,?3,?4,?5,?6,?7,?8,'tri_state','ACTIVE','PENDING',1,?9,?9,?10,?10) "+
      "ON CONFLICT DO NOTHING RETURNING id")
      .bind(id,f.kind,valid.name,normalizeCatalogLabel(valid.name),valid.group,f.meaning,
        valid.category,JSON.stringify(valid.categories),now,sourceActor).first<{id:string}>();
    if(!inserted){zero.conflicts++;continue;}
    byId.set(id,{id,kind:f.kind,label:valid.name,normalized_label:normalizeCatalogLabel(valid.name),
      group_name:valid.group,meaning:f.meaning,primary_category:valid.category,
      categories_json:JSON.stringify(valid.categories),value_kind:"tri_state",status:"ACTIVE",
      notion_mirror_status:"PENDING",version:1,updated_at:now});
    knownNames.add(normalizeCatalogLabel(valid.name));
    zero.imported++;operations++;
  }
  // Reconcile known dynamic pages: Notion edits win ONLY when its version
  // equals the confirmed D1 version, with CAS preventing stale overwrites.
  for(const [id,page] of remoteById){
    if(operations>=limit)break;
    const row=byId.get(id);
    if(!row){if(!statics.some(s=>s.id===id))zero.conflicts++;continue;}
    if(!row)continue; // Built-ins are immutable definitions in source control.
    if(row.status==="RETIRED"||row.notion_mirror_status==="CONFLICT"){zero.conflicts++;continue;}
    const local=fromRow(row),other=page.fields;
    if(row.version===other.version&&matching(local,other)){
      if(row.notion_mirror_status==="PENDING")await markSynced(row);
      continue;
    }
    if(row.version===other.version&&other.valueKind==="tri_state"&&
       other.kind===local.kind&&other.id===id){
      if(knownNames.has(normalizeCatalogLabel(other.label))&&
         normalizeCatalogLabel(other.label)!==normalizeCatalogLabel(local.label)){
        zero.conflicts++;continue;
      }
      const changed=await db.prepare(
        "UPDATE service_catalog_admin_options SET label=?1,normalized_label=?2,group_name=?3,"+
        "meaning=?4,primary_category=?5,categories_json=?6,notion_mirror_status='PENDING',"+
        "version=version+1,updated_at=?7,updated_by=?8 "+
        "WHERE id=?9 AND version=?10 AND status='ACTIVE' AND notion_mirror_status<> 'CONFLICT' RETURNING id")
        .bind(other.label,normalizeCatalogLabel(other.label),other.group,other.meaning,
          other.primaryCategory,JSON.stringify(other.categories),now,sourceActor,id,row.version)
        .first<{id:string}>();
      if(changed){zero.imported++;operations++;}
      else zero.conflicts++;
      continue;
    }
    if(row.version>other.version&&row.status==="ACTIVE"){
      // Both sides changed? No guess: quarantine rather than replace a newer Notion edit.
      const remoteTs=Date.parse(page.lastEdited),localTs=Date.parse(row.updated_at);
      if(Number.isFinite(remoteTs)&&Number.isFinite(localTs)&&remoteTs>localTs+1000){
        zero.conflicts++;continue;
      }
      const attempt=await claim(local,"MIRROR_ONE");
      if(!attempt){zero.conflicts++;continue;}
      try{
        const ack=await notion("pages/"+encodeURIComponent(page.id),"PATCH",{properties:notionProperties(local)}) as RawPage;
        if(normalizeUuid(ack.id??"")!==normalizeUuid(page.id))throw Error("NOTION_ACK_ID_MISMATCH");
        await finish(local,"MIRROR_ONE","EXISTS");
        zero.updated++;operations++;
      }catch{zero.conflicts++;}
      continue;
    }
    zero.conflicts++;
  }
  // New local options AND the 119 built-in definitions share one Notion table.
  // A permanent 0139 claim prevents blindly duplicating an uncertain create.
  for(const local of all){
    if(operations>=limit)break;
    if(remoteById.has(local.id))continue;
    const row=byId.get(local.id);
    if(row&&row.status!=="ACTIVE")continue;
    if(env.SERVICE_CATALOG_NOTION_PAGE_CREATES_ENABLED!=="true"||
       env.SERVICE_CATALOG_NOTION_AUTO_PAGE_CREATES_ENABLED!=="true")break;
    const previous=await db.prepare(
      "SELECT option_id FROM service_catalog_notion_auto_attempts WHERE option_id=?1 AND action='PROVISION_ONE' LIMIT 1")
      .bind(local.id).first<{option_id:string}>();
    if(previous){zero.conflicts++;continue;}
    if(!await claim(local,"PROVISION_ONE"))continue;
    try{
      const ack=await notion("pages","POST",{parent:{type:"data_source_id",data_source_id:sourceId},
        properties:notionProperties(local)}) as RawPage;
      if(!uuid.test(ack.id??"")||normalizeUuid(ack.parent?.data_source_id??"")!==normalizeUuid(sourceId))
        throw Error("NOTION_CREATE_ACK_MISMATCH");
      await finish(local,"PROVISION_ONE","CREATED_NEEDS_MIRROR");
      zero.created++;operations++;
    }catch{zero.conflicts++;}
  }
  return {...zero,state:zero.conflicts?"REVIEW":operations||zero.verified?"SYNCED":"IDLE",
    ...(zero.conflicts?{reason:"UNVERIFIED_OR_CONFLICTING_NOTION_OPERATION"}:{})};
}
