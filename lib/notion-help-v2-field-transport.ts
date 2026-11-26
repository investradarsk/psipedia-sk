import { reserveUnifiedField, confirmUnifiedField } from "./notion-unified-field-transfer.ts";
import { readUnifiedAdminEdit } from "./notion-unified-admin-edits.ts";
import { readProfileFieldBaseline } from "./notion-profile-field-baseline.ts";
import { isAdminNotionSyncLocked } from "./admin-notion-review-lock.ts";
import { notionPageIsTombstoned } from "./admin-record-lifecycle.ts";
import { notionPageBelongsToDataSource } from "./notion-sync-page-ownership.ts";
import { notionRequest, type NotionPage, type NotionSyncBindings } from "./notion-sync-shared.ts";
import type { FieldObservation } from "./notion-unified-field-sync.ts";
import type { CanonicalSourceRecord, ReconciliationValue } from "./notion-bulk-reconciliation.ts";

type Agenda="adoptions"|"help-cases"|"lost-found";
const TABLES={adoptions:"adoption_dogs","help-cases":"help_cases","lost-found":"lost_found_dog_reports"} as const;
type FieldKind="text"|"number"|"checkbox"|"date"|"instant";
function normalizeHelpObservation(field:string,value:unknown):unknown {
  if(field!=="Naposledy videný"||typeof value!=="string"||!value.trim())return value;
  if(!/(Z|[+-]\\d{2}:\\d{2})$/i.test(value))return value;
  const parsed=new Date(value);return Number.isFinite(parsed.getTime())?parsed.toISOString():value;
}
/** Missing, wrong-type and potentially truncated values are observations of
 * absence, never proof of a deletion. Typed false/zero/null stay distinct. */
export function helpV2NotionObservation(page:Pick<NotionPage,"properties">,field:string,kind:FieldKind):FieldObservation {
  const p=page.properties?.[field] as Record<string,unknown>|undefined;
  if(!p||typeof p!=="object")return {present:false};
  const type=p.type;
  if(kind==="number"){
    if(type!=="number" || (p.number!==null && (typeof p.number!=="number" || !Number.isFinite(p.number))))return {present:false};
    return {present:true,value:p.number};
  }
  if(kind==="checkbox")return type==="checkbox"&&typeof p.checkbox==="boolean"?{present:true,value:p.checkbox}:{present:false};
  if(kind==="date"||kind==="instant"){
    if(type!=="date")return {present:false};
    if(p.date===null)return {present:true,value:""};
    const date=p.date as {start?:unknown;end?:unknown}|undefined;
    if(typeof date?.start!=="string"||date.end)return {present:false};
    const value=date.start.trim();
    if(kind==="instant"&&(!/(Z|[+-]\\d{2}:\\d{2})$/i.test(value)||!Number.isFinite(Date.parse(value))))return {present:false};
    return {present:true,value:normalizeHelpObservation(field,value)};
  }
  if(type==="title"||type==="rich_text"){
    const parts=p[type];
    if(!Array.isArray(parts)||parts.length>=25||parts.some(part=>!part||typeof part.plain_text!=="string"))return {present:false};
    return {present:true,value:parts.map(part=>part.plain_text).join("").trim()};
  }
  if(type==="url"||type==="email"||type==="phone_number"){
    const v=p[type];
    return v===null||typeof v==="string"?{present:true,value:typeof v==="string"?v.trim():""}:{present:false};
  }
  if(type==="select"||type==="status"){
    const v=p[type] as {name?:unknown}|null|undefined;
    return v===null||typeof v?.name==="string"?{present:true,value:typeof v?.name==="string"?v.name.trim():""}:{present:false};
  }
  // Some Psipedia ID schemas use a numeric Notion property.
  if(field==="Psipedia ID"&&type==="number"&&typeof p.number==="number"&&Number.isSafeInteger(p.number))
    return {present:true,value:String(p.number)};
  return {present:false};
}

type Scope={database:D1Database;bindings:NotionSyncBindings;agenda:Agenda;entityId:number;pageId:string;dataSourceId:string;
  load:(db:D1Database,id:number)=>Promise<CanonicalSourceRecord[]>};
type Adapter=Scope & {fields:readonly string[];direction:"pull"|"push";
  kind:(field:string)=>FieldKind|undefined;protectedFields:ReadonlySet<string>;
  pull:(field:string,value:unknown,revision:string)=>Promise<void>;
  encode:(values:Record<string,ReconciliationValue>)=>Record<string,unknown>};

