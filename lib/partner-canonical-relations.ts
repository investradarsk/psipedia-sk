/**
 * Public structured directory fields: SQL relations are authoritative, with a
 * bounded same-batch compatibility projection for pages awaiting SQL-read cutover.
 * No external JSON file, schema change or unguarded cross-profile write.
 */
import { directoryFilterRegistry,serviceFilterCategories,type ServiceFilterCategory } from "./directory-filter-contract";
import { planDirectory0170FilterSqlMirror,planDirectory0170FactSqlMirror,approvedDirectoryFactSqlSlot } from "./directory-0170-editorial-sql-mirror";
import { planDirectorySecondaryCategorySqlMirror } from "./directory-secondary-category-sql";
import { planDirectory0173EditorialSqlMirror } from "./directory-0173-editorial-sql-mirror";
import { normalizeAdditionalDirectoryCategories } from "./directory-multi-category";
import { normalizeProfileGalleryUrls } from "./partner-profile-gallery";
import { DIRECTORY_BREEDER_GALLERY_KEY } from "./directory-breeder-gallery";
import type { PartnerCanonicalType } from "./partner-canonical-workflow";

type Allowed=string|number|null|boolean|string[];
type Input={db:D1Database;type:PartnerCanonicalType;id:number;data:Record<string,unknown>;nowIso:string;actor:string;
  category:string};
const sql=(db:D1Database,statement:{sql:string;bindings:readonly (string|number)[]})=>
  db.prepare(statement.sql).bind(...statement.bindings);

