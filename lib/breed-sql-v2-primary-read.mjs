/**
 * Plemená: SQL-primary read projections.
 *
 * Existing public and Admin domain types still accept their historic JSON
 * object shapes. These expressions CONSTRUCT those shapes from canonical SQL
 * columns at query time; they never read old stored *_json document columns.
 * Gallery/sports/health-risk arrays are deliberately separate canonical JSON
 * arrays and are not removed in this migration.
 */
import {BREED_SQL_V2_PUBLIC_KEYS,planBreedSqlV2FieldWrite} from "./breed-sql-v2-bridge.mjs";
export const breedSqlPrimaryEnabled=bindings=>
  bindings?.BREED_SQL_V2_READ_MODE==="sql";

const quoted=v=>"'"+v.replaceAll("'","''")+"'";
function jsonObject(pairs){
  return "json_object("+pairs.map(([key,value])=>quoted(key)+","+value).join(",")+")";
}
const fciPairs=BREED_SQL_V2_PUBLIC_KEYS.fciStandard.map(key=>{
  const column=planBreedSqlV2FieldWrite("fciStandard."+key,"")?.column;
  if(!column)throw Error("BREED_V2_FCI_READ_MAPPING_MISSING_"+key);
  return [key,"COALESCE(f."+column+",'')"];
});
const editPairs=BREED_SQL_V2_PUBLIC_KEYS.editorial.map(key=>{
  const plan=planBreedSqlV2FieldWrite("editorial."+key,key==="heroTraits"?[]:"");
  if(!plan?.column)throw Error("BREED_V2_EDITORIAL_READ_MAPPING_MISSING_"+key);
  return [key,key==="heroTraits"
    ?"json(COALESCE(e."+plan.column+",'[]'))"
    :"COALESCE(e."+plan.column+",'')"];
});
const seoPairs=BREED_SQL_V2_PUBLIC_KEYS.seo.map(key=>{
  const plan=planBreedSqlV2FieldWrite("seo."+key,key==="noindex"?false:"");
  if(!plan?.column)throw Error("BREED_V2_SEO_READ_MAPPING_MISSING_"+key);
  return [key,key==="noindex"
    ?"CASE WHEN managed_breeds.seo_noindex=1 THEN json('true') ELSE json('false') END"
    :"COALESCE(managed_breeds."+plan.column+",'')"];
});
export const BREED_SQL_V2_READ_EXPRESSIONS=Object.freeze({
  fci_standard_json:"COALESCE((SELECT "+jsonObject(fciPairs)+
    " FROM breed_fci_standard f WHERE f.breed_id=managed_breeds.id),'{}')",
  editorial_json:"COALESCE((SELECT "+jsonObject(editPairs)+
    " FROM breed_editorial_text e WHERE e.breed_id=managed_breeds.id),'{}')",
  seo_json:jsonObject(seoPairs),
  related_breeds_json:"COALESCE((SELECT json_group_array(ordered.related_breed_id) "+
    "FROM (SELECT related_breed_id FROM breed_related_breeds WHERE "+
    "breed_id=managed_breeds.id ORDER BY position) ordered),'[]')",
});
/**
 * Only use for explicitly projected, unaliased managed_breeds read SELECTs.
 * Does NOT rewrite the WHERE clause, scalar column writes, or arbitrary SQL.
 */
export function breedSqlPrimaryProjection(sql){
  if(typeof sql!=="string"||!/^\s*SELECT\b/i.test(sql)||
    !/\bFROM managed_breeds\b/i.test(sql))
    throw Error("BREED_V2_PRIMARY_READ_REQUIRES_MANAGED_SELECT");
  const from=sql.search(/\bFROM managed_breeds\b/i);
  const head=sql.slice(0,from),tail=sql.slice(from);
  if(/\b(?:fci_standard_json|editorial_json|seo_json|related_breeds_json)\b/.test(tail))
    throw Error("BREED_V2_PRIMARY_READ_LEGACY_PREDICATE_FORBIDDEN");
  let projected=head;
  for(const [key,expr] of Object.entries(BREED_SQL_V2_READ_EXPRESSIONS)){
    const pattern=new RegExp("\\b"+key+"\\b","g");
    projected=projected.replace(pattern,expr+" AS "+key);
  }
  return projected+tail;
}
