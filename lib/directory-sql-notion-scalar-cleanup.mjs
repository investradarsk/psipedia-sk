/**
 * Delete the 12 scalar labels and 5 public-contact alias groups whose
 * canonical destination is an existing Notion-mapped SQL column.
 *
 * Owner decision: never retain a JSON backup of these 17 SQL field groups.
 * SQL values are not read or modified by this cleanup, even when empty.
 *
 * Only valid JSON objects can contain those top-level keys. Other JSON
 * metadata and all SQL columns remain untouched.
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
/** All five canonical contact SQL owners, including import spellings. */
export const DIRECTORY_SQL_NOTION_CONTACT_ALIASES = Object.freeze({
  website_url: ["Web", "Webstránka"],
  public_phone: ["Telefón", "Telefon", "phone"],
  public_email: ["E-mail", "Email", "email"],
  facebook_url: ["Facebook"],
  instagram_url: ["Instagram"],
});
export const DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS = Object.freeze([
  ...DIRECTORY_SQL_NOTION_SCALAR_COLUMNS,
  ...Object.keys(DIRECTORY_SQL_NOTION_CONTACT_ALIASES),
]);

function columnLabel(column) {
  const label=DIRECTORY_SQL_NOTION_SCALAR_LABELS[column];
  if (!label) throw new Error("DIRECTORY_SCALAR_CLEANUP_UNKNOWN_COLUMN");
  return label;
}
const SAFE_JSON="(CASE WHEN json_valid(source_data_json) THEN " +
  "(CASE WHEN json_type(source_data_json) = 'object' THEN source_data_json ELSE '{}' END) " +
  "ELSE '{}' END)";
function keys(column) {
  if (Object.hasOwn(DIRECTORY_SQL_NOTION_SCALAR_LABELS, column))
    return [columnLabel(column)];
  const contacts=DIRECTORY_SQL_NOTION_CONTACT_ALIASES[column];
  if (!Array.isArray(contacts) || !contacts.length)
    throw new Error("DIRECTORY_SCALAR_CLEANUP_UNKNOWN_COLUMN");
  return contacts;
}
function paths(column) {
  // Fixed, reviewed Notion and contact alias names; never interpolate user data.
  return keys(column).map(key=>"'$.\"" + key + "\"'");
}
function sourceExists(column) {
  return "(" + paths(column).map(path=>
    "json_type(" + SAFE_JSON + ", " + path + ") IS NOT NULL"
  ).join(" OR ") + ")";
}

/**
 * No SQL NOT NULL condition or status/review lock for these historic copies:
 * the owner has approved unconditional removal, regardless of their content.
 */
export function directoryScalarCleanupPredicate(column) {
  return sourceExists(column);
}
export function directoryScalarCleanupUpdateSql(column) {
  return "UPDATE directory_profiles SET source_data_json = json_remove(" +
    SAFE_JSON + ", " + paths(column).join(", ") + ") WHERE " +
    directoryScalarCleanupPredicate(column);
}
export function directoryScalarCleanupCountSql() {
  const counts=["category","COUNT(*) AS profiles"];
  for (const column of DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS) {
    const present=sourceExists(column);
    counts.push("SUM(CASE WHEN " + present +
      " THEN 1 ELSE 0 END) AS " + column + "_removable");
    counts.push("SUM(CASE WHEN " + present +
      " AND (" + column + " IS NULL OR TRIM(CAST(" + column +
      " AS TEXT)) = '') THEN 1 ELSE 0 END) AS " + column + "_without_sql_value");
  }
  counts.push("SUM(CASE WHEN NOT json_valid(source_data_json) THEN 1 ELSE 0 END) AS invalid_json");
  return "SELECT " + counts.join(", ") +
    " FROM directory_profiles GROUP BY category ORDER BY category";
}
export function directoryScalarCleanupSummary(rows) {
  if(!Array.isArray(rows))throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
  const zero=()=>Object.fromEntries(DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS.map(c=>[c,0]));
  const totals={removable:zero(),withoutSqlValue:zero(),invalidJson:0};
  const byCategory={};
  let profiles=0;
  for (const row of rows) {
    if(!row||typeof row.category!=="string"||!row.category||
       Object.hasOwn(byCategory,row.category)||
       !Number.isSafeInteger(row.profiles)||row.profiles<0)
      throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
    profiles+=row.profiles;
    const c={removable:zero(),withoutSqlValue:zero()};
    for (const field of DIRECTORY_SQL_NOTION_CLEANUP_COLUMNS) {
      const removable=row[field+"_removable"];
      const withoutSql=row[field+"_without_sql_value"];
      if(!Number.isSafeInteger(removable)||removable<0||
         removable>row.profiles||!Number.isSafeInteger(withoutSql)||
         withoutSql<0||withoutSql>removable)
        throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
      c.removable[field]=removable;
      c.withoutSqlValue[field]=withoutSql;
      totals.removable[field]+=removable;
      totals.withoutSqlValue[field]+=withoutSql;
    }
    if(!Number.isSafeInteger(row.invalid_json)||row.invalid_json<0||
       row.invalid_json>row.profiles)
      throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
    totals.invalidJson+=row.invalid_json;
    byCategory[row.category]={profiles:row.profiles,...c,invalidJson:row.invalid_json};
  }
  if(!Number.isSafeInteger(profiles))throw new Error("DIRECTORY_SCALAR_CLEANUP_INVALID_REPORT");
  return {profiles,totals,byCategory};
}
