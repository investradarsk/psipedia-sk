/**
 * Plemená 3/6. D1 mirror writes only: old JSON remains the public read source.
 *
 * Every statement returned here must be included in the SAME D1.batch as the
 * authenticated legacy compare-and-swap. Never execute as a second batch.
 * Column/table identifiers only come from a reviewed allowlist.
 */
import {BREED_ADDITIONAL_CANONICAL_SQL_FIELDS as SQL_FIELDS} from "./breed-storage-decision.mjs";
import {BREED_SQL_V2_PUBLIC_KEYS,planBreedSqlV2FieldWrite} from "./breed-sql-v2-bridge.mjs";

export function breedSqlV2ShadowEnabled(bindings){
  return bindings?.BREED_SQL_V2_WRITE_MODE==="shadow";
}
const q=n=>Array.from({length:n},()=>"?").join(",");
const guard=database=>database.prepare(
  "SELECT CASE WHEN changes()=1 THEN 1 ELSE json_extract('BREED_SQL_V2_CAS_FAILED','$') END AS guard"
);
const object=v=>v&&typeof v==="object"&&!Array.isArray(v)?v:{};
const cell=(obj,key)=>{
  const x=obj[key];return x===undefined?null:x;
};
function tableUpsert(database,table,columns,values,id){
  if(!Number.isSafeInteger(id)||id<1)throw Error("BREED_V2_ID_INVALID");
  if(columns.length!==values.length)throw Error("BREED_V2_COLUMNS_INVALID");
  const names=["breed_id",...columns];
  const updates=columns.map(col=>col+"=excluded."+col).join(",");
  return database.prepare(
    "INSERT INTO "+table+" ("+names.join(",")+") VALUES ("+q(names.length)+") "+
    "ON CONFLICT(breed_id) DO UPDATE SET "+updates
  ).bind(id,...values);
}
export function breedSqlV2FullSnapshotStatements(database,id,raw){
  const breed=object(raw);
  const fci=object(breed.fciStandard);
  const editorial=object(breed.editorial);
  const seo=object(breed.seo);
  const fciCols=SQL_FIELDS.breed_fci_standard;
  const editKeys=BREED_SQL_V2_PUBLIC_KEYS.editorial;
  const editCols=editKeys.map(key=>{
    const plan=planBreedSqlV2FieldWrite("editorial."+key,
      key==="heroTraits"?(Array.isArray(editorial[key])?editorial[key]:[]):String(cell(editorial,key)??""));
    if(!plan||plan.table!=="breed_editorial_text")throw Error("BREED_V2_EDITORIAL_ROUTE_INVALID");
    return plan.column;
  });
  const editValues=editKeys.map(key=>key==="heroTraits"
    ?JSON.stringify(Array.isArray(editorial[key])?editorial[key]:[])
    :cell(editorial,key));
  const seoCols=BREED_SQL_V2_PUBLIC_KEYS.seo.map(key=>{
    const probe=planBreedSqlV2FieldWrite("seo."+key,
      key==="noindex"?false:"");
    if(!probe||probe.table!=="managed_breeds")throw Error("BREED_V2_SEO_ROUTE_INVALID");
    return probe.column;
  });
  const seoValues=BREED_SQL_V2_PUBLIC_KEYS.seo.map(key=>
    key==="noindex"?(typeof seo.noindex==="boolean"?(seo.noindex?1:0):null):cell(seo,key));
  const relations=Array.isArray(breed.relatedBreedIds)?breed.relatedBreedIds:[];
  if(new Set(relations).size!==relations.length||
    relations.some(other=>!Number.isSafeInteger(other)||other<1||other===id))
    throw Error("BREED_V2_RELATED_INVALID");
  const statements=[
    tableUpsert(database,"breed_fci_standard",fciCols,
      fciCols.map(col=>cell(fci,col.slice(4))),id),
    tableUpsert(database,"breed_editorial_text",editCols,editValues,id),
    database.prepare("UPDATE managed_breeds SET "+
      seoCols.map(col=>col+"=?").join(",")+" WHERE id=?").bind(...seoValues,id),
    guard(database),
    database.prepare("DELETE FROM breed_related_breeds WHERE breed_id=?").bind(id),
    ...relations.map((other,i)=>database.prepare(
      "INSERT INTO breed_related_breeds (breed_id,related_breed_id,position) VALUES (?,?,?)"
    ).bind(id,other,i)),
  ];
  return statements;
}
/**
 * A direct Notion/Admin dirty edit updates exactly one new SQL cell.
 * CAS of the legacy row MUST appear immediately before these statements.
 */
export function breedSqlV2DirectFieldStatements(database,id,field,value){
  const plan=planBreedSqlV2FieldWrite(field,value);
  if(!plan||plan.kind==="relations")return [];
  if(plan.kind==="column")return [
    database.prepare("UPDATE managed_breeds SET "+plan.column+"=? WHERE id=?")
      .bind(plan.stored,id),guard(database),
  ];
  return [
    database.prepare("UPDATE "+plan.table+" SET "+plan.column+"=? WHERE breed_id=?")
      .bind(plan.stored,id),guard(database),
  ];
}
/**
 * Controls: null selects do not erase existing legacy FCI/group/size scalar
 * (historical non-null classification). Numeric nulls DO clear their facts.
 * The calling batch must guard the sidecar revision before this executor.
 */
export function breedSqlV2ControlledStatements(database,id,changes){
  const results=[];
  for(const [key,v] of Object.entries(changes)){
    const value=key==="fciGroupSelect"&&v!==null?Number(v):v;
    if(["fciGroupSelect","fciSectionSelect","sizeSelect"].includes(key)&&v===null)
      continue;
    const statements=breedSqlV2DirectFieldStatements(database,id,"controlled."+key,value);
    if(statements.length!==2)throw Error("BREED_V2_CONTROLLED_ROUTE_INVALID");
    results.push(...statements);
  }
  return results;
}
export function breedSqlV2CasGuard(database){return guard(database)}
