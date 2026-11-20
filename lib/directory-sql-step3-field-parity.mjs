/**
 * Adresár 3/4: read-only field-level parity against the live canonical D1
 * snapshot and signed Notion revision. Never expose editorial/contact values.
 *
 * A STAGED receipt is only a snapshot. This audit does not authorize a runtime
 * cutover, even when every compared field is equal.
 */
import { step2Plan } from "./directory-sql-step2-plan.mjs";
import { planNotionDirectoryImport } from "./directory-notion-onetime-import.mjs";
import { summarizeDirectoryStep3Issues } from "./directory-sql-step3-readiness.mjs";

export const DIRECTORY_STEP3_FIELD_PARITY_SQL = [
  "SELECT p.id,c.state,c.source_revision,c.notion_revision,",
  "(SELECT json_group_array(service_text) FROM",
  "(SELECT service_text FROM directory_profile_service_texts",
  "WHERE profile_id=p.id ORDER BY item_order)) AS sql_services_json,",
  "(SELECT json_object('mode',display_mode,'x',focus_x,'y',focus_y,'zoom',zoom)",
  "FROM directory_profile_image_display_settings",
  "WHERE profile_id=p.id AND display_context='thumbnail') AS sql_thumbnail_json,",
  "(SELECT json_object('mode',display_mode,'x',focus_x,'y',focus_y,'zoom',zoom)",
  "FROM directory_profile_image_display_settings",
  "WHERE profile_id=p.id AND display_context='detail') AS sql_detail_json,",
  "(SELECT json_group_array(json_object('key',field_key,'kind',value_kind,'text',text_value)) FROM",
  "(SELECT field_key,value_kind,text_value FROM directory_profile_extra_fields",
  "WHERE profile_id=p.id ORDER BY field_key)) AS sql_fields_json,",
  "(SELECT json_group_array(field_key) FROM",
  "(SELECT field_key FROM directory_profile_extra_list_state",
  "WHERE profile_id=p.id ORDER BY field_key)) AS sql_list_state_json,",
  "(SELECT json_group_array(json_object('key',field_key,'item',item_text,'ord',item_order)) FROM",
  "(SELECT field_key,item_text,item_order FROM directory_profile_extra_list_items",
  "WHERE profile_id=p.id ORDER BY field_key,item_order)) AS sql_list_items_json",
  "FROM directory_profiles p LEFT JOIN directory_profile_sql_cutover_state c",
  "ON c.profile_id=p.id WHERE p.id>? ORDER BY p.id LIMIT 200",
].join(" ");

function decode(value, name) {
  try { return JSON.parse(value === null ? "null" : value); }
  catch { throw Error("DIRECTORY_STEP3_BAD_SQL_" + name); }
}
function array(value,name) {
  const x=decode(value,name);
  if(!Array.isArray(x)||x.length>250)throw Error("DIRECTORY_STEP3_BAD_SQL_"+name);
  return x;
}
const normId = value => String(value ?? "").replaceAll("-","").toLowerCase();
function same(a,b) { return JSON.stringify(a)===JSON.stringify(b); }
function display(raw,context) {
  if(raw==null||raw==="")return null;
  let value;
  try { value=decode(raw,"DISPLAY"); }
  catch { return false; }
  // Distinguish encoded JSON null from a malformed configuration object.
  if(value===null)return null;
  if(!value||typeof value!=="object"||Array.isArray(value))
    return false;
  const modes=context==="thumbnail"?["auto","crop","blur"]:["natural","crop","blur"];
  if(!modes.includes(value.mode)||
    ![value.x,value.y,value.zoom].every(Number.isFinite)||
    value.x<0||value.x>100||value.y<0||value.y>100||
    value.zoom<1||value.zoom>2.5)return false;
  return {mode:value.mode,x:value.x,y:value.y,zoom:value.zoom};
}

/**
 * @param {Array<object>} records projection rows from D1 (no private values
 *   are included in output)
 * @param {Map<number,object>} profiles existing canonical profile rows
 * @param {Map<number,object>} pages current Notion pages, keyed by Psipedia ID
 * @param {string} sourceId expected Notion data-source identity
 */
