/**
 * Safe, incremental cleanup of historic Directory public-contact aliases.
 *
 * A legacy alias may be removed ONLY when its canonical SQL column is
 * non-NULL (including an intentional SQL empty string). Missing SQL contacts
 * still require the legacy read path and must stay intact.
 *
 * This module does not touch JSON technical metadata, public facts, category
 * relations, filters, image display settings, Notion mapping or SQL contacts.
 */
import {
  DIRECTORY_CONTACT_BACKFILL_ALIASES,
  DIRECTORY_CONTACT_BACKFILL_FIELDS,
} from "./directory-contact-null-backfill.mjs";

export const DIRECTORY_CONTACT_CLEANUP_FIELDS = DIRECTORY_CONTACT_BACKFILL_FIELDS;

const SAFE_JSON = "(CASE WHEN json_valid(source_data_json) THEN " +
  "(CASE WHEN json_type(source_data_json)='object' THEN source_data_json ELSE '{}' END) " +
  "ELSE '{}' END)";

function aliases(column) {
  const keys = DIRECTORY_CONTACT_BACKFILL_ALIASES[column];
  if (!Array.isArray(keys) || !keys.length)
    throw new Error("DIRECTORY_CONTACT_CLEANUP_UNKNOWN_FIELD");
  return keys;
}
function path(key) {
  // All keys are fixed compile-time literals, never user-provided SQL.
  return "'$.\"" + key + "\"'";
}
function legacyPresent(column) {
  return "(" + aliases(column).map(key =>
    "json_type(" + SAFE_JSON + ", " + path(key) + ") IS NOT NULL"
  ).join(" OR ") + ")";
}
function protectedProfile() {
  const reviewed = "TRIM(COALESCE(CAST(json_extract(" + SAFE_JSON +
    ", '$._psipedia_profile_review_reviewed_at') AS TEXT), '')) <> ''";
  const pending = "COALESCE(CAST(json_extract(" + SAFE_JSON +
    ", '$._psipedia_profile_review_unlock_pending') AS TEXT), '') = '1'";
  const tombstone = "EXISTS (SELECT 1 FROM admin_record_tombstones tomb " +
    "WHERE tomb.kind='directory' AND tomb.record_id=directory_profiles.id)";
  return "(status NOT IN ('draft','published') OR " + reviewed +
    " OR " + pending + " OR " + tombstone + ")";
}
export function directoryContactLegacyPresenceSql(column) {
  return legacyPresent(column);
}
export function directoryContactCleanupPredicate(column) {
  aliases(column);
  return column + " IS NOT NULL AND " + legacyPresent(column) +
    " AND NOT " + protectedProfile();
}
export function directoryContactCleanupUpdateSql(column) {
  const paths = aliases(column).map(path);
  return "UPDATE directory_profiles SET source_data_json = json_remove(" +
    SAFE_JSON + ", " + paths.join(", ") + ") WHERE " +
    directoryContactCleanupPredicate(column);
}
export function directoryContactCleanupCountSql() {
  const columns = ["category", "COUNT(*) AS profiles"];
  for (const column of DIRECTORY_CONTACT_CLEANUP_FIELDS) {
    const present = legacyPresent(column);
    columns.push("SUM(CASE WHEN " + directoryContactCleanupPredicate(column) +
      " THEN 1 ELSE 0 END) AS " + column);
    columns.push("SUM(CASE WHEN " + column + " IS NULL AND " + present +
      " THEN 1 ELSE 0 END) AS " + column + "_unmigrated");
    columns.push("SUM(CASE WHEN " + column + " IS NOT NULL AND " + present +
      " AND " + protectedProfile() + " THEN 1 ELSE 0 END) AS " +
      column + "_protected");
  }
  return "SELECT " + columns.join(", ") +
    " FROM directory_profiles GROUP BY category ORDER BY category";
}
export function directoryContactCleanupSummary(rows) {
  if (!Array.isArray(rows)) throw new Error("DIRECTORY_CONTACT_CLEANUP_INVALID_REPORT");
  const zero = () => Object.fromEntries(DIRECTORY_CONTACT_CLEANUP_FIELDS.map(f => [f, 0]));
  const removable = zero(), unmigrated = zero(), protectedRows = zero();
  let profiles = 0;
  const byCategory = {};
  for (const row of rows) {
    if (!row || typeof row.category !== "string" || !row.category ||
        Object.hasOwn(byCategory,row.category) ||
        !Number.isSafeInteger(row.profiles) || row.profiles < 0)
      throw new Error("DIRECTORY_CONTACT_CLEANUP_INVALID_REPORT");
    profiles += row.profiles;
    const counts = {removable:zero(),unmigrated:zero(),protected:zero()};
    for (const field of DIRECTORY_CONTACT_CLEANUP_FIELDS) {
      for (const [category,suffix] of [["removable",""],["unmigrated","_unmigrated"],
        ["protected","_protected"]]) {
        const n = row[field + suffix];
        if (!Number.isSafeInteger(n) || n < 0 || n > row.profiles)
          throw new Error("DIRECTORY_CONTACT_CLEANUP_INVALID_REPORT");
        counts[category][field] = n;
        if (category==="removable") removable[field] += n;
        else if (category==="unmigrated") unmigrated[field] += n;
        else protectedRows[field] += n;
      }
      if (counts.removable[field]+counts.unmigrated[field]+counts.protected[field]>row.profiles)
        throw new Error("DIRECTORY_CONTACT_CLEANUP_INVALID_REPORT");
    }
    byCategory[row.category] = {profiles:row.profiles,...counts};
  }
  if (!Number.isSafeInteger(profiles)) throw new Error("DIRECTORY_CONTACT_CLEANUP_INVALID_REPORT");
  return {profiles, removable, unmigrated, protected:protectedRows, byCategory};
}
