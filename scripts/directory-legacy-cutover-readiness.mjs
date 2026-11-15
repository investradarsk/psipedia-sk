/**
 * Directory phase 4/4 – read-only SQL inventory of historical public fallbacks.
 *
 * Run only on an authorized, read-only D1 connection. This tool prints SELECT
 * SQL; it NEVER connects to production or performs backfills/deletes.
 * Every output column is a count. Names, addresses, contacts and JSON
 * payloads are not selected.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = "CASE WHEN json_valid(source_data_json) THEN source_data_json ELSE '{}' END";
function value(key) {
  // Called only with fixed code literals, never a user-supplied field.
  return "TRIM(COALESCE(CAST(json_extract(" + source + ", '$.\"" + key + "\"') AS TEXT), ''))";
}
function absent(key) {
  return "json_type(" + source + ", '$.\"" + key + "\"') IS NULL";
}
function older(keys) {
  return "COALESCE(" + keys.map(key => "NULLIF(" + value(key) + ", '')").join(", ") + ", '')";
}
function count(condition, name) {
  return "  SUM(CASE WHEN " + condition + " THEN 1 ELSE 0 END) AS " + name;
}

export function buildDirectoryLegacyCutoverReadinessSql() {
  const district = "TRIM(COALESCE(district, ''))";
  const okres = value("Okres");
  const org = value("Organizácia");
  const oldOrg = value("Zastrešujúca organizácia");
  const breed = value("Plemeno");
  const oldBreed = value("Plemená");
  const fci = value("FCI skupina");
  const oldFci = value("FCI");
  const hours = older(["Otváracie hodiny", "Otváracia doba", "Ordinačná doba", "Pracovná doba"]);
  const coverage = older(["Oblasť pôsobenia", "Lokalita / pokrytie"]);
  const technical = "EXISTS (SELECT 1 FROM json_each(" + source +
    ") AS item WHERE substr(item.key, 1, 10) = '_psipedia_')";

  const columns = [
    "  category",
    "  status",
    "  COUNT(*) AS total_profiles",
    count("NOT json_valid(source_data_json)", "invalid_json"),
    count(district + " = '' AND " + okres + " <> ''", "district_legacy_only"),
    count(district + " <> '' AND " + okres + " <> '' AND " +
      district + " <> " + okres, "district_conflict"),
    count(absent("Organizácia") + " AND " + oldOrg + " <> ''", "organization_legacy_only"),
    count("NOT (" + absent("Organizácia") + ") AND " + oldOrg +
      " <> '' AND " + org + " <> " + oldOrg, "organization_conflict_or_cleared"),
    count(absent("Plemeno") + " AND " + oldBreed + " <> ''", "breed_legacy_only"),
    count("NOT (" + absent("Plemeno") + ") AND " + oldBreed +
      " <> '' AND " + breed + " <> " + oldBreed, "breed_conflict_or_cleared"),
    count(absent("FCI skupina") + " AND " + oldFci + " <> ''", "fci_legacy_only"),
    count("NOT (" + absent("FCI skupina") + ") AND " + oldFci +
      " <> '' AND " + fci + " <> " + oldFci, "fci_conflict_or_cleared"),
    count(absent("Ordinačné hodiny") + " AND " + hours +
      " <> ''", "hours_legacy_only"),
    count(absent("Pokrytie") + " AND " + coverage +
      " <> ''", "coverage_legacy_only"),
    count(technical, "profiles_with_technical_json_dependencies"),
  ];
  return "SELECT\n" + columns.join(",\n") +
    "\nFROM directory_profiles\nGROUP BY category, status\nORDER BY category, status;";
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.stdout.write(buildDirectoryLegacyCutoverReadinessSql() + "\n");
}
