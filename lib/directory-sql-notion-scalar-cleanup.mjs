/**
 * Cleanup contract for the 12 direct Notion <-> D1 SQL scalar fields.
 *
 * JSON top-level labels are historical duplicates, NOT the canonical value.
 * Drop one only when the corresponding SQL scalar is confirmed NONEMPTY.
 * This is deliberately stricter than 0170 contact migration, because these
 * older SQL fields can contain '' as either an old default or an explicit clear.
 *
 * Nothing here deletes directory_profiles.source_data_json, copies data into
 * SQL, modifies Notion, or alters relations/other JSON fields.
 */
export const DIRECTORY_SQL_NOTION_SCALAR_LABELS = Object.freeze({
  name:"Názov",
  excerpt:"Perex",
  description:"Popis",
  region:"Kraj",
  district:"Okres",
  city:"Mesto",
  address:"Adresa",
  postal_code:"PSČ",
  street:"Ulica",
  house_number:"Číslo domu",
  address_format:"Formát adresy",
  price_note:"Cena / poznámka",
});
export const DIRECTORY_SQL_NOTION_SCALAR_COLUMNS =
  Object.freeze(Object.keys(DIRECTORY_SQL_NOTION_SCALAR_LABELS));

function columnLabel(column) {
  const label=DIRECTORY_SQL_NOTION_SCALAR_LABELS[column];
  if (!label) throw new Error("DIRECTORY_SCALAR_CLEANUP_UNKNOWN_COLUMN");
  return label;
}
const SAFE_JSON="(CASE WHEN json_valid(source_data_json) THEN " +
  "(CASE WHEN json_type(source_data_json) = 'object' THEN source_data_json ELSE '{}' END) " +
  "ELSE '{}' END)";
function path(column) {
  // Fixed, reviewed Notion property names only; never interpolate user data.
  return "'$.\"" + columnLabel(column) + "\"'";
}
function sourceExists(column) {
  return "json_type(" + SAFE_JSON + ", " + path(column) + ") IS NOT NULL";
}
function sqlPopulated(column) {
  columnLabel(column);
  return "(" + column + " IS NOT NULL AND TRIM(CAST(" + column + " AS TEXT)) <> '')";
}
function protectedProfile() {
  const reviewed="TRIM(COALESCE(CAST(json_extract(" + SAFE_JSON +
    ", '$._psipedia_profile_review_reviewed_at') AS TEXT), '')) <> ''";
  const pending="COALESCE(CAST(json_extract(" + SAFE_JSON +
    ", '$._psipedia_profile_review_unlock_pending') AS TEXT), '') = '1'";
  const tombstone="EXISTS (SELECT 1 FROM admin_record_tombstones tomb WHERE " +
    "tomb.kind='directory' AND tomb.record_id=directory_profiles.id)";
  return "(status NOT IN ('draft','published') OR " + reviewed +
    " OR " + pending + " OR " + tombstone + ")";
}
export function directoryScalarCleanupPredicate(column) {
  return sqlPopulated(column) + " AND " + sourceExists(column) +
    " AND NOT " + protectedProfile();
}
export function directoryScalarCleanupUpdateSql(column) {
  return "UPDATE directory_profiles SET source_data_json = json_remove(" +
    SAFE_JSON + ", " + path(column) + ") WHERE " +
    directoryScalarCleanupPredicate(column);
}
export function directoryScalarCleanupCountSql() {
  const counts=["category","COUNT(*) AS profiles"];
  for (const column of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS) {
    const present=sourceExists(column);
    const populated=sqlPopulated(column);
    const protect=protectedProfile();
    counts.push("SUM(CASE WHEN " + directoryScalarCleanupPredicate(column) +
      " THEN 1 ELSE 0 END) AS " + column + "_removable");
    counts.push("SUM(CASE WHEN " + present + " AND NOT " + populated +
      " THEN 1 ELSE 0 END) AS " + column + "_unconfirmed");
    counts.push("SUM(CASE WHEN " + present + " AND " + populated +
      " AND " + protect + " THEN 1 ELSE 0 END) AS " + column + "_protected");
  }
  return "SELECT " + counts.join(", ") +
    " FROM directory_profiles GROUP BY category ORDER BY category";
}
export function directoryScalarCleanupSummary(rows) {
  if(!Array.isArray(rows))throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
  const zero=()=>Object.fromEntries(DIRECTORY_SQL_NOTION_SCALAR_COLUMNS.map(c=>[c,0]));
  const totals={removable:zero(),unconfirmed:zero(),protected:zero()};
  const byCategory={};
  let profiles=0;
  for (const row of rows) {
    if(!row||typeof row.category!=="string"||!row.category||
       Object.hasOwn(byCategory,row.category)||
       !Number.isSafeInteger(row.profiles)||row.profiles<0)
      throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
    profiles+=row.profiles;
    const c={removable:zero(),unconfirmed:zero(),protected:zero()};
    for (const field of DIRECTORY_SQL_NOTION_SCALAR_COLUMNS) {
      for(const key of ["removable","unconfirmed","protected"]){
        const value=row[field+"_"+key];
        if(!Number.isSafeInteger(value)||value<0||value>row.profiles)
          throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
        c[key][field]=value;
        totals[key][field]+=value;
      }
      if(c.removable[field]+c.unconfirmed[field]+c.protected[field]>row.profiles)
        throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
    }
    byCategory[row.category]={profiles:row.profiles,...c};
  }
  if(!Number.isSafeInteger(profiles))throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
  return {profiles,totals,byCategory};
}
