/**
 * Read-only, request-scoped D1 facet rollups for public directory listings.
 * The option scopes intentionally differ: locations follow the active search
 * and non-location filters, while source facets follow published/category only.
 * No cross-request cache: public HTML already has a short edge TTL, and D1
 * publication / import mutations must become visible after that TTL.
 */
export type DirectorySourceFacetExpressions = {
  breeds: string;
  fciGroups: string;
  organizations: string;
  profileTypes: string;
};

const districtExpression = `COALESCE(NULLIF(district, ''), json_extract(source_data_json, '$."Okres"'), '')`;

/**
 * A single scan replaces three DISTINCT scans with different location scopes.
 * Placeholder order matters: SELECT CASE bindings precede the WHERE bindings.
 * Unmatched rows aggregate NULL; parseDirectoryFacetValues drops those nulls.
 */
export function directoryLocationFacetStatement(
  database: D1Database,
  baseWhere: string,
  baseBindings: unknown[],
  region: string,
  district: string,
) {
  const regionWhere = region ? "(region = ? OR region = ?)" : "1 = 1";
  const districtWhere = district ? `${districtExpression} = ?` : "1 = 1";
  const regionBindings = region ? [region, region.replace(/ kraj$/, "")] : [];
  const sql = [
    "SELECT",
    "  json_group_array(DISTINCT CASE WHEN region <> '' THEN region END) AS regions,",
    `  json_group_array(DISTINCT CASE WHEN ${regionWhere} AND ${districtExpression} <> '' THEN ${districtExpression} END) AS districts,`,
    `  json_group_array(DISTINCT CASE WHEN ${regionWhere} AND ${districtWhere} AND city <> '' THEN city END) AS cities`,
    `FROM directory_profiles WHERE ${baseWhere}`,
  ].join("\n");
  return database.prepare(sql).bind(
    ...regionBindings, ...regionBindings,
    ...(district ? [district] : []),
    ...baseBindings,
  );
}

/**
 * Four JSON metadata facets share one category-scoped table scan. Unlike
 * locations, these must not narrow when q, service or location is selected.
 */
export function directorySourceFacetStatement(
  database: D1Database,
  categoryWhere: string,
  categoryBindings: unknown[],
  expressions: DirectorySourceFacetExpressions,
) {
  const columns = (Object.entries(expressions) as Array<[keyof DirectorySourceFacetExpressions, string]>)
    .map(([alias, expression]) =>
      `json_group_array(DISTINCT trim(CAST(${expression} AS TEXT))) AS ${alias}`);
  return database.prepare(`SELECT ${columns.join(", ")} FROM directory_profiles WHERE ${categoryWhere}`)
    .bind(...categoryBindings);
}

/**
 * SQLite BINARY compares UTF-8 bytes. For valid Unicode scalars this equals
 * code-point order, whereas JavaScript's default UTF-16 sort differs for emoji.
 */
function compareSqliteBinary(left: string, right: string): number {
  let a = 0;
  let b = 0;
  while (a < left.length && b < right.length) {
    const codeA = left.codePointAt(a)!;
    const codeB = right.codePointAt(b)!;
    if (codeA !== codeB) return codeA - codeB;
    a += codeA > 0xffff ? 2 : 1;
    b += codeB > 0xffff ? 2 : 1;
  }
  return (a < left.length ? 1 : 0) - (b < right.length ? 1 : 0);
}

/**
 * Sort BEFORE trimming: legacy DISTINCT and ORDER BY ran on the raw location
 * value, then normalized values in JavaScript. Source facets were already
 * trimmed in SQL. Do not deduplicate after trim or change location option
 * order when two distinct source values differ only by whitespace.
 */
export function parseDirectoryFacetValues(raw: unknown): string[] {
  if (typeof raw !== "string") return [];
  const decoded: unknown = JSON.parse(raw);
  if (!Array.isArray(decoded)) return [];
  return decoded
    .filter((value): value is string => typeof value === "string")
    .sort(compareSqliteBinary)
    .map((value) => value.trim())
    .filter(Boolean);
}