export function summarizeDirectoryStep3SqlFieldParity(records, profiles, pages, sourceId) {
  if(!Array.isArray(records)||!(profiles instanceof Map)||!(pages instanceof Map))
    throw Error("DIRECTORY_STEP3_INVALID_FIELD_PARITY_INPUT");
  const results=[],seen=new Set();
  let comparable=0,matching=0,blocked=0;
  const legacyDisplayStorage = {
    thumbnail:{sql_null:0,json_null:0,valid_object:0,invalid:0},
    detail:{sql_null:0,json_null:0,valid_object:0,invalid:0},
  };
  const displayClass = (raw,context) =>
    raw==null || raw==="" ? "sql_null"
      : typeof raw==="string" && raw.trim()==="null" ? "json_null"
        : display(raw,context)===false ? "invalid" : "valid_object";
  for(const record of records) {
    const id=Number(record.id);
    if(!Number.isSafeInteger(id)||id<1||seen.has(id))
      throw Error("DIRECTORY_STEP3_DUPLICATE_FIELD_PARITY_ID");
    seen.add(id);
    const profile=profiles.get(id),page=pages.get(id);
    if(!profile)throw Error("DIRECTORY_STEP3_UNKNOWN_FIELD_PARITY_ID");
    if(profile.status==="archived"||Number(profile.tombstone)>0)continue;
    for(const context of ["thumbnail","detail"]){
      const category=displayClass(profile[context+"_display_json"],context);
      legacyDisplayStorage[context][category]++;
    }
    const issues=[];
    if(!record.state) issues.push("missing_sql_receipt");
    else if(!["STAGED","VERIFIED","SQL_ONLY"].includes(record.state))
      throw Error("DIRECTORY_STEP3_INVALID_FIELD_PARITY_STATE");
    if(record.state && record.source_revision!==profile.updated_at)
      issues.push("d1_revision_changed");

    const changedNotion=Boolean(record.notion_revision)&&(
      !page || normId(page.id)!==normId(profile.notion_page_id) ||
      page.last_edited_time!==record.notion_revision);
    if(changedNotion)issues.push("notion_revision_changed");
    // A stale snapshot cannot be compared as the current SQL owner.
    if(!record.state||record.source_revision!==profile.updated_at) {
      blocked++;
      results.push({id,issues});continue;
    }
    const trusted=Boolean(page&&
      planNotionDirectoryImport(page,profile,sourceId).ok===true);
    const plan=step2Plan(profile,trusted&&!changedNotion?page:null,sourceId);
    if(!plan.ok){issues.push("source_plan_invalid");blocked++;results.push({id,issues});continue;}
    comparable++;

    const services=array(record.sql_services_json,"SERVICES");
    if(services.some(x=>typeof x!=="string")||!same(services,plan.services))
      issues.push("service_sql_value_mismatch");

    for(const [ctx,col] of [
      ["thumbnail","sql_thumbnail_json"],["detail","sql_detail_json"],
    ]) {
      const legacy=display(profile[ctx+"_display_json"],ctx);
      const sqlValue=display(record[col],ctx);
      if(legacy===false) issues.push("invalid_legacy_"+ctx+"_display");
      else if(sqlValue===false) issues.push("invalid_sql_"+ctx+"_display");
      else if(!same(legacy,sqlValue)) issues.push(ctx+"_display_sql_mismatch");
    }

    const listState=array(record.sql_list_state_json,"LIST_STATE");
    const listItems=array(record.sql_list_items_json,"LIST_ITEMS");
    const expectedListState=plan.lists.map(x=>x.key).sort();
    if(listState.some(x=>typeof x!=="string")||
      !same([...listState].sort(),expectedListState))
      issues.push("technical_list_state_mismatch");
    const expectedItems=plan.lists.flatMap(x=>x.values.map((item,ord)=>({
      key:x.key,item,ord,
    })));
    if(!same(listItems,expectedItems))issues.push("technical_list_items_mismatch");

    // Notion extras require an exact original signed page revision; absence
    // or changed pages must NOT be counted as a current field-value mismatch.
    if(trusted&&!changedNotion && record.notion_revision===page.last_edited_time) {
      const actual=array(record.sql_fields_json,"FIELDS").map(x=>({
        key:x.key,kind:x.kind,text:x.text,
      }));
      const expected=plan.fields.map(([key,text])=>({key,kind:"text",text}))
        .sort((a,b)=>a.key.localeCompare(b.key,"en"));
      actual.sort((a,b)=>a.key.localeCompare(b.key,"en"));
      if(!same(actual,expected))issues.push("notion_extra_fields_mismatch");
    } else if(record.notion_revision) {
      issues.push("notion_fields_not_comparable");
    }
    if(issues.length)blocked++;else matching++;
    results.push({id,issues});
  }
  const summary=summarizeDirectoryStep3Issues(results);
  return {
    activeProfilesChecked:results.length,
    comparableCurrentD1:comparable,
    exactFieldMatches:matching,
    needsReview:blocked,
    issues:summary,
    legacyDisplayStorage,
    // This audit proves only these selected stored fields, not all writers.
    safeToMarkVerified:false,
    safeToSwitchRuntime:false,
    audited:"services, thumbnail/detail image display, technical lists, Notion extras",
  };
}
