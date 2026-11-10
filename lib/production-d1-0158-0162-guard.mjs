/**
 * Schema-only production completion for 0158 (directory read indexes)
 * and 0162 (lost/found public lead). The intervening 0159–0161
 * have their own protected, already-applied SQL rollouts.
 *
 * Do not insert migration-history receipts: these isolated operations
 * deliberately leave the older sequential D1 migration ledger unchanged.
 */
export const COMPLETION_0158_SQL = "0158_admin_directory_list_indexes.sql";
export const COMPLETION_0162_SQL = "0162_lost_found_short_description.sql";
export const COMPLETION_0158_BLOB = "23643f9e7ada0a1d2d19d9aa780a7420ae207927";
export const COMPLETION_0162_BLOB = "9a2b15d68e31f6415358f615883082efea5a1543";

export const DIRECTORY_0158_INDEX_SQL = Object.freeze([
  "CREATE INDEX IF NOT EXISTS directory_profiles_admin_updated_idx ON directory_profiles(updated_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS directory_profiles_admin_category_updated_idx ON directory_profiles(category, updated_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS directory_profiles_admin_status_updated_idx ON directory_profiles(status, updated_at DESC, id DESC)",
  "CREATE INDEX IF NOT EXISTS directory_profiles_admin_name_idx ON directory_profiles(name COLLATE NOCASE ASC, id ASC)",
  "CREATE INDEX IF NOT EXISTS directory_profiles_admin_city_name_idx ON directory_profiles(city COLLATE NOCASE ASC, name COLLATE NOCASE ASC, id ASC)",
]);
export const DIRECTORY_0158_INDEX_NAMES = Object.freeze(
  DIRECTORY_0158_INDEX_SQL.map((sql) => /^CREATE INDEX IF NOT EXISTS (\w+)/.exec(sql)[1]),
);
const EVENT_0160_COLUMNS = ["contact_phone", "contact_email", "admission_fee"];
const EVENT_0161_COLUMNS = ["image_alt", "internal_notes"];

function requireState(condition, error) {
  if (!condition) throw new Error(error);
}
export function normalizedDdl(sql) {
  return String(sql ?? "").replace(/\s+/g, " ").trim().replace(/;$/, "");
}
function validCount(n) {
  return Number.isSafeInteger(n) && n >= 0;
}

/** SQLite preserves index DDL with differences in quoting and whitespace.
 * Normalize only syntactic presentation, never column order, sort direction,
 * collation or partial-index WHERE clauses.
 */
