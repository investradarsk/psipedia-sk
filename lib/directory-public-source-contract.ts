/** Directory public SQL-only read contract.
 *
 * D1 canonical columns/relationships own profile fields. Historical
 * source_data_json spelling and fallback precedence are retired.
 * If a value has no relational owner, it is intentionally empty.
 */
type SourceAlias = "" | "profile" | "p";
function id(alias:SourceAlias) {return alias ? alias+".id" : "directory_profiles.id";}
function district(alias:SourceAlias) {return alias ? alias+".district" : "district";}

/** The approved free-text field stores are relational; all keys are static. */
function sqlFact(keys:readonly string[],alias:SourceAlias=""):string {
  return "COALESCE(" + keys.map(key => {
    const literal="'"+key.replaceAll("'","''")+"'";
    return "NULLIF(TRIM((SELECT value_text FROM directory_profile_public_facts "+
      "WHERE profile_id="+id(alias)+" AND field_key="+literal+" LIMIT 1)),'')";
  }).concat(keys.map(key=>{
    const literal="'"+key.replaceAll("'","''")+"'";
    return "NULLIF(TRIM((SELECT text_value FROM directory_profile_extra_fields "+
      "WHERE profile_id="+id(alias)+" AND field_key="+literal+" LIMIT 1)),'')";
  })).concat(["''"]).join(",") + ")";
}

export const DIRECTORY_PUBLIC_SOURCE_FACETS = {
  breed:sqlFact(["Plemeno","Plemená"]),
  fciGroup:sqlFact(["FCI skupina","FCI"]),
  organization:sqlFact(["Organizácia"]),
  profileType:sqlFact(["Typ služby","Typ poskytovateľa","Typ klubu"]),
} as const;

/** No longer query the old 'Okres' JSON fallback. */
export function directoryLegacyDistrictSql(_alias:SourceAlias=""):string {
  return "NULL";
}
export function directoryEffectiveDistrictSql(alias:SourceAlias=""):string {
  return "COALESCE(NULLIF(TRIM("+district(alias)+"),''),'')";
}
export function directoryEffectiveDistrictValue(
  canonicalDistrict:string|null|undefined,
  _historicalDistrict:unknown,
):string {
  return typeof canonicalDistrict==="string"?canonicalDistrict.trim():"";
}
