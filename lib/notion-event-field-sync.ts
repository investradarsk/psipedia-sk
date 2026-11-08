import type { DogEvent } from "./events.ts";
import { eventTypes, slovakRegions } from "./events.ts";
import { getManagedEventById, updateManagedEvent } from "./event-store.ts";
import { loadNotionBulkEvents } from "./notion-bulk-sources.ts";
import { hasCurrentGooglePlace } from "./notion-events-help-adapters.ts";
import { notionRequest } from "./notion-sync-shared.ts";
import { notionPageBelongsToDataSource, type NotionOwnedPage } from "./notion-sync-page-ownership.ts";
import { sameNotionProperty } from "./notion-selective-property-patch.ts";
import {
  EVENT_NOTION_FIELDS, EVENT_NOTION_PATHS, EVENT_LOCATION_PATHS, EVENT_CONTACT_BACKFILL_PATHS,
  eventChangedNotionFields, eventReadNotionProperty, eventEmpty,
  eventValidateURL, eventGetPath, type EventNotionField,
} from "./notion-event-field-contract.ts";

export type EventFieldSyncBindings = {
  NOTION_API_TOKEN?: string;
  NOTION_EVENTS_DATA_SOURCE_ID?: string;
  NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED?: string;
  NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED?: string;
};
type Page=NotionOwnedPage & {properties?:Record<string,unknown>;last_edited_time?:string};
type SyncStatus="disabled"|"unlinked"|"synced"|"pending";
type Source=Awaited<ReturnType<typeof loadNotionBulkEvents>>[number];
const SYSTEM_ACTOR="notion-event-field-sync@psipedia.sk";
const SCALARS:Partial<Record<EventNotionField,string>>={
  title:"title",eventType:"event_type",startDate:"start_date",startTime:"start_time",
  endDate:"end_date",endTime:"end_time",organizer:"organizer",
  excerpt:"excerpt",description:"description",practicalInfo:"practical_info",
  contactPhone:"contact_phone",contactEmail:"contact_email",admissionFee:"admission_fee",
  websiteUrl:"website_url",registrationUrl:"registration_url",
};
const SEO:Partial<Record<EventNotionField,string>>={
  "seo.title":"title","seo.description":"description","seo.focusKeyword":"focusKeyword",
  "seo.canonicalUrl":"canonicalUrl","seo.noindex":"noindex","seo.ogTitle":"ogTitle",
  "seo.ogDescription":"ogDescription","seo.ogImage":"ogImage",
};
function available(bindings:EventFieldSyncBindings){
  return bindings.NOTION_EVENTS_HELP_BIDIRECTIONAL_SYNC_ENABLED==="true" &&
    Boolean(bindings.NOTION_API_TOKEN?.trim()) &&
    Boolean(bindings.NOTION_EVENTS_DATA_SOURCE_ID?.trim());
}
function verifyIdentity(page:Page, source:Source, bindings:EventFieldSyncBindings){
  if(!notionPageBelongsToDataSource(page,bindings.NOTION_EVENTS_DATA_SOURCE_ID!))
    throw Error("EVENT_NOTION_SOURCE_MISMATCH");
  if(eventReadNotionProperty(page.properties?.["Psipedia ID"])!==source.id)
    throw Error("EVENT_NOTION_ID_MISMATCH");
  const remoteURL=eventReadNotionProperty(page.properties?.["URL Psipedia"]);
  if(remoteURL!==source.url) throw Error("EVENT_NOTION_URL_MISMATCH");
}
async function loadSource(db:D1Database,id:number):Promise<Source>{
  const source=(await loadNotionBulkEvents(db,id)).find(v=>v.id===String(id));
  if(!source)throw Error("EVENT_CANONICAL_NOT_FOUND");
  return source;
}
async function getMapping(db:D1Database,id:number){
  return db.prepare("SELECT notion_page_id FROM event_notion_sync WHERE event_id=? LIMIT 1")
    .bind(id).first<{notion_page_id:string}>();
}
async function confirmMapping(db:D1Database,pageId:string,id:number){
  const mapping=await getMapping(db,id);
  if(!mapping?.notion_page_id || mapping.notion_page_id!==pageId)throw Error("EVENT_NOTION_MAPPING_INVALID");
  const collision=await db.prepare(
    "SELECT event_id FROM event_notion_sync WHERE notion_page_id=? AND event_id<>? LIMIT 1",
  ).bind(pageId,id).first<{event_id:number}>();
  if(collision)throw Error("EVENT_NOTION_MAPPING_COLLISION");
}
function valueFromPage(raw:unknown,field:EventNotionField):string|boolean|null{
  const value=eventReadNotionProperty(raw);
  if(field==="seo.noindex")return typeof value==="boolean"?value:null;
  return typeof value==="string"?value:null;
}
function encodeValue(value:unknown,raw:unknown):Record<string,unknown>{
  if(!raw || typeof raw!=="object")throw Error("EVENT_NOTION_PROPERTY_MISSING");
  const prop=raw as Record<string,unknown>;
  const type=typeof prop.type==="string"?prop.type:Object.keys(prop)
    .find(v=>["rich_text","title","url","email","phone_number","date","checkbox","select"].includes(v));
  const text=value==null?"":String(value);
  if(type==="checkbox")return {checkbox:value===true};
  if(type==="date")return {date:text?{start:text}:null};
  if(type==="url")return {url:text||null};
  if(type==="email")return {email:text||null};
  if(type==="phone_number")return {phone_number:text||null};
  if(type==="select")return {select:text?{name:text}:null};
  if(type==="rich_text" || type==="title"){
    if(text.length>50000)throw Error("EVENT_NOTION_TEXT_TOO_LONG");
    const rich_text=[];
    for(let start=0;start<text.length;start+=1700){
      rich_text.push({type:"text",text:{content:text.slice(start,start+1700)}});
    }
    return {[type]:rich_text};
  }
  throw Error("EVENT_NOTION_UNSUPPORTED_PROPERTY_TYPE");
}
async function patchNotion(bindings:EventFieldSyncBindings,pageId:string,
  properties:Record<string,unknown>):Promise<Page>{
  return notionRequest<Page>(bindings,"/pages/"+encodeURIComponent(pageId),{
    method:"PATCH",body:JSON.stringify({properties}),
  });
}
function validate(path:EventNotionField,value:string|boolean,live:DogEvent){
  if(path==="seo.noindex"){
    if(typeof value!=="boolean")throw Error("CHECKBOX_INVALID");
    return;
  }
  if(typeof value!=="string")throw Error("TEXT_EXPECTED");
  if(!value.trim())throw Error("EMPTY_NOT_A_DELETE"); // Missing Notion never erases.
  if(value.length>60000)throw Error("VALUE_TOO_LONG");
  if(path==="contactPhone" && value.length>80)throw Error("PHONE_TOO_LONG");
  if(path==="admissionFee" && value.length>160)throw Error("ADMISSION_TOO_LONG");
  if(path==="contactEmail" &&
    (value.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)))
    throw Error("EMAIL_INVALID");
  if(["registrationUrl","websiteUrl","seo.canonicalUrl","seo.ogImage"].includes(path))
    eventValidateURL(value);
  if(path==="title" && !value.trim())throw Error("TITLE_REQUIRED");
  if(path==="eventType" && !(eventTypes as readonly string[]).includes(value))
    throw Error("EVENT_TYPE_INVALID");
  if(path==="region" && !(slovakRegions as readonly string[]).includes(value))
    throw Error("REGION_INVALID");
  if(path==="startDate" || path==="endDate"){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value+"T12:00:00Z")))throw Error("DATE_INVALID");
    if(path==="startDate" && live.endDate && live.endDate<value)
      throw Error("DATE_AFTER_END");
    if(path==="endDate" && live.startDate>value)
      throw Error("DATE_BEFORE_START");
  }
  if(["startTime","endTime"].includes(path) &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error("TIME_INVALID");
}
async function saveField(db:D1Database,id:number,path:EventNotionField,value:string|boolean){
  const live=await getManagedEventById(id);
  if(!live)throw Error("EVENT_CANONICAL_MISSING");
  validate(path,value,live);
  const geo=EVENT_LOCATION_PATHS.has(path);
  if(geo){
    // Never bypass the managed GEO invalidation and Google Place protection.
    if(await hasCurrentGooglePlace(db,"MANAGED_EVENT",id))
      throw Error("GOOGLE_PLACE_LOCATION_LOCKED");
    if(eventGetPath(live as unknown as Record<string,unknown>,path)===value)return false;
    const next={...live,[path]:value} as DogEvent;
    const saved=await updateManagedEvent(id,next,SYSTEM_ACTOR,live);
    if(!saved)throw Error("EVENT_LOCATION_WRITE_FAILED");
    return true;
  }
  const scalar=SCALARS[path],seo=SEO[path];
  if(!scalar && !seo)throw Error("EVENT_FIELD_NOT_ALLOWED");
  const current=eventGetPath(live as unknown as Record<string,unknown>,path);
  const comparable=(v:unknown)=>v==null?"":v;
  if(comparable(current)===value)return false;
  const now=new Date().toISOString();
  // SQL identifiers and JSON paths are from compile-time allowlists;
  // content is always parameter-bound. Revision guard prevents lost updates.
  const assignment=scalar?scalar+"=?":"seo_json=json_set(COALESCE(seo_json,'{}'),?,?)";
  const args=scalar?[value]:["$."+seo,value];
  const saved=await db.prepare(
    "UPDATE managed_events SET "+assignment+
    ",updated_at=?,updated_by=? WHERE id=? AND updated_at=? RETURNING id"
  ).bind(...args,now,SYSTEM_ACTOR,id,live.updatedAt).first<{id:number}>();
  if(!saved)throw Error("EVENT_FIELD_CONCURRENT_UPDATE");
  return true;
}
async function updateMetadata(bindings:EventFieldSyncBindings,page:Page,
  errors:string[],wasWritten:boolean,touched:string[]){
  const previous=eventReadNotionProperty(page.properties?.["Sync chyba"]);
  const outstanding=typeof previous==="string"&&previous.startsWith("POLIA: ")
    ? previous.slice(7).split(", ").filter(Boolean):[];
  const newErrors=[
    ...outstanding.filter(problem=>!touched.some(name=>problem.startsWith(name+" ("))),
    ...errors,
  ];
  // Preserve unresolved field errors from other webhooks, rather than falsely
  // announcing that a different valid field repaired the old invalid URL.
  const data:Record<string,unknown>={
    "Sync stav":newErrors.length?"Chyba":"Synchronizované",
    "Sync chyba":newErrors.length?"POLIA: "+newErrors.join(", ").slice(0,1500):"",
  };
  if(wasWritten && !newErrors.length)data["Posledný sync"]=new Date().toISOString();
  const patch:Record<string,unknown>={};
  for(const [name,value] of Object.entries(data)){
    const raw=page.properties?.[name];
    if(!raw)continue;
    const converted=encodeValue(value,raw);
    if(!sameNotionProperty(raw,converted))patch[name]=converted;
  }
  if(Object.keys(patch).length)await patchNotion(bindings,page.id,patch);
}

