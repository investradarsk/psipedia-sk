/**
 * Psipedia breeds step 5/6: additive *one-time* SQL backfill planner.
 *
 * All source values are read INSIDE SQL from the latest D1 rows at statement
 * execution time; no stale Notion export or JS snapshot can overwrite them.
 *
 * Caller MUST preflight 0174 physical schema, 347 D1 breeds, 344 ACTIVE
 * Notion links, 3 extra IDs, 344 synced controlled sidecars, no prior
 * destination rows and no concurrent writes during owner-dispatched APPLY.
 *
 * These statements ONLY populate new SQL 0174 slots, never touch legacy JSON,
 * its updated_at field or the Notion sync receipts. No public cutover.
 */
import {
  BREED_ADDITIONAL_CANONICAL_SQL_FIELDS as SQL_FIELDS,
  BREED_CANONICAL_JSON_FIELDS as JSON_FIELDS,
} from "./breed-storage-decision.mjs";

export const BREED_V2_COUNTS=Object.freeze({
  breeds:347,activeNotionLinks:344,unlinkedIds:Object.freeze([5,13,14]),
});
const textKeys=Object.freeze([
  ["title","seo_title"],["description","seo_description"],
  ["focusKeyword","seo_focus_keyword"],["canonicalUrl","seo_canonical_url"],
  ["ogTitle","seo_og_title"],["ogDescription","seo_og_description"],
  ["ogImage","seo_og_image"],
]);
const editorial=Object.freeze([
  ["overview","overview"],["coatCare","coat_care"],
  ["familyLife","family_life"],["otherDogsLife","other_dogs_life"],
  ["curiosities","curiosities"],["commonOwnerMistakes","common_owner_mistakes"],
]);
const controlledNums=Object.freeze([
  ["heightMinCm","height_min_cm"],["heightMaxCm","height_max_cm"],
  ["weightMinKg","weight_min_kg"],["weightMaxKg","weight_max_kg"],
  ["lifespanMinYears","lifespan_min_years"],
  ["lifespanMaxYears","lifespan_max_years"],
]);
const controlledLists=Object.freeze([
  ["originCountries","origin_countries_json"],
  ["coatTypes","coat_types_json"],["useTypes","use_types_json"],
]);
const q=key=>"'$."+key+"'";
const jsonText=(source,key)=>`CASE WHEN json_type(${source},${q(key)})='text' THEN json_extract(${source},${q(key)}) ELSE NULL END`;
const jsonNumber=(source,key)=>`CASE WHEN json_type(${source},${q(key)}) IN ('integer','real') THEN json_extract(${source},${q(key)}) ELSE NULL END`;
const jsonList=(source,key)=>`CASE WHEN json_type(${source},${q(key)})='array' THEN json_extract(${source},${q(key)}) ELSE NULL END`;
const columns=(m)=>m.map(x=>x[1]);
const insertSelect=(table,cols,expression,source,condition)=>`
INSERT OR IGNORE INTO ${table} (breed_id,${cols.join(",")})
SELECT ${source.id},${expression.join(",")}
FROM ${source.from}
WHERE ${condition};`.trim();

const fci=SQL_FIELDS.breed_fci_standard.map(col=>[col.slice(4),col]);
const seo=textKeys.map(([key,col])=>`${col}=${jsonText("seo_json",key)}`);
seo.push(`seo_noindex=CASE json_type(seo_json,'$.noindex')
  WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE NULL END`);

export const BREED_V2_BACKFILL_STATEMENTS=Object.freeze([
  // Null default retains "not provided". Text empty string preserves "cleared".
  insertSelect("breed_fci_standard",columns(fci),
    fci.map(([key])=>jsonText("m.fci_standard_json",key)),
    {id:"m.id",from:"managed_breeds m"},
    "json_valid(m.fci_standard_json)=1 AND json_type(m.fci_standard_json)='object'"),
  insertSelect("breed_editorial_text",columns(editorial),
    editorial.map(([key])=>jsonText("m.editorial_json",key)),
    {id:"m.id",from:"managed_breeds m"},
    "json_valid(m.editorial_json)=1 AND json_type(m.editorial_json)='object'"),
  // 344 typed controlled values originate from the existing Notion D1
  // mirror. No import is inferred for the remaining 3 unlinked breeds.
  insertSelect("breed_public_facts",
    [...columns(controlledNums),...columns(controlledLists)],
    [...controlledNums.map(([key])=>jsonNumber("c.values_json",key)),
     ...controlledLists.map(([key])=>jsonList("c.values_json",key))],
    {id:"c.breed_id",from:"breed_notion_controlled_values c JOIN breed_notion_workcopy_links l ON l.breed_id=c.breed_id AND l.status='ACTIVE'"},
    "json_valid(c.values_json)=1 AND json_type(c.values_json)='object'"),
  // Preserve explicit false (0) and OG image; do not mark omitted SEO
  // noindex as 0, because 0 has publication/SEO semantics.
  `UPDATE managed_breeds SET ${seo.join(",")}
    WHERE ${[...textKeys.map(x=>x[1]),"seo_noindex"].map(c=>c+" IS NULL").join(" AND ")}
      AND json_valid(seo_json)=1 AND json_type(seo_json)='object';`,
  // SQLite JSON array indices are the original 0-based display order.
  // Preflight requires no missing/cyclic/duplicate edges.
  `INSERT OR IGNORE INTO breed_related_breeds
    (breed_id,related_breed_id,position)
    SELECT m.id,CAST(j.value AS INTEGER),CAST(j.key AS INTEGER)
    FROM managed_breeds m CROSS JOIN json_each(m.related_breeds_json) AS j
    WHERE json_valid(m.related_breeds_json)=1
      AND json_type(m.related_breeds_json)='array'
      AND j.type='integer';`,
]);