export function buildPartnerDraftRelationStatements(input:Input):D1PreparedStatement[]{
  const {db,type,id,data,nowIso,actor,category}=input,plans:D1PreparedStatement[]=[];
  if(type==="HELP_ORGANIZATION"&&Object.hasOwn(data,"galleryUrls")){
    const gallery=normalizeProfileGalleryUrls(data.galleryUrls);
    plans.push(db.prepare("UPDATE help_organizations SET source_data_json=json_set("+
      "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END,"+
      "'$._psipedia_profile_gallery_urls',?) WHERE id=? AND updated_at=?")
      .bind(JSON.stringify(gallery),id,nowIso));
  }
  if(type!=="DIRECTORY_PROFILE")return plans;
  const add=Object.hasOwn(data,"additionalCategories");
  if(add){
    const additional=normalizeAdditionalDirectoryCategories(data.additionalCategories,category);
    const statements=planDirectorySecondaryCategorySqlMirror({
      profileId:id,primaryCategory:category,submitted:additional,updatedAt:nowIso,actor,
    });
    for(const statement of statements.slice(1))plans.push(sql(db,statement));
    plans.push(db.prepare("UPDATE directory_profiles SET source_data_json=json_set("+
      "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END,"+
      "'$._psipedia_additional_categories',?,'$._psipedia_additional_categories_sql_confirmed','1') "+
      "WHERE id=? AND updated_at=?").bind(JSON.stringify(additional),id,nowIso));
  }
  const hours=Object.hasOwn(data,"openingHours")?String(data.openingHours??""):undefined;
  const gallery=Object.hasOwn(data,"galleryUrls")?normalizeProfileGalleryUrls(data.galleryUrls):undefined;
  const qualifications=Object.hasOwn(data,"qualifications")?data.qualifications as string[]:undefined;
  if(hours!==undefined||gallery!==undefined||qualifications!==undefined){
    for(const item of planDirectory0173EditorialSqlMirror({
      identity:{kind:"id",profileId:id,updatedAt:nowIso,actor},
      ...(hours!==undefined?{openingHoursText:hours}:{}),
      ...(gallery!==undefined?{galleryUrls:gallery}:{}),
      ...(qualifications!==undefined?{qualifications}:{}),
    }))plans.push(sql(db,item));
    if(hours!==undefined){
      plans.push(db.prepare("UPDATE directory_profiles SET source_data_json=json_set("+
        "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END,"+
        "'$.\"Ordinačné hodiny\"',?) WHERE id=? AND updated_at=?")
        .bind(hours,id,nowIso));
    }
    if(gallery!==undefined){
      const key=category==="chovatelske-stanice"?DIRECTORY_BREEDER_GALLERY_KEY:"_psipedia_profile_gallery_urls";
      plans.push(db.prepare("UPDATE directory_profiles SET source_data_json=json_set("+
        "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END,"+
        "'$.\""+key+"\"',?) WHERE id=? AND updated_at=?")
        .bind(JSON.stringify(gallery),id,nowIso));
    }
  }
  const facets=Object.entries(data).filter(([key])=>directoryFilterRegistry.some(f=>f.id===key));
  if(facets.length){
    if(!(serviceFilterCategories as readonly string[]).includes(category))
      throw new Error("Neplatná hlavná kategória filtrov.");
    const selections:Record<string,string|null>={};
    for(const [key,value] of facets){
      const def=directoryFilterRegistry.find(f=>f.id===key);
      if(def?.category!==category)throw new Error("Filter nepatrí vybranej kategórii.");
      selections[key]=value===""?null:String(value);
    }
    for(const item of planDirectory0170FilterSqlMirror({
      profileId:id,category:category as ServiceFilterCategory,values:selections,updatedAt:nowIso,actor,
    }).slice(1))plans.push(sql(db,item));
    for(const [key,value] of facets){
      const def=directoryFilterRegistry.find(f=>f.id===key)!;
      plans.push(db.prepare("UPDATE directory_profiles SET source_data_json=json_set("+
        "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END,?,?) "+
        "WHERE id=? AND updated_at=?")
        .bind('$."'+def.d1.key+'"',value||null,id,nowIso));
    }
  }
  return plans;
}
export async function readPartnerDraftRelations(input:{db:D1Database;type:PartnerCanonicalType;id:number;category?:string}){
  const {db,type,id}=input,values:Record<string,Allowed>={};
  if(type!=="DIRECTORY_PROFILE"&&type!=="HELP_ORGANIZATION")return values;
  const table=type==="DIRECTORY_PROFILE"?"directory_profiles":"help_organizations";
  const row=await db.prepare("SELECT source_data_json source FROM "+table+" WHERE id=?")
    .bind(id).first<{source:string|null}>();
  let source:Record<string,unknown>={};
  try{const x=JSON.parse(row?.source??"{}");if(x&&typeof x==="object"&&!Array.isArray(x))source=x;}catch{}
  const list=(key:string)=>{
    try{const v=JSON.parse(String(source[key]??"[]"));return Array.isArray(v)?v.filter((x):x is string=>typeof x==="string"):[];}catch{return [];}
  };
  if(type==="HELP_ORGANIZATION"){
    values.galleryUrls=list("_psipedia_profile_gallery_urls");
    return values;
  }
  // Public relations are SQL-first. Existing JSON is a compatibility fallback
  // only for installations not yet cut over to 0173.
  const category=input.category??"";
  try{
    const [additional,gallery,hours]=await Promise.all([
      db.prepare("SELECT category FROM directory_profile_additional_categories WHERE profile_id=? ORDER BY category").bind(id).all<{category:string}>(),
      db.prepare("SELECT image_url url FROM directory_profile_media WHERE profile_id=? ORDER BY item_order").bind(id).all<{url:string}>(),
      db.prepare("SELECT hours_text hours FROM directory_profile_opening_hours WHERE profile_id=? ORDER BY day_of_week").bind(id).all<{hours:string}>(),
    ]);
    values.additionalCategories=additional.results.map(x=>x.category);
    values.galleryUrls=gallery.results.map(x=>x.url);
    values.openingHours=hours.results.map(x=>x.hours).join("\n");
  }catch{
    values.additionalCategories=list("_psipedia_additional_categories");
    values.galleryUrls=list(category==="chovatelske-stanice"?DIRECTORY_BREEDER_GALLERY_KEY:"_psipedia_profile_gallery_urls");
    values.openingHours=String(source["Ordinačné hodiny"]??"");
  }
  try{
    const all=await db.prepare("SELECT filter_id id,value_text val FROM directory_profile_filter_values WHERE profile_id=?").bind(id)
      .all<{id:string;val:string}>();
    for(const f of all.results)if(directoryFilterRegistry.some(def=>def.id===f.id&&def.category===category))values[f.id]=f.val;
  }catch{}
  return values;
}