/**
 * Signed Notion webhook -> D1: only property IDs in updated_properties.
 * An invalid contact/URL/date can never cancel the other field commits.
 */
export async function syncEventNotionFields(input:{
  database:D1Database;bindings:EventFieldSyncBindings;page:Page;
  updatedPropertyIds:readonly string[];
}):Promise<"processed"|"review-required"|"deferred">{
  if(!available(input.bindings))return "deferred";
  const mapping=await input.database.prepare(
    "SELECT event_id FROM event_notion_sync WHERE notion_page_id=? LIMIT 1",
  ).bind(input.page.id).first<{event_id:number}>();
  if(!mapping)return "deferred";
  const id=Number(mapping.event_id);
  if(!Number.isSafeInteger(id)||id<1)throw Error("EVENT_ID_INVALID");
  const source=await loadSource(input.database,id);
  verifyIdentity(input.page,source,input.bindings);
  await confirmMapping(input.database,input.page.id,id);
  const fields=eventChangedNotionFields(input.page.properties,input.updatedPropertyIds);
  if(!fields.length)return "processed";
  let saved=0;
  const errors:string[]=[];
  for(const path of fields){
    const property=EVENT_NOTION_FIELDS[path];
    try{
      const value=valueFromPage(input.page.properties?.[property],path);
      if(value===null || eventEmpty(value))continue;
      if(await saveField(input.database,id,path,value))saved++;
    }catch(e){
      const reason=e instanceof Error?e.message:"UNKNOWN";
      errors.push(property+" ("+reason+")");
      console.error("EVENT_NOTION_FIELD_FAILED",id,property,reason);
    }
  }
  await updateMetadata(input.bindings,input.page,errors,saved>0,
    fields.map(path=>EVENT_NOTION_FIELDS[path]));
  return errors.length?"review-required":"processed";
}
/**
 * Targeted Admin save -> mapped Notion page: ONLY the fields actually edited
 * in Admin, plus a non-destructive initial contact/keyword backfill.
 */