export const BREED_V2_REQUIRED_TABLES=Object.freeze([
  "managed_breeds","breed_notion_workcopy_links",
  "breed_notion_controlled_values","breed_fci_standard",
  "breed_editorial_text","breed_public_facts","breed_related_breeds",
]);
export const BREED_V2_REQUIRED_COLUMNS=Object.freeze({
  managed_breeds:Object.freeze(["id","updated_at","fci_standard_json",
    "editorial_json","seo_json","related_breeds_json",
    ...textKeys.map(x=>x[1]),"seo_noindex"]),
  breed_fci_standard:Object.freeze(["breed_id",...columns(fci)]),
  breed_editorial_text:Object.freeze(["breed_id",...columns(editorial)]),
  breed_public_facts:Object.freeze(["breed_id",
    ...columns(controlledNums),...columns(controlledLists)]),
  breed_related_breeds:Object.freeze(["breed_id","related_breed_id","position"]),
  breed_notion_workcopy_links:Object.freeze(["breed_id","status","work_notion_page_id"]),
  breed_notion_controlled_values:Object.freeze(["breed_id","values_json","notion_values_json","revision"]),
});

export const BREED_V2_PREFLIGHT_SQL=Object.freeze({
  // Never fetch article bodies or Notion token to stdout.
  base:`SELECT COUNT(*) AS breed_count,
    SUM(CASE WHEN json_valid(fci_standard_json)=0 OR json_type(fci_standard_json)<>'object' THEN 1 ELSE 0 END) AS invalid_fci,
    SUM(CASE WHEN json_valid(editorial_json)=0 OR json_type(editorial_json)<>'object' THEN 1 ELSE 0 END) AS invalid_editorial,
    SUM(CASE WHEN json_valid(seo_json)=0 OR json_type(seo_json)<>'object' THEN 1 ELSE 0 END) AS invalid_seo,
    SUM(CASE WHEN json_valid(related_breeds_json)=0 OR json_type(related_breeds_json)<>'array' THEN 1 ELSE 0 END) AS invalid_relations
    FROM managed_breeds`,
  links:"SELECT COUNT(*) AS active_count,COUNT(DISTINCT breed_id) AS unique_breeds,COUNT(DISTINCT work_notion_page_id) AS unique_pages FROM breed_notion_workcopy_links WHERE status='ACTIVE'",
  extras:"SELECT b.id FROM managed_breeds b WHERE NOT EXISTS (SELECT 1 FROM breed_notion_workcopy_links l WHERE l.breed_id=b.id AND l.status='ACTIVE') ORDER BY b.id",
  controlled:`SELECT COUNT(*) AS sidecar_count,
    COALESCE(SUM(CASE WHEN json_valid(c.values_json)=0 OR json_type(c.values_json)<>'object' THEN 1 ELSE 0 END),0) AS invalid_values,
    COALESCE(SUM(CASE WHEN json_valid(c.notion_values_json)=0 OR json_type(c.notion_values_json)<>'object' THEN 1 ELSE 0 END),0) AS invalid_notion,
    COALESCE(SUM(CASE WHEN c.values_json<>c.notion_values_json THEN 1 ELSE 0 END),0) AS pending_sync
    FROM breed_notion_controlled_values c JOIN breed_notion_workcopy_links l ON l.breed_id=c.breed_id AND l.status='ACTIVE'`,
  orphanControlled:"SELECT COUNT(*) AS orphan_count FROM breed_notion_controlled_values c WHERE NOT EXISTS (SELECT 1 FROM breed_notion_workcopy_links l WHERE l.breed_id=c.breed_id AND l.status='ACTIVE')",
  destination:`SELECT
    (SELECT COUNT(*) FROM breed_fci_standard) AS fci_rows,
    (SELECT COUNT(*) FROM breed_editorial_text) AS editorial_rows,
    (SELECT COUNT(*) FROM breed_public_facts) AS fact_rows,
    (SELECT COUNT(*) FROM breed_related_breeds) AS related_rows,
    (SELECT COUNT(*) FROM managed_breeds WHERE ${[...textKeys.map(x=>x[1]),"seo_noindex"].map(x=>x+" IS NOT NULL").join(" OR ")}) AS migrated_seo_rows`,
  invalidEdges:`SELECT COUNT(*) AS invalid_edges
    FROM managed_breeds m CROSS JOIN json_each(m.related_breeds_json) j
    LEFT JOIN managed_breeds dest ON dest.id=j.value
    WHERE j.type<>'integer' OR CAST(j.value AS INTEGER)<=0
      OR dest.id IS NULL OR dest.id=m.id`,
  duplicateEdges:`SELECT COUNT(*) AS duplicate_edges FROM (
    SELECT m.id,j.value FROM managed_breeds m CROSS JOIN json_each(m.related_breeds_json) j
    GROUP BY m.id,j.value HAVING COUNT(*)>1
  )`,
  invalidFieldTypes:`SELECT COUNT(*) AS invalid_types FROM (
    SELECT j.type FROM managed_breeds m, json_each(m.fci_standard_json) j
      WHERE j.key IN (${fci.map(([k])=>"'"+k+"'").join(",")}) AND j.type NOT IN ('text','null')
    UNION ALL
    SELECT j.type FROM managed_breeds m, json_each(m.editorial_json) j
      WHERE j.key IN (${editorial.map(([k])=>"'"+k+"'").join(",")}) AND j.type NOT IN ('text','null')
    UNION ALL
    SELECT j.type FROM managed_breeds m, json_each(m.seo_json) j
      WHERE j.key IN (${textKeys.map(([k])=>"'"+k+"'").join(",")}) AND j.type NOT IN ('text','null')
    UNION ALL
    SELECT j.type FROM managed_breeds m, json_each(m.seo_json) j
      WHERE j.key='noindex' AND j.type NOT IN ('true','false','null')
  )`,
});

