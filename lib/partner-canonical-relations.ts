/**
 * Public structured directory fields: SQL relations are authoritative, with a
 * bounded same-batch compatibility projection for pages awaiting SQL-read cutover.
 * No external JSON file, schema change or unguarded cross-profile write.
 */
import { directoryFilterRegistry,serviceFilterCategories,type ServiceFilterCategory } from "./directory-filter-contract";
import { planDirectory0170FilterSqlMirror,planDirectory0170FactSqlMirror,approvedDirectoryFactSqlSlot } from "./directory-0170-editorial-sql-mirror";
import { planDirectorySecondaryCategorySqlMirror } from "./directory-secondary-category-sql";
import { planDirectoryStep3PresentationSqlMirror } from "./directory-sql-step3-live-mirror";
import { planDirectory0173EditorialSqlMirror } from "./directory-0173-editorial-sql-mirror";
import { normalizeAdditionalDirectoryCategories } from "./directory-multi-category";
import { normalizeProfileGalleryUrls } from "./partner-profile-gallery";
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
    if(additional.length>0&&!(serviceFilterCategories as readonly string[]).includes(category))
      throw new Error("Ďalšie kategórie nie sú pre tento typ profilu dostupné.");
    const statements=(serviceFilterCategories as readonly string[]).includes(category)
      ?planDirectorySecondaryCategorySqlMirror({
        profileId:id,primaryCategory:category,submitted:additional,updatedAt:nowIso,actor,
      }):[];
    for(const statement of statements.slice(1))plans.push(sql(db,statement));
  }
  if(Object.hasOwn(data,"services")){
    for(const item of planDirectoryStep3PresentationSqlMirror({
      identity:{kind:"id",profileId:id,updatedAt:nowIso,actor},
      services:data.services as string[],
    }))plans.push(sql(db,item));
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
  }
  return plans;
}
export async function readPartnerDraftRelations(input:{
  db:D1Database;type:PartnerCanonicalType;id:number;category?:string
}){
  const {db,type,id}=input,values:Record<string,Allowed>={};
  if(type!=="DIRECTORY_PROFILE"&&type!=="HELP_ORGANIZATION")return values;
  if(type==="HELP_ORGANIZATION"){
    // Help organizations have their own independent storage lifecycle.
    const row=await db.prepare("SELECT source_data_json source FROM help_organizations WHERE id=?")
      .bind(id).first<{source:string|null}>();
    try{
      const raw=JSON.parse(row?.source??"{}") as Record<string,unknown>;
      const gallery=JSON.parse(String(raw?._psipedia_profile_gallery_urls??"[]"));
      values.galleryUrls=Array.isArray(gallery)?gallery.filter((v):v is string=>typeof v==="string"):[];
    }catch{values.galleryUrls=[];}
    return values;
  }
  // Directory relations are SQL-only. A missing migration is a real error,
  // not permission to surface an obsolete JSON fallback.
  const category=input.category??"";
  const [additional,gallery,hours,filters,services,qualifications]=await Promise.all([
    db.prepare("SELECT category FROM directory_profile_additional_categories WHERE profile_id=? ORDER BY category")
      .bind(id).all<{category:string}>(),
    db.prepare("SELECT image_url url FROM directory_profile_media WHERE profile_id=? ORDER BY item_order")
      .bind(id).all<{url:string}>(),
    db.prepare("SELECT hours_text hours FROM directory_profile_opening_hours WHERE profile_id=? ORDER BY day_of_week")
      .bind(id).all<{hours:string}>(),
    db.prepare("SELECT filter_id id,value_text val FROM directory_profile_filter_values WHERE profile_id=?")
      .bind(id).all<{id:string;val:string}>(),
    db.prepare("SELECT service_text value FROM directory_profile_service_texts WHERE profile_id=? ORDER BY item_order")
      .bind(id).all<{value:string}>(),
    db.prepare("SELECT qualification_text value FROM directory_profile_qualifications WHERE profile_id=? ORDER BY item_order")
      .bind(id).all<{value:string}>(),
  ]);
  values.services=services.results.map(x=>x.value);
  values.qualifications=qualifications.results.map(x=>x.value);
  values.additionalCategories=additional.results.map(x=>x.category);
  values.galleryUrls=gallery.results.map(x=>x.url);
  values.openingHours=hours.results.map(x=>x.hours).join("\n");
  for(const filter of filters.results)
    if(directoryFilterRegistry.some(def=>def.id===filter.id&&def.category===category))
      values[filter.id]=filter.val;
  return values;
}
