/**
 * Read-only review queue for the remaining Directory historical JSON fallbacks.
 *
 * Prints a SELECT query. Never connects to production or writes data.
 * Outputs only numeric Psipedia IDs, category, publication status, field name
 * and a fixed issue label. Never selects values, contacts, names or raw JSON.
 *
 * This is NOT an auto-migration plan: a blank district can be an intentional
 * clear, and text breed/club labels are not authoritative relation IDs.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const safeJson = "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END";
const pathFor = key => '$."' + key + '"';
const value = key => "TRIM(COALESCE(CAST(json_extract(" + safeJson + ", '" + pathFor(key) + "') AS TEXT), ''))";
const missing = key => "json_type(" + safeJson + ", '" + pathFor(key) + "') IS NULL";
const present = key => "json_type(" + safeJson + ", '" + pathFor(key) + "') IS NOT NULL";
const firstNonempty = keys => "COALESCE(" +
  keys.map(key => "NULLIF(" + value(key) + ", '')").join(", ") + ", '')";

/** Up to 500 bounded candidates ordered by risk, for manual triage by profile ID. */
export function buildDirectoryLegacyCutoverCandidatesSql() {
  const canonicalDistrict = "TRIM(COALESCE(district, ''))";
  const checks = [
    ["invalid_json", "source_data_json", "invalid_json", "NOT json_valid(source_data_json)", 0],
    ["district", "Okres", "legacy_only",
      canonicalDistrict + " = '' AND " + value("Okres") + " <> ''", 1],
    ["district", "Okres", "conflict",
      canonicalDistrict + " <> '' AND " + value("Okres") + " <> '' AND " +
      canonicalDistrict + " <> " + value("Okres"), 1],
  ];
  const aliases = [
    ["organization", "Organizácia", ["Zastrešujúca organizácia"]],
    ["breed", "Plemeno", ["Plemená"]],
    ["fci_group", "FCI skupina", ["FCI"]],
    ["hours", "Ordinačné hodiny",
      ["Otváracie hodiny", "Otváracia doba", "Ordinačná doba", "Pracovná doba"]],
    ["coverage", "Pokrytie", ["Oblasť pôsobenia", "Lokalita / pokrytie"]],
  ];
  for (const [field, canonical, oldKeys] of aliases) {
    const older = firstNonempty(oldKeys);
    checks.push([field, canonical, "legacy_only",
      "(" + missing(canonical) + ") AND " + older + " <> ''", 2]);
    checks.push([field, canonical, "explicit_clear_with_legacy",
      "(" + present(canonical) + ") AND " + value(canonical) + " = '' AND " +
      older + " <> ''", 1]);
    checks.push([field, canonical, "conflict",
      "(" + present(canonical) + ") AND " + value(canonical) + " <> '' AND " +
      older + " <> '' AND " + value(canonical) + " <> " + older, 1]);
  }
  // All literals are fixed in this source code; no dynamic SQL parameters.
  // Do not add contact columns or the source_data_json payload to this output.
  const selects = checks.map(([field, canonicalKey, issue, where, priority]) =>
    "SELECT id AS psipedia_id, category, status, '" + field +
    "' AS field, '" + canonicalKey + "' AS canonical_key, '" + issue +
    "' AS issue, " + priority + " AS priority FROM directory_profiles WHERE " + where);
  return "SELECT psipedia_id, category, status, field, canonical_key, issue\n" +
    "FROM (\n" + selects.join("\nUNION ALL\n") +
    "\n)\nORDER BY priority, category, psipedia_id, field, issue LIMIT 500;";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(buildDirectoryLegacyCutoverCandidatesSql() + "\n");
}
