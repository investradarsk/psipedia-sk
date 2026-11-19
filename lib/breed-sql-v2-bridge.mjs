/**
 * Plemená 4/6: ONE allowlisted SQL/JSON v2 routing contract.
 *
 * This module constructs projections and write PLANS only. It never writes D1.
 * Production must NOT use v2 as a reader/writer until migrations, complete
 * backfill, per-field shadow-writes and parity are validated (steps 5–6).
 */
import {
  BREED_ADDITIONAL_CANONICAL_SQL_FIELDS as SQL_FIELDS,
} from "./breed-storage-decision.mjs";

const allow = new Map();
const editable = {
  editorial: {
    overview:"overview", coatCare:"coat_care", familyLife:"family_life",
    otherDogsLife:"other_dogs_life", curiosities:"curiosities",
    commonOwnerMistakes:"common_owner_mistakes",
  },
  seo: {
    title:"seo_title",description:"seo_description",
    focusKeyword:"seo_focus_keyword",canonicalUrl:"seo_canonical_url",
    ogTitle:"seo_og_title",ogDescription:"seo_og_description",ogImage:"seo_og_image",
    noindex:"seo_noindex",
  },
};
for(const field of SQL_FIELDS.breed_fci_standard) {
  // fci_fci_nomenklatura_url is intentional: the FCI key itself has a fci_ prefix.
  const key=field.slice(4);
  allow.set("fciStandard."+key, {table:"breed_fci_standard",column:field,type:"text"});
}
for(const [key,col] of Object.entries(editable.editorial))
  allow.set("editorial."+key,{table:"breed_editorial_text",column:col,type:"text"});
for(const [key,col] of Object.entries(editable.seo))
  allow.set("seo."+key,{table:"managed_breeds",column:col,type:key==="noindex"?"boolean":"text"});
const controlled={
  fciGroupSelect:{table:"managed_breeds",column:"fci_group",type:"integer"},
  fciSectionSelect:{table:"managed_breeds",column:"fci_section_number",type:"text"},
  sizeSelect:{table:"managed_breeds",column:"size",type:"text"},
  heightMinCm:{table:"breed_public_facts",column:"height_min_cm",type:"number"},
  heightMaxCm:{table:"breed_public_facts",column:"height_max_cm",type:"number"},
  weightMinKg:{table:"breed_public_facts",column:"weight_min_kg",type:"number"},
  weightMaxKg:{table:"breed_public_facts",column:"weight_max_kg",type:"number"},
  lifespanMinYears:{table:"breed_public_facts",column:"lifespan_min_years",type:"number"},
  lifespanMaxYears:{table:"breed_public_facts",column:"lifespan_max_years",type:"number"},
  originCountries:{table:"breed_public_facts",column:"origin_countries_json",type:"string-list"},
  coatTypes:{table:"breed_public_facts",column:"coat_types_json",type:"string-list"},
  useTypes:{table:"breed_public_facts",column:"use_types_json",type:"string-list"},
};
for(const [key,target] of Object.entries(controlled)) allow.set("controlled."+key,target);
for(const [key,col] of Object.entries({
  gallery:"gallery_json",sports:"sports_json",
  healthRisks:"health_risks_json",goodFor:"good_for_json",
  consider:"consider_json",sources:"sources_json",
})) allow.set(key,{table:"managed_breeds",column:col,type:"list"});

