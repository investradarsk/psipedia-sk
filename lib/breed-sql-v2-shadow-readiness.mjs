/**
 * Read-only production SQL v2 shadow readiness. This does NOT enable writes,
 * compare a live remote Notion page, or authorize SQL-primary public reading.
 * Fail closed on unknown counts, incomplete mirrors, pending sync or drift.
 */
const same=(value,expected)=>typeof value==="number"&&Number.isSafeInteger(value)&&value===expected;
export const BREED_SQL_V2_SHADOW_AUDIT_QUERY_KEYS=Object.freeze([
  "base","links","controlled","orphanControlled","destination",
  "extras","foreignKeys","scalarParity",
  "fci","editorial","seo","facts","relations","extraRelations",
]);
export function assessBreedSqlV2ShadowReadiness(value){
  const v=value??{},blockers=[];
  const check=(ok,code)=>{if(!ok)blockers.push(code)};
  check(same(v.base?.breed_count,347),"BREED_COUNT");
  for(const key of ["invalid_fci","invalid_editorial","invalid_seo","invalid_relations"])
    check(same(v.base?.[key],0),"INVALID_SOURCE_"+key);
  check(same(v.links?.active_count,344)&&same(v.links?.unique_breeds,344)&&
        same(v.links?.unique_pages,344),"ACTIVE_LINKS");
  check(Array.isArray(v.extras)&&
        JSON.stringify(v.extras.map(x=>Number(x.id)).sort((a,b)=>a-b))===
        JSON.stringify([5,13,14]),"UNLINKED_IDENTITIES");
  check(same(v.controlled?.sidecar_count,344)&&
        same(v.controlled?.invalid_values,0)&&
        same(v.controlled?.invalid_notion,0),"CONTROLLED_SIDECARS");
  check(same(v.controlled?.pending_sync,0),"NOTION_PENDING_CHANGES");
  check(same(v.orphanControlled?.orphan_count,0),"ORPHAN_CONTROLLED_SIDECARS");
  check(same(v.destination?.fci_rows,347),"FCI_ROWS");
  check(same(v.destination?.editorial_rows,347),"EDITORIAL_ROWS");
  check(same(v.destination?.fact_rows,344),"PUBLIC_FACT_ROWS");
  for(const key of ["fci","editorial","seo","facts","relations","extraRelations"])
    check(same(v.post?.[key],0),"SQL_PARITY_"+key);
  check(same(v.scalarParity?.linked_mirrors,344),"CONTROLLED_SCALAR_COHORT");
  // Explicit editorial decision (2026-11-19): the 12 typed Notion fields
  // retain their own SQL mirrors. Legacy classification scalar values can
  // use a different vocabulary; their disagreement is diagnostic, NOT
  // evidence of missing backfilled FCI/editorial/SEO data. Preserve both
  // values until a deliberate reader cutover, never bulk-overwrite either.
  for(const key of ["fci_group_conflicts","fci_section_conflicts","size_conflicts"]){
    const count=v.scalarParity?.[key];
    check(typeof count==="number"&&Number.isSafeInteger(count)&&
      count>=0&&count<=344,"INVALID_CONTROLLED_SCALAR_COUNT_"+key);
  }
  check(same(v.foreignKeys?.violations,0),"FOREIGN_KEY_VIOLATIONS");
  return {
    ready:blockers.length===0, blockers,
    inspected:{breeds:Number(v.base?.breed_count??0),
      linkedNotionD1Mirrors:Number(v.links?.active_count??0),
      fciRows:Number(v.destination?.fci_rows??0),
      editorialRows:Number(v.destination?.editorial_rows??0),
      factRows:Number(v.destination?.fact_rows??0),
      relatedEdges:Number(v.destination?.related_rows??0),
      pendingNotionCells:Number(v.controlled?.pending_sync??0),
      mismatches:Object.fromEntries(Object.entries(v.post??{})
        .map(([key,val])=>[key,Number(val)])),
      scalarConflicts:Object.fromEntries(
        ["fci_group_conflicts","fci_section_conflicts","size_conflicts"]
          .map(key=>[key,Number(v.scalarParity?.[key]??0)])),
    },
    acceptedClassificationDifferences:true,
    publicCutover:false,legacyJsonDeleted:false,liveNotionPageChecked:false,
  };
}
