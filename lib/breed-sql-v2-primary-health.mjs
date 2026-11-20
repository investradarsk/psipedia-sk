/** Read-only health gate after the public/Admin/Notion SQL-only breed cutover.
 * Never compare canonical SQL to the four deliberately stale legacy JSON
 * object columns; they are no longer writable in mode "sql".
 */
const exact=(n,expected)=>typeof n==="number"&&Number.isSafeInteger(n)&&n===expected;
const nonnegative=n=>typeof n==="number"&&Number.isSafeInteger(n)&&n>=0;
export function assessBreedSqlV2PrimaryHealth(value) {
  const v=value??{},blockers=[];
  const check=(condition,key)=>{if(!condition)blockers.push(key)};
  check(exact(v.base?.breed_count,347),"BREED_COUNT");
  check(exact(v.links?.active_count,344)&&exact(v.links?.unique_breeds,344)&&
    exact(v.links?.unique_pages,344),"ACTIVE_NOTION_LINKS");
  check(Array.isArray(v.extras)&&JSON.stringify(
    v.extras.map(x=>Number(x.id)).sort((a,b)=>a-b))===
    JSON.stringify([5,13,14]),"UNLINKED_IDENTITIES");
  check(exact(v.controlled?.sidecar_count,344)&&
    exact(v.controlled?.invalid_values,0)&&
    exact(v.controlled?.invalid_notion,0),"CONTROLLED_NOTION_RECEIPTS");
  check(exact(v.controlled?.pending_sync,0),"NOTION_PENDING_CHANGES");
  check(exact(v.orphanControlled?.orphan_count,0),"ORPHAN_NOTION_RECEIPTS");
  check(exact(v.destination?.fci_rows,347),"FCI_SQL_ROWS");
  check(exact(v.destination?.editorial_rows,347),"EDITORIAL_SQL_ROWS");
  check(exact(v.destination?.fact_rows,344),"PUBLIC_FACT_SQL_ROWS");
  for(const key of ["missing_fci","missing_editorial","missing_facts"])
    check(exact(v.missing?.[key],0),"MISSING_SQL_"+key);
  check(exact(v.foreignKeys?.violations,0),"FOREIGN_KEYS");
  // Controlled mirror receipts still sync to typed SQL facts. In contrast
  // historic breed JSON objects are NOT consulted after the cutover.
  check(exact(v.controlledFacts?.mismatches,0),"CONTROLLED_FACTS_SQL_PARITY");
  check(exact(v.scalarParity?.linked_mirrors,344),"CONTROLLED_SCALAR_COHORT");
  for(const key of ["fci_group_conflicts","fci_section_conflicts","size_conflicts"])
    check(nonnegative(v.scalarParity?.[key])&&v.scalarParity[key]<=344,
      "INVALID_CLASSIFICATION_"+key);
  check(nonnegative(v.destination?.related_rows),"RELATION_SQL_ROWS");
  return {
    ready:blockers.length===0,blockers,
    inspected:{
      breeds:Number(v.base?.breed_count??0),
      notionLinks:Number(v.links?.active_count??0),
      fciRows:Number(v.destination?.fci_rows??0),
      editorialRows:Number(v.destination?.editorial_rows??0),
      factsRows:Number(v.destination?.fact_rows??0),
      relationEdges:Number(v.destination?.related_rows??0),
      pendingNotionCells:Number(v.controlled?.pending_sync??0),
      controlledFactsMismatches:Number(v.controlledFacts?.mismatches??-1),
      classificationDifferences:Object.fromEntries(
        ["fci_group_conflicts","fci_section_conflicts","size_conflicts"]
          .map(key=>[key,Number(v.scalarParity?.[key]??-1)])),
    },
    legacyJsonCompared:false,legacyJsonDeleted:false,
    liveNotionPageChecked:false,writesAttempted:false,
  };
}