const count=(obj,key)=>Number(obj?.[key]);
function ensure(b,reason){if(!b)throw Error("BREED_V2_PREFLIGHT_"+reason)}

/**
 * Preflight result from read-only aggregate SQL only.
 * A false positive is safer than changing the last saved Admin field.
 */
export function assertBreedSqlV2BackfillPreflight(input){
  const {schema,base,links,extras,controlled,orphanControlled,
    destination,invalidEdges,duplicateEdges,invalidFieldTypes}=input??{};
  for(const [table,fields] of Object.entries(BREED_V2_REQUIRED_COLUMNS)){
    ensure(Array.isArray(schema?.[table])&&fields.every(col=>schema[table].includes(col)),
      "SCHEMA_MISMATCH_"+table);
  }
  ensure(count(base,"breed_count")===BREED_V2_COUNTS.breeds,"BREED_COUNT");
  for(const key of ["invalid_fci","invalid_editorial","invalid_seo","invalid_relations"])
    ensure(count(base,key)===0,"INVALID_SOURCE_"+key);
  ensure(count(links,"active_count")===BREED_V2_COUNTS.activeNotionLinks &&
    count(links,"unique_breeds")===BREED_V2_COUNTS.activeNotionLinks &&
    count(links,"unique_pages")===BREED_V2_COUNTS.activeNotionLinks,
    "NOTION_ACTIVE_LINKS");
  ensure(Array.isArray(extras)&&
    JSON.stringify(extras.map(x=>Number(x.id)).sort((a,b)=>a-b))===
    JSON.stringify([...BREED_V2_COUNTS.unlinkedIds].sort((a,b)=>a-b)),
    "UNLINKED_IDENTITIES");
  ensure(count(controlled,"sidecar_count")===BREED_V2_COUNTS.activeNotionLinks &&
    count(controlled,"invalid_values")===0 &&
    count(controlled,"invalid_notion")===0,"CONTROLLED_VALUES_INCOMPLETE");
  // Pending Notion updates must be reconciled before any future cutover.
  ensure(count(controlled,"pending_sync")===0,"NOTION_PENDING_SYNC");
  ensure(count(orphanControlled,"orphan_count")===0,"ORPHAN_CONTROLLED");
  for(const key of ["fci_rows","editorial_rows","fact_rows","related_rows","migrated_seo_rows"])
    ensure(count(destination,key)===0,"DESTINATION_NONEMPTY_"+key);
  ensure(count(invalidEdges,"invalid_edges")===0,"BROKEN_RELATIONS");
  ensure(count(duplicateEdges,"duplicate_edges")===0,"DUPLICATED_RELATIONS");
  ensure(count(invalidFieldTypes,"invalid_types")===0,"BAD_TYPES");
  return {ready:true,breedRows:347,activeNotionLinks:344,
    untouchedUnlinkedBreedIds:[...BREED_V2_COUNTS.unlinkedIds],
    statementCount:BREED_V2_BACKFILL_STATEMENTS.length};
}