export async function syncEventAdminFields(input:{
  database:D1Database;bindings:EventFieldSyncBindings;eventId:number;
  changedFields:readonly EventNotionField[];
}):Promise<SyncStatus>{
  if(input.bindings.NOTION_TARGETED_ADMIN_WRITEBACK_ENABLED!=="true" ||
      !available(input.bindings))return "disabled";
  if(!Number.isSafeInteger(input.eventId)||input.eventId<1)return "unlinked";
  const mapping=await getMapping(input.database,input.eventId);
  if(!mapping)return "unlinked";
  try{
    const source=await loadSource(input.database,input.eventId);
    const page=await notionRequest<Page>(input.bindings,
      "/pages/"+encodeURIComponent(mapping.notion_page_id));
    if(page.id!==mapping.notion_page_id)throw Error("EVENT_NOTION_PAGE_MISMATCH");
    verifyIdentity(page,source,input.bindings);
    await confirmMapping(input.database,page.id,input.eventId);
    const selected=new Set<EventNotionField>(input.changedFields);
    for(const path of [...EVENT_CONTACT_BACKFILL_PATHS,"seo.focusKeyword" as EventNotionField]){
      const name=EVENT_NOTION_FIELDS[path];
      const before=valueFromPage(page.properties?.[name],path);
      const canonical=source.properties[name];
      if(eventEmpty(before)&&!eventEmpty(canonical))selected.add(path);
    }
    const errors:string[]=[];
    let latest=page;
    let written=0;
    for(const path of EVENT_NOTION_PATHS){
      if(!selected.has(path))continue;
      const name=EVENT_NOTION_FIELDS[path];
      try{
        const original=latest.properties?.[name];
        if(!original)throw Error("NOTION_FIELD_MISSING");
        const value=source.properties[name];
        if(eventEmpty(value))continue; // No implicit deletion in either direction.
        const encoded=encodeValue(value,original);
        if(sameNotionProperty(original,encoded))continue;
        // Each PATCH is isolated: a rejected URL must not undo other writes.
        const reply=await patchNotion(input.bindings,page.id,{[name]:encoded});
        if(reply.id!==page.id || !reply.properties?.[name] ||
           !sameNotionProperty(reply.properties[name],encoded))
          throw Error("EVENT_NOTION_WRITEBACK_UNVERIFIED:"+name);
        latest=reply;
        written++;
      }catch(e){
        errors.push(name+" ("+(e instanceof Error?e.message:"UNKNOWN")+")");
      }
    }
    await updateMetadata(input.bindings,latest,errors,written>0,
      [...selected].map(path=>EVENT_NOTION_FIELDS[path]));
    return errors.length?"pending":"synced";
  }catch(e){
    console.error("EVENT_ADMIN_FIELD_SYNC_FAILED",input.eventId,
      e instanceof Error?e.message:"UNKNOWN");
    return "pending";
  }
}
