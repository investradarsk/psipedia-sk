/**
 * Guarded 0170 Directory contact backfill from historical JSON to SQL.
 * Existing SQL values, including explicit empty strings, are immutable.
 * No source JSON deletion, no notion calls, no schema change.
 */
export const DIRECTORY_CONTACT_BACKFILL_ALIASES = Object.freeze({
  website_url: ["Web", "Webstránka"],
  public_phone: ["Telefón", "Telefon", "phone"],
  public_email: ["E-mail", "Email", "email"],
  facebook_url: ["Facebook"],
  instagram_url: ["Instagram"],
});
export const DIRECTORY_CONTACT_BACKFILL_FIELDS = Object.freeze(Object.keys(DIRECTORY_CONTACT_BACKFILL_ALIASES));

const SAFE_JSON = "(CASE WHEN json_valid(source_data_json) AND json_type(source_data_json) = 'object' THEN source_data_json ELSE '{}' END)";

function fieldAliases(column) {
  const aliases = DIRECTORY_CONTACT_BACKFILL_ALIASES[column];
  if (!aliases) throw new Error("DIRECTORY_CONTACT_BACKFILL_UNKNOWN_COLUMN");
  return aliases;
}
function aliasExpression(key) {
  // All keys are fixed code literals from the public-contact legacy reader.
  const path = '$."' + key + '"';
  return "(CASE WHEN json_type(" + SAFE_JSON + ", '" + path +
    "') IN ('text','integer','real') THEN NULLIF(TRIM(CAST(json_extract(" +
    SAFE_JSON + ", '" + path + "') AS TEXT)), '') ELSE NULL END)";
}
export function directoryContactLegacyExpression(column) {
  const aliases = fieldAliases(column).map(aliasExpression);
  return aliases.length === 1 ? aliases[0] : "COALESCE(" + aliases.join(", ") + ")";
}
export function directoryContactBackfillPredicate(column) {
  fieldAliases(column);
  return column + " IS NULL" +
    " AND status IN ('draft','published')" +
    " AND TRIM(COALESCE(CAST(json_extract(" + SAFE_JSON +
    ", '$._psipedia_profile_review_reviewed_at') AS TEXT), '')) = ''" +
    " AND NOT EXISTS (SELECT 1 FROM admin_record_tombstones tomb WHERE tomb.kind='directory' AND tomb.record_id=directory_profiles.id)" +
    " AND " + directoryContactLegacyExpression(column) + " IS NOT NULL";
}
export function directoryContactBackfillCountSql() {
  const fields = DIRECTORY_CONTACT_BACKFILL_FIELDS.map(column =>
    "SUM(CASE WHEN " + directoryContactBackfillPredicate(column) +
    " THEN 1 ELSE 0 END) AS " + column);
  return "SELECT category, COUNT(*) AS profiles, " + fields.join(", ") +
    " FROM directory_profiles GROUP BY category ORDER BY category";
}
export function directoryContactBackfillUpdateSql(column) {
  return "UPDATE directory_profiles SET " + column + " = " +
    directoryContactLegacyExpression(column) +
    " WHERE " + directoryContactBackfillPredicate(column);
}
export function directoryContactBackfillSummary(rows) {
  if (!Array.isArray(rows)) throw new Error("DIRECTORY_CONTACT_BACKFILL_INVALID_REPORT");
  const totals = Object.fromEntries(DIRECTORY_CONTACT_BACKFILL_FIELDS.map(key => [key, 0]));
  let profiles = 0;
  const byCategory = {};
  for (const row of rows) {
    if (!row || typeof row.category !== "string" || typeof row.profiles !== "number" ||
      !Number.isSafeInteger(row.profiles) || row.profiles < 0 ||
      Object.hasOwn(byCategory, row.category)) throw new Error("DIRECTORY_CONTACT_BACKFILL_INVALID_REPORT");
    profiles += row.profiles;
    const fields = {};
    for (const key of DIRECTORY_CONTACT_BACKFILL_FIELDS) {
      const n = row[key];
      if (!Number.isSafeInteger(n) || n < 0 || n > row.profiles)
        throw new Error("DIRECTORY_CONTACT_BACKFILL_INVALID_REPORT");
      fields[key] = n;
      totals[key] += n;
    }
    byCategory[row.category] = { profiles: row.profiles, candidates: fields };
  }
  if (!Number.isSafeInteger(profiles)) throw new Error("DIRECTORY_CONTACT_BACKFILL_INVALID_REPORT");
  return { profiles, totals, byCategory };
}
