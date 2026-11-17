/**
 * Owner-only isolated D1 schema bootstrap for station ↔ kennel club links.
 * No legacy backfill, unrelated migrations, ledger edits, or deletes.
 */
export const BREEDER_0169_FILE = "0169_directory_breeder_club_relations.sql";
export const BREEDER_0169_GIT_BLOB = "b6c899d2c5f1ae72231d7abeed560b68ab2702cf";
export const BREEDER_0169_OBJECTS = Object.freeze([
  "directory_breeder_club_relations",
  "directory_breeder_club_relations_unique",
  "directory_breeder_club_relations_club_idx",
]);
export const BREEDER_0169_DEPENDENCIES = Object.freeze([
  "d1_migrations", "directory_profiles", "managed_breeds", "breed_directory_relations",
]);

const must = (ok, code) => {
  if (!ok) throw new Error("BREEDER_0169_" + code);
};

export function normalizeBreeder0169Ddl(sql) {
  return String(sql ?? "")
    .replace(/[`"]/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .replace(/;\s*$/, "")
    .trim().toUpperCase();
}

export function assertBreeder0169PinnedDdl(sql) {
  const unCommented = String(sql ?? "").split("\n")
    .filter(line => !line.trimStart().startsWith("--")).join("\n");
  const statements = unCommented.split(";").map(part => part.trim()).filter(Boolean);
  must(statements.length === 3, "DDL_COUNT");
  const patterns = [
    /^CREATE\s+TABLE\s+`directory_breeder_club_relations`\s*\(/i,
    /^CREATE\s+UNIQUE\s+INDEX\s+`directory_breeder_club_relations_unique`\s+ON\s+`directory_breeder_club_relations`\s*\(/i,
    /^CREATE\s+INDEX\s+`directory_breeder_club_relations_club_idx`\s+ON\s+`directory_breeder_club_relations`\s*\(/i,
  ];
  statements.forEach((statement, index) => {
    must(patterns[index].test(statement), "UNEXPECTED_DDL_" + index);
    must(!/\b(?:DROP|ALTER|DELETE|INSERT|UPDATE|REPLACE|ATTACH|PRAGMA)\b/i.test(statement),
      "NON_ADDITIVE_SQL");
  });
  const table = normalizeBreeder0169Ddl(statements[0]);
  must(table.includes("STATION_PROFILE_ID INTEGER NOT NULL") &&
    table.includes("CLUB_PROFILE_ID INTEGER NOT NULL") &&
    table.includes("CREATED_AT TEXT NOT NULL") &&
    table.includes("CREATED_BY TEXT NOT NULL"), "COLUMN_CONTRACT");
  must(normalizeBreeder0169Ddl(statements[1]).includes("(STATION_PROFILE_ID,CLUB_PROFILE_ID)"),
    "UNIQUE_ORDER");
  must(normalizeBreeder0169Ddl(statements[2]).includes("(CLUB_PROFILE_ID,STATION_PROFILE_ID)"),
    "REVERSE_INDEX_ORDER");
  return statements.map((statement, i) => ({
    name: BREEDER_0169_OBJECTS[i],
    type: i === 0 ? "table" : "index",
    sql: normalizeBreeder0169Ddl(statement),
  }));
}

export function assertBreeder0169State({
  sql, rows, historyNames, columns, indexes, indexColumns, originalCount,
}) {
  must(Array.isArray(rows) && Array.isArray(historyNames), "INVALID_CATALOG");
  const expected = assertBreeder0169PinnedDdl(sql);
  const byName = new Map(rows.map(row => [row.name, row]));
  for (const table of BREEDER_0169_DEPENDENCIES)
    must(byName.get(table)?.type === "table", "DEPENDENCY_MISSING_" + table);
  must(historyNames.includes("0162_lost_found_short_description.sql"),
    "LAST_VERIFIED_LEDGER_0162_MISSING");
  const present = expected.filter(item => byName.has(item.name));
  must(present.length === 0 || present.length === 3, "PARTIAL_SCHEMA_STOP");
  if (present.length === 0) {
    must(!historyNames.includes(BREEDER_0169_FILE), "LEDGER_CLAIMS_MISSING_SCHEMA");
    return { installed: false, readyToApply: true, originalCount };
  }
  for (const item of expected) {
    const actual = byName.get(item.name);
    must(actual.type === item.type && normalizeBreeder0169Ddl(actual.sql) === item.sql,
      "INCOMPATIBLE_OBJECT_" + item.name);
  }
  const correctColumns = [
    ["station_profile_id", "INTEGER"], ["club_profile_id", "INTEGER"],
    ["created_at", "TEXT"], ["created_by", "TEXT"],
  ];
  must(Array.isArray(columns) && columns.length === 4, "INVALID_TABLE_COLUMNS");
  correctColumns.forEach(([name, type], index) => {
    const col = columns[index];
    must(col.name === name && String(col.type).toUpperCase() === type &&
      Number(col.notnull) === 1 && Number(col.pk) === 0, "BAD_COLUMN_" + name);
  });
  must(Array.isArray(indexes), "INVALID_INDEX_LIST");
  const byIndex = new Map(indexes.map(item => [item.name, item]));
  must(Number(byIndex.get(BREEDER_0169_OBJECTS[1])?.unique) === 1, "UNIQUE_INDEX_MISSING");
  must(Number(byIndex.get(BREEDER_0169_OBJECTS[2])?.unique) === 0, "REVERSE_INDEX_MISSING");
  must(JSON.stringify(indexColumns?.[BREEDER_0169_OBJECTS[1]]) ===
    JSON.stringify(["station_profile_id", "club_profile_id"]), "BAD_UNIQUE_COLUMNS");
  must(JSON.stringify(indexColumns?.[BREEDER_0169_OBJECTS[2]]) ===
    JSON.stringify(["club_profile_id", "station_profile_id"]), "BAD_REVERSE_COLUMNS");
  must(Number.isInteger(originalCount) && originalCount >= 0, "INVALID_RELATION_COUNT");
  return { installed: true, readyToApply: false, originalCount };
}
