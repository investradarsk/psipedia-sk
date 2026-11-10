/**
 * Pure, read-only guards for the separate manual 0163 schema rollout.
 * This is deliberately not an authorization to write controlled breed data,
 * update Notion, enable feature flags or change the Drizzle migration ledger.
 */
export const BREED_0163_TARGET = "0163_breed_notion_controlled_values.sql";
export const BREED_0163_TABLE = "breed_notion_controlled_values";
export const BREED_0163_BLOB_SHA = "483eed08bce25e2770bcc8845928ad0d5d83b949";
export const BREED_0163_PREREQUISITE_INDEXES = Object.freeze([
  "directory_profiles_admin_updated_idx",
  "directory_profiles_admin_category_updated_idx",
  "directory_profiles_admin_status_updated_idx",
  "directory_profiles_admin_name_idx",
  "directory_profiles_admin_city_name_idx",
]);
const EXPECTED_COLUMNS = Object.freeze([
  ["breed_id","INTEGER",1,1],
  ["values_json","TEXT",1,0],
  ["notion_values_json","TEXT",1,0],
  ["revision","INTEGER",1,0],
  ["updated_at","TEXT",1,0],
]);
const must=(condition,code)=>{if(!condition) throw Error(code);};

export function classifyBreed0163(input) {
  must(input && typeof input==="object","BREED_0163_INVALID_INPUT");
  const parentReady=input.managedBreedsPresent===true && input.workcopyLinksPresent===true;
  const cohortsReady=parentReady &&
    input.activeLinks===344 && input.totalLinks===344 &&
    Number.isSafeInteger(input.managedBreedCount) && input.managedBreedCount>=344;
  const indexesReady=BREED_0163_PREREQUISITE_INDEXES.every(
    name=>Array.isArray(input.indexNames) && input.indexNames.includes(name));
  const previousReady=indexesReady && input.shortDescriptionPresent===true;
  const prerequisitesReady=cohortsReady && previousReady;
  let installed=false;
  if(input.tablePresent===true) {
    const columns=input.columns;
    must(Array.isArray(columns) && columns.length===EXPECTED_COLUMNS.length,
      "BREED_0163_EXISTING_SCHEMA_INCOMPATIBLE");
    for (let i=0;i<EXPECTED_COLUMNS.length;i++) {
      const [name,type,notnull,pk]=EXPECTED_COLUMNS[i];
      const column=columns[i];
      must(column?.name===name &&
        String(column.type).toUpperCase()===type &&
        Number(column.notnull)===notnull && Number(column.pk)===pk,
        "BREED_0163_EXISTING_SCHEMA_INCOMPATIBLE");
    }
    must(String(columns[3].dflt_value)==="0" &&
      /strftime\('%Y-%m-%dT%H:%M:%fZ','now'\)/.test(String(columns[4].dflt_value)) &&
      Array.isArray(input.foreignKeys) && input.foreignKeys.length===1 &&
      input.foreignKeys[0]?.table==="managed_breeds" &&
      input.foreignKeys[0]?.from==="breed_id" &&
      input.foreignKeys[0]?.to==="id" &&
      String(input.foreignKeys[0]?.on_delete).toUpperCase()==="CASCADE" &&
      Number.isSafeInteger(input.rowCount) && input.rowCount>=0 && input.rowCount<=344,
      "BREED_0163_EXISTING_SCHEMA_INCOMPATIBLE");
    installed=true;
  } else {
    must(input.tablePresent===false &&
      Array.isArray(input.columns) && input.columns.length===0 &&
      Array.isArray(input.foreignKeys) && input.foreignKeys.length===0 &&
      input.rowCount===null, "BREED_0163_PARTIAL_SCHEMA");
  }
  const blockers=[
    ...(!parentReady?["MISSING_PARENT_TABLE"]:[]),
    ...(!cohortsReady?["ACTIVE_WORKCOPY_344_NOT_READY"]:[]),
    ...(!indexesReady?["0158_INDEXES_NOT_READY"]:[]),
    ...(!input.shortDescriptionPresent?["0162_COLUMN_NOT_READY"]:[]),
  ];
  return {installed,prerequisitesReady,readyToApply:!installed&&prerequisitesReady,
    blockers,activeLinks:input.activeLinks,totalLinks:input.totalLinks,
    managedBreedCount:input.managedBreedCount,rowCount:input.rowCount};
}
export function assertBreed0163ApplyReady(state) {
  must(state.readyToApply && state.blockers.length===0 && !state.installed,
    "BREED_0163_PREREQUISITES_NOT_READY");
  return true;
}
export function assertBreed0163Postflight(before,after) {
  must(!before.installed && after.installed && after.prerequisitesReady &&
    after.rowCount===0 && before.activeLinks===after.activeLinks &&
    before.totalLinks===after.totalLinks &&
    before.managedBreedCount===after.managedBreedCount,
    "BREED_0163_POSTFLIGHT_FAILED");
  return true;
}