const validTables=new Set(["breed_fci_standard","breed_editorial_text","breed_public_facts","managed_breeds"]);
function normalized(type,value){
  if(value===null){
    if(type==="text"||type==="number"||type==="boolean"||type==="string-list")return null;
    throw Error("BREED_SQL_V2_NULL_LIST_INVALID");
  }
  if(type==="text"&&typeof value==="string")return value;
  if(type==="number"&&typeof value==="number"&&Number.isFinite(value))return value;
  if(type==="integer"&&Number.isSafeInteger(value))return value;
  if(type==="boolean"&&typeof value==="boolean")return value?1:0;
  if(type==="list"&&Array.isArray(value))return JSON.stringify(value);
  if(type==="string-list"&&Array.isArray(value)&&value.every(x=>typeof x==="string")&&
      value.length===new Set(value).size) return JSON.stringify(value);
  throw Error("BREED_SQL_V2_INVALID_VALUE_"+type);
}
/** Immutable description. Execute only after a guarded 0174 + LWW cutover. */
export function planBreedSqlV2FieldWrite(field,value){
  if(field==="relatedBreedIds"){
    if(!Array.isArray(value)||!value.every(x=>Number.isSafeInteger(x)&&x>0)||
      new Set(value).size!==value.length)
      throw Error("BREED_SQL_V2_INVALID_RELATIONS");
    return {kind:"relations",table:"breed_related_breeds",ids:[...value]};
  }
  const target=allow.get(field);
  if(!target)return null; // Unsupported legacy/structural field – do not guess.
  if(!validTables.has(target.table))throw Error("BREED_SQL_V2_UNKNOWN_DESTINATION");
  const stored=normalized(target.type,value);
  // No dynamic names are derived from untrusted input; only allowlisted targets.
  return {
    kind:target.table==="managed_breeds"?"column":"one-to-one",
    table:target.table,column:target.column,stored,
    ...(target.type==="string-list"||target.type==="list"?{format:"json-array"}:{}),
  };
}
/** Only the explicit literal value "compare" activates any v2 D1 read. */
export function breedSqlV2CompareEnabled(bindings){
  return bindings?.BREED_SQL_V2_COMPARE_MODE==="compare";
}
export const BREED_SQL_V2_PUBLIC_KEYS=Object.freeze({
  fciStandard: Object.freeze(SQL_FIELDS.breed_fci_standard.map(c=>c.slice(4))),
  editorial:Object.freeze(Object.keys(editable.editorial)),
  seo:Object.freeze(Object.keys(editable.seo)),
});
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function parseLegacyObject(value){
  try{const parsed=JSON.parse(value??"{}");return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{}}
  catch{return {}}
}
function parseLegacyArray(value){
  try{const parsed=JSON.parse(value??"[]");return Array.isArray(parsed)?parsed:[]}
  catch{return []}
}
/**
 * Read-only comparison: evaluate only populated SQL fields. A NULL slot is
 * UNMIGRATED, not an empty verified value. Never return replacements for public
 * HTML or the editor during step 4.
 */
export function compareBreedSqlV2Rows(legacy,rows){
  if(!legacy||!Number.isSafeInteger(legacy.id))throw Error("BREED_SQL_V2_BREED_REQUIRED");
  const stats={breedId:legacy.id,checked:0,matching:0,different:0,
    unfilled:0,missingRows:0,legacyOnly:0};
  const check=(value,old)=>{
    if(value===null||value===undefined){stats.unfilled++;return}
    stats.checked++;
    if(same(value,old))stats.matching++;else stats.different++;
  };
  const group=[
    {row:rows.fci,keys:BREED_SQL_V2_PUBLIC_KEYS.fciStandard,
      legacy:parseLegacyObject(legacy.fci_standard_json),
      keyToColumn:key=>"fci_"+key},
    {row:rows.editorial,keys:BREED_SQL_V2_PUBLIC_KEYS.editorial,
      legacy:parseLegacyObject(legacy.editorial_json),
      keyToColumn:key=>editable.editorial[key]},
    {row:rows.seo,keys:BREED_SQL_V2_PUBLIC_KEYS.seo,
      legacy:parseLegacyObject(legacy.seo_json),
      keyToColumn:key=>editable.seo[key]},
  ];
  for(const item of group){
    if(!item.row){stats.missingRows++;continue}
    for(const key of item.keys){
      const stored=item.row[item.keyToColumn(key)];
      const old=key==="noindex"?(item.legacy[key]===true?1:0):
        item.legacy[key]===undefined?"":item.legacy[key];
      check(stored,old);
    }
  }
  if(rows.related){
    const original=parseLegacyArray(legacy.related_breeds_json);
    const edges=rows.related.map(x=>Number(x.related_breed_id));
    if(edges.length||original.length){stats.checked++;same(edges,original)?stats.matching++:stats.different++}
  } else stats.missingRows++;
  return stats;
}
export function summarizeBreedSqlV2Write(field,value){
  const plan=planBreedSqlV2FieldWrite(field,value);
  return plan?{field,kind:plan.kind,table:plan.table,column:plan.column??null}:null;
}
// This file intentionally has no UPDATE, INSERT or DELETE executor.
