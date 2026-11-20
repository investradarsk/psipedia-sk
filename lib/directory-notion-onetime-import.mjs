/**
 * One-time Notion -> canonical D1 input mapping.
 * No historical JSON is used as an editorial source.
 * Empty/missing Notion fields are never guessed to be human deletions.
 * Excludes partner/review-locked profiles, status/slug, catalog V3,
 * verified Google geo, and galleries absent from the Notion schema.
 */
import { CATEGORIES, FACT_LABELS, FILTER_NAMES } from "../scripts/directory-0170-backfill-readonly.mjs";

export const CATEGORY_LABELS = Object.freeze({
  "veterinari":"Veterinári","treneri":"Psí tréneri a psie školy",
  "kynologicke-kluby":"Kynologické kluby","chovatelske-kluby":"Chovateľské kluby",
  "chovatelske-stanice":"Chovateľské stanice","salony-a-sluzby":"Salóny",
  "hotely-a-opatrovanie":"Hotely a opatrovanie","vencenie":"Venčenie",
  "fyzioterapia":"Fyzioterapia","dalsie-sluzby":"Ďalšie služby",
});
export const COLUMN_PROPS = Object.freeze({
  name:"Názov",excerpt:"Perex",description:"Popis",
  region:"Kraj",district:"Okres",city:"Mesto",address:"Adresa",
  postal_code:"PSČ",street:"Ulica",house_number:"Číslo domu",
  price_note:"Cena / poznámka",website_url:"Web",public_phone:"Telefón",
  public_email:"E-mail",facebook_url:"Facebook",instagram_url:"Instagram",
  internal_email:"Interný e-mail",image_url:"Hlavný obrázok URL",
});
export const SEO_PROPS = Object.freeze({
  title:"SEO title",description:"SEO popis",focus_keyword:"SEO kľúčové slovo",
  canonical_url:"Canonical URL",og_title:"OG title",
  og_description:"OG popis",og_image_url:"OG obrázok",
});
export const QUALITY_PROPS = Object.freeze({
  phone:"Kvalita · Telefón",email:"Kvalita · E-mail",
  website:"Kvalita · Web",image:"Kvalita · Obrázok",address:"Kvalita · Adresa",
});
const QUALITY_NOTION = Object.freeze({
  "Nemá":"DOES_NOT_EXIST","Verejne nezverejnené":"NOT_PUBLIC",
  "Nevzťahuje sa":"NOT_APPLICABLE","Nedohľadateľné":"NOT_FOUND",
  DOES_NOT_EXIST:"DOES_NOT_EXIST", NOT_PUBLIC:"NOT_PUBLIC",
  NOT_APPLICABLE:"NOT_APPLICABLE",NOT_FOUND:"NOT_FOUND",
});
const GEO_COLUMNS = new Set(["region","district","city","address","postal_code","street","house_number"]);
const MAX_FIELD_LEN = 120000;
export function notionText(page,key) {
  const prop=page?.properties?.[key];
  if(!prop || typeof prop!=="object") return null;
  if(prop.type==="title" || prop.type==="rich_text"){
    const parts=prop[prop.type];
    if(!Array.isArray(parts)) return null;
    return parts.map(item=>item?.plain_text ?? item?.text?.content ?? "").join("");
  }
  if(prop.type==="url") return prop.url ?? "";
  if(prop.type==="select") return prop.select?.name ?? "";
  if(prop.type==="status") return prop.status?.name ?? "";
  if(prop.type==="date") return prop.date?.start ?? "";
  return null;
}
export function notionCheckbox(page,key){
  const p=page?.properties?.[key];
  return p?.type==="checkbox"&&typeof p.checkbox==="boolean"?p.checkbox:null;
}
export function notionMulti(page,key){
  const p=page?.properties?.[key];
  return p?.type==="multi_select"&&Array.isArray(p.multi_select)
    ?p.multi_select.map(x=>x?.name):null;
}
export function notionId(page){
  const s=notionText(page,"Psipedia ID")?.trim()??"";
  if(!/^[1-9][0-9]{0,9}$/.test(s))return null;
  const n=Number(s);return Number.isSafeInteger(n)?n:null;
}
const normalizedId=s=>String(s??"").replaceAll("-","").toLowerCase();
const limit=s=>typeof s==="string"&&s.length<=MAX_FIELD_LEN;
const unique=a=>[...new Set(a)];
export function planNotionDirectoryImport(page,row,sourceId){
  if(page?.archived||page?.in_trash)return {ok:false,reason:"notion_archived"};
  if(!row||notionId(page)!==Number(row.id))return {ok:false,reason:"id_not_mapped"};
  if(normalizedId(page.id)!==normalizedId(row.notion_page_id) ||
     normalizedId(page.parent?.data_source_id)!==normalizedId(sourceId))
    return {ok:false,reason:"wrong_notion_page"};
  if(!CATEGORIES.includes(row.category)||notionText(page,"Kategória")?.trim()!==row.category)
    return {ok:false,reason:"category_mismatch"};
  if(row.status==="archived")return {ok:false,reason:"archived"};
  if(Number(row.partner_active)>0||Number(row.sql_review_locked)>0||
     Number(row.legacy_review_locked)>0||Number(row.tombstone)>0||
     notionCheckbox(page,"Odkontrolované")!==false)
    return {ok:false,reason:"protected_owner_or_review"};
  const fields={};const issues=[];
  for(const [column,prop] of Object.entries(COLUMN_PROPS)){
    const v=notionText(page,prop);
    if(v===null){issues.push("missing:"+prop);continue;}
    if(!limit(v)){issues.push("oversized:"+prop);continue;}
    if(GEO_COLUMNS.has(column)&&Number(row.confirmed_google)>0)continue;
    if(v.trim()&&v!==row[column])fields[column]=v;
    // A blank Notion cell is never inferred to be an intentional clear.
  }
  const qualifications=notionText(page,"Kvalifikácie");
  const q=qualifications&&limit(qualifications)
    ?unique(qualifications.split(/\r?\n/).map(v=>v.trim()).filter(Boolean)):null;
  if(qualifications&&!limit(qualifications))issues.push("oversized:Kvalifikácie");
  const hours=notionText(page,"Ordinačné hodiny");
  const hoursText=hours&&limit(hours)?hours.trim():null;
  if(hours&&!limit(hours))issues.push("oversized:Ordinačné hodiny");
  const seo={};
  for(const [col,prop] of Object.entries(SEO_PROPS)){
    const v=notionText(page,prop);
    if(v?.trim()&&limit(v))seo[col]=v;
    else if(v&&!limit(v))issues.push("oversized:"+prop);
  }
  const noindex=notionCheckbox(page,"Noindex");
  const categories=notionMulti(page,"Ďalšie kategórie");
  const secondary=[];
  if(categories!==null){
    for(const raw of categories){
      const slug=Object.keys(CATEGORY_LABELS).find(s=>CATEGORY_LABELS[s]===raw||s===raw);
      if(!slug||slug===row.category)issues.push("invalid:Ďalšie kategórie");
      else secondary.push(slug);
    }
  } else issues.push("missing:Ďalšie kategórie");
  const facts=[];
  const factLabels=unique([...(FACT_LABELS[row.category]??[]),"Pokrytie"]).filter(x=>x!=="Ordinačné hodiny");
  for(const key of factLabels){
    const v=notionText(page,key);
    if(v?.trim()&&limit(v))facts.push({key,value:v});
    else if(v&&!limit(v))issues.push("oversized:fact");
  }
  const filters=[];
  for(const item of FILTER_NAMES[row.category]??[]){
    const id=row.category+"."+item;
    const prop="Filter · "+id;
    const value=notionText(page,prop);
    if(!value)continue;
    const normalized={"Áno":"yes","Nie":"no","Neznáme":"unknown"}[value]??value;
    if(["yes","no","unknown","ambulance","clinic","hospital"].includes(normalized))
      filters.push({id,category:row.category,value:normalized});
    else issues.push("invalid:Filter");
  }
  const quality=[];
  const checkedAt=notionText(page,"Kvalita skontrolované");
  if(checkedAt&&Date.parse(checkedAt)){
    for(const [key,prop] of Object.entries(QUALITY_PROPS)){
      const status=QUALITY_NOTION[notionText(page,prop)??""];
      if(status)quality.push({field:key,status,checkedAt});
    }
  }
  // We may never fabricate a service-V3 choice from free-text "Služby".
  // There is no gallery property in this Notion source; preserve existing SQL.
  return {ok:true,id:row.id,pageId:page.id,expectedUpdatedAt:row.updated_at,
    category:row.category,fields,qualifications:q,hoursText,seo,noindex,
    secondary:categories!==null?unique(secondary):null,facts,filters,quality,
    issues:unique(issues)};
}