async function observe(input:Adapter,field:string,kind:FieldKind,slugChange:boolean){
  const {database,bindings,agenda,entityId,pageId,dataSourceId}=input;
  if(await isAdminNotionSyncLocked(database,agenda,entityId)||await notionPageIsTombstoned(database,pageId))
    throw Error("HELP_V2_LOCKED");
  const mapping=await database.prepare("SELECT notion_page_id,content_hash FROM notion_agenda_sync WHERE agenda=? AND entity_id=?").bind(agenda,entityId).first<{notion_page_id:string;content_hash:string}>();
  if(mapping?.notion_page_id!==pageId)throw Error("HELP_V2_MAPPING_CHANGED");
  const revisionSql="SELECT updated_at,status FROM "+TABLES[agenda]+" WHERE id=?";
  const before=await database.prepare(revisionSql).bind(entityId).first<{updated_at:string;status:string}>();
  const source=(await input.load(database,entityId)).find(item=>item.id===String(entityId));
  const page=await notionRequest<NotionPage>(bindings,"/pages/"+encodeURIComponent(pageId));
  if(!before||!source||page.id!==pageId||!notionPageBelongsToDataSource(page,dataSourceId))throw Error("HELP_V2_SOURCE_CHANGED");
  const id=helpV2NotionObservation(page,"Psipedia ID","text"),url=helpV2NotionObservation(page,"URL Psipedia","text");
  if(!id.present||id.value!==String(entityId)||!url.present||(!slugChange&&url.value!==source.url))throw Error("HELP_V2_IDENTITY_CHANGED");
  const after=await database.prepare(revisionSql).bind(entityId).first<{updated_at:string;status:string}>();
  if(!after||after.updated_at!==before.updated_at||after.status!==before.status)throw Error("HELP_V2_REVISION_CHANGED");
  const currentMapping=await database.prepare("SELECT notion_page_id,content_hash FROM notion_agenda_sync WHERE agenda=? AND entity_id=?")
    .bind(agenda,entityId).first<{notion_page_id:string;content_hash:string}>();
  if(currentMapping?.notion_page_id!==pageId||currentMapping.content_hash!==mapping.content_hash||
    await isAdminNotionSyncLocked(database,agenda,entityId)||await notionPageIsTombstoned(database,pageId))throw Error("HELP_V2_SCOPE_CHANGED");
  const notion=helpV2NotionObservation(page,field,kind);
  const psipedia:FieldObservation=Object.hasOwn(source.properties,field)?{present:true,value:normalizeHelpObservation(field,source.properties[field])}:{present:false};
  return {page,source,mapping,revision:before.updated_at,status:before.status,notion,psipedia};
}

/** Shared Help transport: explicit field scope, no full-record replay or
 * provider timestamps pretending to be value-bound evidence. The canonical
 * adapter must enforce a revision/mapping/lock CAS inside its own SQL write. */
export async function syncHelpV2Fields(input:Adapter){
  const {database,agenda,entityId,pageId,direction}=input;
  const fields=[...new Set(input.fields)];
  if(direction==="push")for(const key of ["Slug",...(agenda==="lost-found"?["Typ"]:agenda==="help-cases"?["Kategória"]:[])]){
    if(fields.includes(key))fields.splice(0,0,...fields.splice(fields.indexOf(key),1));
  }
  let pulled=0,pushed=0;
  const failed:string[]=[];
  for(const field of fields){
    try{
      const structural=input.protectedFields.has(field),kind=input.kind(field);
      if(!kind)throw Error("HELP_V2_UNKNOWN_FIELD");
      if(structural&&direction==="pull")throw Error("HELP_V2_PROTECTED_FIELD");
      const slug=direction==="push"&&(field==="Slug"||(agenda==="lost-found"&&field==="Typ")||(agenda==="help-cases"&&field==="Kategória"));
      const observed=await observe(input,field,kind,slug);
      if(observed.status==="ARCHIVED"&&!(structural&&direction==="push"))throw Error("HELP_V2_ARCHIVED");
      const identity={agenda,entityId:String(entityId),pageId,field};
      if(!observed.notion.present||!observed.psipedia.present)throw Error("HELP_V2_MISSING_FIELD");
      const historical=structural?null:await readProfileFieldBaseline({database,agenda,entityId,pageId,expectedHash:observed.mapping.content_hash});
      const reservation=structural?null:await reserveUnifiedField({
        database,identity,historicalBaseline:historical&&Object.hasOwn(historical,field)?{value:normalizeHelpObservation(field,historical[field]),version:observed.mapping.content_hash}:null,
        notion:observed.notion,psipedia:observed.psipedia,direction,
        psipediaEdit:await readUnifiedAdminEdit(database,identity,observed.revision),
      });
      if(!structural&&!reservation)continue;
      const value=reservation?reservation.value:observed.psipedia.value;
      const fresh=await observe(input,field,kind,slug);
      if(fresh.revision!==observed.revision||!fresh.notion.present||!fresh.psipedia.present||
        fresh.notion.value!==observed.notion.value||fresh.psipedia.value!==observed.psipedia.value||
        fresh.page.last_edited_time!==observed.page.last_edited_time)
        throw Error("HELP_V2_SOURCE_CHANGED");
      if(direction==="pull")await input.pull(field,value,observed.revision);
      else {
        const values:Record<string,ReconciliationValue>={[field]:value as ReconciliationValue};
        if(slug)values["URL Psipedia"]=fresh.source.url;
        const patch=input.encode(values);
        if(Object.keys(values).some(key=>!Object.hasOwn(patch,key)))throw Error("HELP_V2_ENCODE_MISSING");
        await notionRequest(input.bindings,"/pages/"+encodeURIComponent(pageId),{method:"PATCH",body:JSON.stringify({properties:patch})});
      }
      const verified=await observe(input,field,kind,false);
      if(reservation)await confirmUnifiedField(database,reservation,verified.notion,verified.psipedia);
      else if(!verified.notion.present||!verified.psipedia.present||verified.notion.value!==verified.psipedia.value)
        throw Error("HELP_V2_CANONICAL_VERIFY_FAILED");
      if(direction==="pull")pulled++;else pushed++;
    }catch(error){
      failed.push(field);
      console.warn("HELP_V2_FIELD_PENDING",agenda,entityId,field,error instanceof Error?error.message:"UNKNOWN");
    }
  }
  return {pulled,pushed,failed};
}
