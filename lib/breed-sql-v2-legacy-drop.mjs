/** Four historic object blobs only. Lists remain canonical JSON arrays. */
export const BREED_LEGACY_OBJECT_COLUMNS=Object.freeze([
  "fci_standard_json","editorial_json","related_breeds_json","seo_json",
]);
export function breedSqlV2InsertColumns(allColumns,legacyCount){
  if(!Array.isArray(allColumns)||new Set(allColumns).size!==allColumns.length)
    throw Error("BREED_INSERT_COLUMNS_INVALID");
  if(legacyCount!==0&&legacyCount!==4)
    throw Error("BREED_LEGACY_SCHEMA_PARTIAL_STOP");
  for(const col of BREED_LEGACY_OBJECT_COLUMNS)
    if(!allColumns.includes(col))throw Error("BREED_LEGACY_COLUMN_MAP_MISSING");
  return legacyCount===4?[...allColumns]:
    allColumns.filter(col=>!BREED_LEGACY_OBJECT_COLUMNS.includes(col));
}
