
/** Step 2/4: source-aware, additive STAGED copy, never JSON-driven editorial overwrite. */
import {notionId,notionText} from "./directory-notion-onetime-import.mjs";
export const STEP2_TABLES=[
  "directory_profile_extra_fields","directory_profile_extra_list_state",
  "directory_profile_extra_list_items","directory_profile_service_texts",
  "directory_profile_image_display_settings","directory_profile_sql_cutover_state",
];
export const STEP2_INDEXES=[
  "directory_profile_extra_fields_key_idx",
  "directory_profile_extra_list_items_key_idx",
  "directory_profile_sql_cutover_state_state_idx",
];
const extras=["Zdroj dát","Zdroj obrázka","Alt text obrázka","Organizácia","Zameranie"];
const technicalLists=[
  "_psipedia_breeder_club_profile_ids","_psipedia_trainer_breed_ids",
  "_psipedia_trainer_club_ids","_psipedia_profile_gallery_urls",
  "_psipedia_breeder_gallery_urls",
];
function object(raw){
  try{const v=JSON.parse(raw);return v&&typeof v==="object"&&!Array.isArray(v)?v:null;}
  catch{return null;}
}
function list(raw){
  try{
    const a=typeof raw==="string"?JSON.parse(raw):raw;
    return Array.isArray(a)&&a.every(v=>typeof v==="string"||Number.isSafeInteger(v))
      ?a.map(String):null;
  }catch{return null;}
}
function display(raw,context){
  // A legacy TEXT literal "null" means no override, like SQL NULL.
  // The public image reader already displays both as the default.
  if(raw===null||raw===undefined||raw===""||
     (typeof raw==="string"&&raw.trim()==="null"))return null;
  const v=object(raw);
  const modes=context==="thumbnail"?["auto","crop","blur"]:["natural","crop","blur"];
  return v&&modes.includes(v.mode)&&[v.x,v.y,v.zoom].every(Number.isFinite)&&
    v.x>=0&&v.x<=100&&v.y>=0&&v.y<=100&&v.zoom>=1&&v.zoom<=2.5
    ?{context,...v}:false;
}
export function step2Plan(row,page,sourceId){
  if(!Number.isSafeInteger(Number(row?.id))||!row.updated_at)
    return {ok:false,reason:"invalid_profile"};
  if(row.status==="archived"||Number(row.tombstone)>0)
    return {ok:false,reason:"archived_or_deleted"};
  const source=object(row.source_data_json);
  if(!source)return {ok:false,reason:"invalid_technical_source"};
  const norm=v=>String(v??"").replaceAll("-","").toLowerCase();
  const permitted=Boolean(page&&norm(page.id)===norm(row.notion_page_id)&&
    norm(page.parent?.data_source_id)===norm(sourceId)&&
    notionId(page)===Number(row.id)&&!page.archived&&!page.in_trash&&
    !Number(row.sql_review_locked)&&!Number(row.legacy_review_locked)&&
    !Number(row.partner_active));
  const fields=[],lists=[],displays=[],issues=[];
  if(permitted)for(const key of extras){
    const value=notionText(page,key);
    if(value!==null&&value.length<=120000&&value!=="")fields.push([key,value]);
    else if(value===null)issues.push("missing_notion_field");
  }
  // Trainer services prose is editorial. Historical source_data_json is
  // deliberately NOT a trusted source for it; an unambiguous Notion value
  // may be staged below, otherwise keep the source in the parity review.
  if(Object.hasOwn(source,"_psipedia_trainer_services_text"))
    issues.push("trainer_services_historical_editorial_requires_parity");
  for(const key of technicalLists){
    if(!Object.hasOwn(source,key))continue;
    const values=list(source[key]);
    if(!values||values.length>100){issues.push("bad_technical_list");continue;}
    lists.push({key,values});
  }
  const current=list(row.services_json);
  if(!current)return {ok:false,reason:"invalid_admin_services"};
  let services=current.map(x=>x.trim()).filter(Boolean);
  if(permitted){
    const fromNotion=notionText(page,"Služby");
    if(fromNotion){
      const incoming=fromNotion.split(/\r?\n|<br\s*\/?\s*>/gi).map(x=>x.trim()).filter(Boolean);
      if(!services.length)services=incoming;
      else if(JSON.stringify(services)!==JSON.stringify(incoming))
        issues.push("service_field_revision_ambiguous");
    }
  }
  if(services.length>100||services.some(x=>x.length>4000))
    return {ok:false,reason:"bad_services"};
  // Keep each D1 batch below the transport limit; never abort a partially
  // completed full import because one profile has an enormous technical list.
  const plannedStatementCount=1+fields.length+services.length+
    lists.reduce((n,item)=>n+1+item.values.length,0)+2;
  if(plannedStatementCount>=150)return {ok:false,reason:"step2_large_profile"};
  for(const [context,col] of [
    ["thumbnail","thumbnail_display_json"],["detail","detail_display_json"]]){
    const value=display(row[col],context);
    if(value===false)issues.push("invalid_display");
    else if(value)displays.push(value);
  }
  const notionRevision=permitted?page.last_edited_time??null:null;
  if(permitted&&!notionRevision)return {ok:false,reason:"notion_revision_missing"};
  return {ok:true,id:Number(row.id),pageId:permitted?page.id:null,
    sourceRevision:row.updated_at,notionRevision,fields,lists,services,displays,issues};
}
export function step2Sql(plan,now,actor){
  if(!plan.ok)throw Error("STEP2_INVALID_PLAN");
  const id=plan.id,out=[];
  const push=(sql,params)=>out.push({sql,params});
  for(const [key,value] of plan.fields)push(
    "INSERT INTO directory_profile_extra_fields "+
    "(profile_id,field_key,value_kind,text_value,number_value,updated_at,updated_by) "+
    "VALUES(?,?,'text',?,NULL,?,?) ON CONFLICT DO NOTHING",
    [id,key,value,now,actor]);
  for(const l of plan.lists){
    push("INSERT INTO directory_profile_extra_list_state "+
      "(profile_id,field_key,updated_at,updated_by) VALUES(?,?,?,?) ON CONFLICT DO NOTHING",
      [id,l.key,now,actor]);
    for(const [order,value] of l.values.entries())push(
      "INSERT INTO directory_profile_extra_list_items "+
      "(profile_id,field_key,item_order,item_text,updated_at,updated_by) "+
      "VALUES(?,?,?,?,?,?) ON CONFLICT DO NOTHING",
      [id,l.key,order,value,now,actor]);
  }
  for(const [order,value] of plan.services.entries())push(
    "INSERT INTO directory_profile_service_texts "+
    "(profile_id,item_order,service_text,updated_at,updated_by) "+
    "VALUES(?,?,?,?,?) ON CONFLICT DO NOTHING",[id,order,value,now,actor]);
  for(const d of plan.displays)push(
    "INSERT INTO directory_profile_image_display_settings "+
    "(profile_id,display_context,display_mode,focus_x,focus_y,zoom,updated_at,updated_by) "+
    "VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING",
    [id,d.context,d.mode,d.x,d.y,d.zoom,now,actor]);
  push("INSERT INTO directory_profile_sql_cutover_state "+
    "(profile_id,state,source_revision,notion_revision,staged_fields,staged_lists,"+
    "verified_at,cutover_at,updated_at) "+
    "SELECT id,'STAGED',?,?,?,?,NULL,NULL,? FROM directory_profiles "+
    "WHERE id=? AND updated_at=? AND status<>'archived' "+
    "ON CONFLICT(profile_id) DO NOTHING RETURNING profile_id",
    [plan.sourceRevision,plan.notionRevision,
      plan.fields.length+plan.services.length+plan.displays.length,plan.lists.length,
      now,id,plan.sourceRevision]);
  return out;
}
