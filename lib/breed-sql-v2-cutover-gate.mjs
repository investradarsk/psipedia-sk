/**
 * Plemená 6/6: FAIL-CLOSED cutover gate. READ-ONLY diagnosis.
 *
 * A finished 0174 backfill does not mean legacy JSON can be retired:
 * public index, public detail, SEO, FCI excerpts and Admin/Notion writers
 * currently have independent read/write paths. No cutover is authorized until
 * each relevant path is verified under a common per-field LWW CAS contract.
 */
export const BREED_SQL_V2_READ_PATHS=Object.freeze([
  "publicBreedDetail",
  "publicBreedIndex",
  "publicBreedSearchAndFilters",
  "publicBreedComparison",
  "publicBreedOfTheDay",
  "publicFciMeasurements",
  "publicMetadataAndSitemap",
  "adminBreedDetail",
  "adminBreedSummaries",
  "breedRelations",
]);
export const BREED_SQL_V2_WRITE_PATHS=Object.freeze([
  "adminBreedFullSave",
  "adminBreedCreate",
  "adminBreedInlineIntro",
  "adminBreedDirectDirtyFields",
  "notionBreedSingleFieldWebhook",
  "notionBreedControlled12Fields",
  "breedRelationsReorder",
  "breedSeoOgImage",
]);
export const BREED_SQL_V2_CUTOVER_AUDIT_SQL=Object.freeze({
  /**
   * These three Notion-controlled select values correspond to legacy SQL
   * scalars already used by public filtering and URL logic. They were NOT
   * changed in the five-statement backfill to avoid clobbering live data.
   * Null/not selected is not a change; report it separately from conflict.
   */
  scalarParity:`SELECT
    COUNT(*) AS linked_mirrors,
    COALESCE(SUM(CASE WHEN json_type(c.values_json,'$.fciGroupSelect')='text'
      AND CAST(json_extract(c.values_json,'$.fciGroupSelect') AS INTEGER)
         IS NOT m.fci_group THEN 1 ELSE 0 END),0) AS fci_group_conflicts,
    COALESCE(SUM(CASE WHEN json_type(c.values_json,'$.fciSectionSelect')='text'
      AND json_extract(c.values_json,'$.fciSectionSelect')
         IS NOT m.fci_section_number THEN 1 ELSE 0 END),0) AS fci_section_conflicts,
    COALESCE(SUM(CASE WHEN json_type(c.values_json,'$.sizeSelect')='text'
      AND json_extract(c.values_json,'$.sizeSelect')
         IS NOT m.size THEN 1 ELSE 0 END),0) AS size_conflicts,
    COALESCE(SUM(CASE WHEN json_type(c.values_json,'$.fciGroupSelect')='null'
      THEN 1 ELSE 0 END),0) AS fci_group_not_selected,
    COALESCE(SUM(CASE WHEN json_type(c.values_json,'$.fciSectionSelect')='null'
      THEN 1 ELSE 0 END),0) AS fci_section_not_selected,
    COALESCE(SUM(CASE WHEN json_type(c.values_json,'$.sizeSelect')='null'
      THEN 1 ELSE 0 END),0) AS size_not_selected
    FROM breed_notion_controlled_values c
    JOIN breed_notion_workcopy_links l ON l.breed_id=c.breed_id AND l.status='ACTIVE'
    JOIN managed_breeds m ON m.id=c.breed_id`,
  completeRows:`SELECT
    (SELECT COUNT(*) FROM managed_breeds) AS breeds,
    (SELECT COUNT(*) FROM breed_fci_standard) AS fci,
    (SELECT COUNT(*) FROM breed_editorial_text) AS editorial,
    (SELECT COUNT(*) FROM breed_public_facts) AS facts,
    (SELECT COUNT(*) FROM breed_notion_controlled_values c JOIN breed_notion_workcopy_links l
      ON l.breed_id=c.breed_id AND l.status='ACTIVE') AS linked_mirrors,
    (SELECT COUNT(*) FROM breed_related_breeds) AS related_edges`,
});

function number(value){return typeof value==="number"&&Number.isSafeInteger(value)?value:NaN}
function checkCoverage(required,provided,label,blockers){
  for(const name of required)
    if(provided?.[name]!==true) blockers.push(label+":"+name);
}
const isZero=(value)=>number(value)===0;

/**
 * This is a readiness decision, never a database writer. A successful mirror
 * seed and postflight are necessary but not sufficient. Missing evidence for
 * any reader/writer is a hard block.
 */
export function assessBreedSqlV2Cutover({
  migration0174Applied=false,backfillPostflightVerified=false,
  liveNotionParityVerified=false,
  publicIndexParityVerified=false,
  scalarParity,completeRows,postflightMismatches,
  readCoverage,writeCoverage,
}={}){
  const blockers=[];
  if(!migration0174Applied)blockers.push("migration-0174-not-applied");
  if(!backfillPostflightVerified)blockers.push("backfill-postflight-unverified");
  if(!liveNotionParityVerified)blockers.push("live-notion-parity-unverified");
  if(!publicIndexParityVerified)blockers.push("public-index-parity-unverified");
  if(number(completeRows?.breeds)!==347 ||
     number(completeRows?.fci)!==347 ||
     number(completeRows?.editorial)!==347 ||
     number(completeRows?.facts)!==344 ||
     number(completeRows?.linked_mirrors)!==344)
    blockers.push("sql-row-counts-not-verified");
  if(number(scalarParity?.linked_mirrors)!==344 ||
    !["fci_group_conflicts","fci_section_conflicts","size_conflicts"].every(
      key=>isZero(scalarParity?.[key])))
    blockers.push("controlled-3-scalar-parity-not-verified");
  const checks=["fci","editorial","seo","facts","relations","extraRelations"];
  if(!checks.every(key=>isZero(postflightMismatches?.[key])))
    blockers.push("legacy-to-sql-cell-parity-not-verified");
  checkCoverage(BREED_SQL_V2_READ_PATHS,readCoverage,"reader-unverified",blockers);
  checkCoverage(BREED_SQL_V2_WRITE_PATHS,writeCoverage,"writer-unverified",blockers);
  return {ready:blockers.length===0,blockers,deleteLegacyAllowed:false};
}
