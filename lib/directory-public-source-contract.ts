/**
 * The single compatibility read contract for legacy Directory source keys.
 *
 * The Admin/D1 canonical value takes precedence. An explicitly present
 * (even empty) canonical key is authoritative and never falls back to an
 * older import spelling. Missing canonical keys remain readable until
 * production D1 parity/backfill has been checked and approved.
 *
 * Technical _psipedia_* metadata is not part of this editorial contract.
 * All identifiers and JSON paths below are compile-time constants.
 */

const districtLegacyKey = "Okres";

const sourceFacetAliases = {
  breed: ["Plemeno", "Plemená"],
  fciGroup: ["FCI skupina", "FCI"],
  organization: ["Organizácia", "Zastrešujúca organizácia"],
  profileType: ["Typ služby", "Typ poskytovateľa", "Typ klubu"],
} as const;

type SourceFacet = keyof typeof sourceFacetAliases;

/** Accepted aliases are fixed to the actual public query shapes. */
type SourceAlias = "" | "profile";

function sqlColumn(alias: SourceAlias, column: "source_data_json" | "district") {
  return alias ? alias + "." + column : column;
}

function safeSourceJson(alias: SourceAlias): string {
  const column = sqlColumn(alias, "source_data_json");
  return "CASE WHEN json_valid(" + column + ") THEN " + column + " ELSE '{}' END";
}

function jsonText(json: string, key: string): string {
  // key is selected from fixed constants, never from user-controlled SQL.
  return "TRIM(CAST(json_extract(" + json + ", '$.\"" + key + "\"') AS TEXT))";
}

/**
 * A stored canonical key is an explicit decision, including when empty.
 * Only an ABSENT canonical key permits reading historical aliases.
 */
function firstSourceFacetSql(facet: SourceFacet, alias: SourceAlias = ""): string {
  const [primary, ...legacyAliases] = sourceFacetAliases[facet];
  const json = safeSourceJson(alias);
  const primaryValue = "COALESCE(" + jsonText(json, primary) + ", '')";
  const older = legacyAliases.map(key => "NULLIF(" + jsonText(json, key) + ", '')");
  const fallback = older.length ? "COALESCE(" + [...older, "''"].join(", ") + ")" : "''";
  return "CASE WHEN json_type(" + json + ", '$.\"" + primary +
    "\"') IS NOT NULL THEN " + primaryValue + " ELSE " + fallback + " END";
}

export const DIRECTORY_PUBLIC_SOURCE_FACETS = {
  breed: firstSourceFacetSql("breed"),
  fciGroup: firstSourceFacetSql("fciGroup"),
  organization: firstSourceFacetSql("organization"),
  profileType: firstSourceFacetSql("profileType"),
} as const;

/** Read the legacy district only for records without a canonical D1 district. */
export function directoryLegacyDistrictSql(alias: SourceAlias = ""): string {
  const json = safeSourceJson(alias);
  return "CASE WHEN json_type(" + json + ", '$.\"" + districtLegacyKey +
    "\"') IN ('text','integer','real') THEN NULLIF(TRIM(CAST(json_extract(" + json +
    ", '$.\"" + districtLegacyKey + "\"') AS TEXT)), '') ELSE NULL END";
}

/** Shared across public cards, filters, facet rollups and legacy search. */
export function directoryEffectiveDistrictSql(alias: SourceAlias = ""): string {
  return "COALESCE(NULLIF(TRIM(" + sqlColumn(alias, "district") + "), ''), " +
    directoryLegacyDistrictSql(alias) + ", '')";
}

/** Identical to the SQL precedence for the public row projection. */
export function directoryEffectiveDistrictValue(
  canonicalDistrict: string | null | undefined,
  historicalDistrict: unknown,
): string {
  const current = typeof canonicalDistrict === "string" ? canonicalDistrict.trim() : "";
  if (current) return current;
  if (typeof historicalDistrict !== "string" && typeof historicalDistrict !== "number") return "";
  return String(historicalDistrict).trim();
}