export const BREED_V2_EXPECTED_MIGRATED_COLUMNS=Object.freeze({
  fci:fci.length,editorial:editorial.length,
  seo:textKeys.length+1,controlled:controlledNums.length+controlledLists.length,
  related:3,
});

/**
 * Null-safe physical equality. This catches concurrent source edits DURING
 * the multi-statement import; a mismatched field blocks every later cutover.
 * It never exports editorial paragraphs or source URLs.
 */
const mismatch=(sourceTable,targetTable,pairs,join)=>{
 const where=["d.breed_id IS NULL",...pairs.map(([key,col,type])=>{
   const expected=type==="number"?jsonNumber(sourceTable,key):
     type==="list"?jsonList(sourceTable,key):
     type==="boolean"?`CASE json_type(${sourceTable},'$.noindex')
       WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE NULL END`:
       jsonText(sourceTable,key);
   return `(d.${col} IS NOT (${expected}))`;
 })].join(" OR ");
 return `SELECT COUNT(*) AS mismatches FROM ${join}
 LEFT JOIN ${targetTable} d ON d.breed_id=${targetTable==="breed_public_facts"?"c.breed_id":"m.id"}
 WHERE ${where}`;
};
export const BREED_V2_POSTFLIGHT_SQL=Object.freeze({
 fci:mismatch("m.fci_standard_json","breed_fci_standard",
   fci.map(([key,col])=>[key,col,"text"]),
   "managed_breeds m"),
 editorial:mismatch("m.editorial_json","breed_editorial_text",
   editorial.map(([key,col])=>[key,col,"text"]),
   "managed_breeds m"),
 seo:`SELECT COUNT(*) AS mismatches FROM managed_breeds m WHERE ${[
   ...textKeys.map(([key,col])=>`(m.${col} IS NOT (${jsonText("m.seo_json",key)}))`),
   `(m.seo_noindex IS NOT (CASE json_type(m.seo_json,'$.noindex')
     WHEN 'true' THEN 1 WHEN 'false' THEN 0 ELSE NULL END))`
 ].join(" OR ")}`,
 facts:mismatch("c.values_json","breed_public_facts",[
   ...controlledNums.map(([key,col])=>[key,col,"number"]),
   ...controlledLists.map(([key,col])=>[key,col,"list"])
 ],"breed_notion_controlled_values c JOIN breed_notion_workcopy_links l ON l.breed_id=c.breed_id AND l.status='ACTIVE'"),
 relations:`SELECT COUNT(*) AS mismatches FROM (
   SELECT m.id,CAST(j.value AS INTEGER) AS target,CAST(j.key AS INTEGER) AS pos
   FROM managed_breeds m CROSS JOIN json_each(m.related_breeds_json) j
   EXCEPT
   SELECT breed_id,related_breed_id,position FROM breed_related_breeds
 )`,
 extraRelations:`SELECT COUNT(*) AS mismatches FROM (
   SELECT breed_id,related_breed_id,position FROM breed_related_breeds
   EXCEPT
   SELECT m.id,CAST(j.value AS INTEGER),CAST(j.key AS INTEGER)
   FROM managed_breeds m CROSS JOIN json_each(m.related_breeds_json) j
 )`,
});
export function assertBreedSqlV2BackfillPostflight(input){
 const {base,links,controlled,post,counts}=input??{};
 ensure(count(base,"breed_count")===BREED_V2_COUNTS.breeds,"POST_BREED_COUNT");
 ensure(count(links,"active_count")===BREED_V2_COUNTS.activeNotionLinks,"POST_ACTIVE_COUNT");
 ensure(count(controlled,"sidecar_count")===BREED_V2_COUNTS.activeNotionLinks,"POST_CONTROLLED_COUNT");
 ensure(count(controlled,"pending_sync")===0,"POST_NOTION_PENDING");
 ensure(count(counts,"fci_rows")===BREED_V2_COUNTS.breeds &&
   count(counts,"editorial_rows")===BREED_V2_COUNTS.breeds &&
   count(counts,"fact_rows")===BREED_V2_COUNTS.activeNotionLinks,
   "POST_ROWS");
 for(const metric of Object.keys(BREED_V2_POSTFLIGHT_SQL))
   ensure(count(post,metric)===0,"POST_MISMATCH_"+metric);
 return {verified:true,breedRows:347,linkedNotionBreeds:344,
   checkedGroups:Object.keys(BREED_V2_POSTFLIGHT_SQL).length,
   publicCutoverEnabled:false};
}