export function canonicalIndexDdl(sql) {
  return normalizedDdl(sql)
    .replace(/["\x60\[\]]/g, "")
    .replace(/\bIF\s+NOT\s+EXISTS\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Fail closed on a half-installed index migration or a reused index name. */
export function classify0158({ tablePresent = false, columns = [], indexes = [], count = null } = {}) {
  requireState(tablePresent && validCount(count), "D1_0158_DIRECTORY_TABLE_OR_COUNT_MISSING");
  for (const name of ["id", "updated_at", "category", "status", "name", "city"])
    requireState(columns.some((column) => column.name === name), "D1_0158_BASE_COLUMN_MISSING_" + name);
  const seen = indexes.filter((entry) => DIRECTORY_0158_INDEX_NAMES.includes(entry.name));
  requireState(seen.length === new Set(seen.map((entry) => entry.name)).size,
    "D1_0158_DUPLICATE_INDEX_METADATA");
  // 0158 may already be partly installed. Verify every present index.
  // SQLite's reverse B-tree scan satisfies ORDER BY updated_at DESC, id DESC
  // with an existing (updated_at ASC, id ASC) index. Accept ONLY the observed
  // legacy shape for this index name: do not expand exemptions to mixed
  // directions, different columns, collations or other indexes.
  const legacyBackwardScanSql = [
    "CREATE INDEX directory_profiles_admin_updated_idx ON directory_profiles(updated_at,id)",
    "CREATE INDEX directory_profiles_admin_updated_idx ON directory_profiles(updated_at ASC,id ASC)",
  ].map(canonicalIndexDdl);
  const legacyCompatibleIndexes = [];
  const mismatches = [];
  for (let i = 0; i < DIRECTORY_0158_INDEX_NAMES.length; i += 1) {
    const index = seen.find((entry) => entry.name === DIRECTORY_0158_INDEX_NAMES[i]);
    if (!index) continue;
    const expected = DIRECTORY_0158_INDEX_SQL[i];
    const canonicalActual = canonicalIndexDdl(index.sql);
    const matching = canonicalActual === canonicalIndexDdl(expected);
    const legacyCompatible = i === 0 && legacyBackwardScanSql.includes(canonicalActual);
    const validOwner = index.type === "index" && index.tbl_name === "directory_profiles";
    if (validOwner && legacyCompatible && !matching) legacyCompatibleIndexes.push(index.name);
    if (!validOwner || (!matching && !legacyCompatible)) {
      mismatches.push({
        name: DIRECTORY_0158_INDEX_NAMES[i],
        existingTable: index.tbl_name,
        actualDdl: String(index.sql ?? "").slice(0, 600),
        expectedDdl: expected,
      });
    }
  }
  requireState(mismatches.length === 0,
    "D1_0158_INDEX_MISMATCH:" + JSON.stringify(mismatches));
  const missingIndexes = DIRECTORY_0158_INDEX_NAMES.filter(
    (name) => !seen.some((index) => index.name === name),
  );
  return {
    installed: missingIndexes.length === 0,
    count,
    presentIndexes: seen.map((index) => index.name),
    missingIndexes,
    legacyCompatibleIndexes,
  };
}

export function classify0162({ tablePresent = false, columns = [], count = null } = {}) {
  requireState(tablePresent && validCount(count), "D1_0162_LOST_FOUND_TABLE_OR_COUNT_MISSING");
  requireState(columns.some((column) => column.name === "id"), "D1_0162_REPORT_ID_MISSING");
  const values = columns.filter((column) => column.name === "short_description");
  requireState(values.length <= 1, "D1_0162_DUPLICATE_COLUMN");
  if (!values.length) return { installed: false, count };
  const column = values[0];
  requireState(String(column.type).toUpperCase() === "TEXT" &&
    Number(column.notnull) === 1 && String(column.dflt_value) === "''",
    "D1_0162_COLUMN_INCOMPATIBLE");
  return { installed: true, count };
}

/** Prevent accidental regression of the three previously applied migrations. */
export function assert0159to0161({ shadowTable = null, shadowIndex = null, eventColumns = [] } = {}) {
  requireState(shadowTable?.type === "table" && shadowTable.name === "breed_notion_workcopy_links",
    "D1_0159_SHADOW_TABLE_MISSING");
  requireState(shadowIndex?.type === "index" && shadowIndex.tbl_name === "breed_notion_workcopy_links",
    "D1_0159_SHADOW_INDEX_MISSING");
  const byName = new Map(eventColumns.map((column) => [column.name, column]));
  requireState(byName.has("id"), "D1_0160_EVENT_TABLE_MISSING");
  for (const name of [...EVENT_0160_COLUMNS, ...EVENT_0161_COLUMNS]) {
    const column = byName.get(name);
    requireState(column && String(column.type).toUpperCase() === "TEXT", "D1_EVENT_COLUMN_MISSING_" + name);
    const optional = name === "contact_phone" || name === "contact_email";
    requireState(optional
      ? Number(column.notnull) === 0 && column.dflt_value == null
      : Number(column.notnull) === 1 && String(column.dflt_value) === "''",
    "D1_EVENT_COLUMN_INCOMPATIBLE_" + name);
  }
  return { applied0159: true, applied0160: true, applied0161: true };
}
