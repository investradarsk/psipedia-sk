import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { HELP_SQL_REQUIRED_COLUMNS, inspectHelpSqlSchema } from "../lib/help-sql-schema-preflight.mjs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const models = [
  ["help_cases", "db/schema.ts", "helpCases"],
  ["help_organizations", "db/help-organization-schema.ts", "helpOrganizations"],
  ["adoption_dogs", "db/adoption-schema.ts", "adoptionDogs"],
  ["lost_found_dog_reports", "db/lost-found-dogs-schema.ts", "lostFoundDogReports"],
];

function sqliteFixture(options = {}) {
  const sqlite = new DatabaseSync(":memory:");
  for (const [table, columns] of Object.entries(HELP_SQL_REQUIRED_COLUMNS)) {
    if (table === options.omitTable) continue;
    const included = columns.filter((column) =>
      !(table === options.omitTableColumnTable && column === options.omitColumn));
    const fields = included.map((column) =>
      '"' + column + '" ' + (column === "id" || column === "report_id" ? "INTEGER PRIMARY KEY" : "TEXT"));
    sqlite.exec('CREATE TABLE "' + table + '" (' + fields.join(", ") + ')');
  }
  const queries = [];
  const database = {
    prepare(sql) {
      queries.push(sql);
      assert.match(sql, /^SELECT name FROM pragma_table_info\('[a-z_]+?'\)$/);
      return { async all() { return { results: sqlite.prepare(sql).all() }; } };
    },
  };
  return { sqlite, database, queries };
}

test("Help four Drizzle models mirror existing 0122 nullable display columns", () => {
  const migration = read("drizzle/0122_entity_image_display_config.sql");
  for (const [table, path, name] of models) {
    const source = read(path);
    const start = source.indexOf("export const " + name + " = sqliteTable(");
    assert.ok(start >= 0, path + ": missing canonical model");
    const end = source.indexOf("\n);", start);
    assert.ok(end > start, path + ": incomplete model");
    const model = source.slice(start, end);
    for (const [key, column] of [
      ["thumbnailDisplayJson", "thumbnail_display_json"],
      ["detailDisplayJson", "detail_display_json"],
    ]) {
      assert.equal(model.split(key + ":").length - 1, 1, path + ": exactly one " + key);
      assert.ok(model.includes(key + ': text("' + column + '"),'), path + ": nullable SQL mapping");
      assert.ok(migration.includes("ALTER TABLE " + table + " ADD COLUMN " + column + " TEXT;"),
        path + ": must be in already-existing migration 0122");
    }
  }
  assert.doesNotMatch(migration, /\b(?:DROP|DELETE|UPDATE)\b/);
});

test("0122 migration adds Help display columns without overwriting existing images", () => {
  const sqlite = new DatabaseSync(":memory:");
  try {
    for (const table of ["managed_events", "directory_profiles", ...models.map(([name]) => name)]) {
      sqlite.exec('CREATE TABLE "' + table + '" (id INTEGER PRIMARY KEY, image_url TEXT)');
      sqlite.prepare('INSERT INTO "' + table + '" (id,image_url) VALUES (1,?)').run("/existing.jpg");
    }
    sqlite.exec(read("drizzle/0122_entity_image_display_config.sql"));
    for (const [table] of models) {
      const columns = sqlite.prepare("SELECT name FROM pragma_table_info('" + table + "')").all().map((row) => row.name);
      assert.ok(columns.includes("thumbnail_display_json"), table);
      assert.ok(columns.includes("detail_display_json"), table);
      const record = sqlite.prepare('SELECT image_url,thumbnail_display_json,detail_display_json FROM "' + table + '"').get();
      assert.deepEqual({ ...record }, { image_url: "/existing.jpg", thumbnail_display_json: null, detail_display_json: null });
    }
  } finally {
    sqlite.close();
  }
});

test("Help read-only schema preflight confirms complete fixtures without writing", async () => {
  const { sqlite, database, queries } = sqliteFixture();
  try {
    const audit = await inspectHelpSqlSchema(database);
    assert.equal(audit.ready, true);
    assert.equal(audit.status, "ready");
    assert.equal(audit.tables.length, Object.keys(HELP_SQL_REQUIRED_COLUMNS).length);
    assert.equal(queries.length, audit.tables.length);
    assert.ok(audit.tables.every((row) => row.exists && row.missingColumns.length === 0));
  } finally { sqlite.close(); }
});

test("Help schema preflight fails closed on a missing column or entire table", async () => {
  const one = sqliteFixture({ omitTableColumnTable: "adoption_dogs", omitColumn: "detail_display_json" });
  const two = sqliteFixture({ omitTable: "lost_found_dog_private_details" });
  try {
    const missingColumn = await inspectHelpSqlSchema(one.database);
    assert.equal(missingColumn.ready, false);
    assert.equal(missingColumn.status, "blocked");
    assert.deepEqual(missingColumn.tables.find((row) => row.table === "adoption_dogs").missingColumns, ["detail_display_json"]);
    const missingTable = await inspectHelpSqlSchema(two.database);
    const blocked = missingTable.tables.find((row) => row.table === "lost_found_dog_private_details");
    assert.equal(missingTable.ready, false);
    assert.equal(blocked.exists, false);
    assert.deepEqual(blocked.missingColumns, [...HELP_SQL_REQUIRED_COLUMNS.lost_found_dog_private_details]);
  } finally { one.sqlite.close(); two.sqlite.close(); }
});

test("Help schema preflight refuses inaccessible or malformed database results", async () => {
  await assert.rejects(() => inspectHelpSqlSchema(null), /HELP_SQL_SCHEMA_DATABASE_UNAVAILABLE/);
  await assert.rejects(() => inspectHelpSqlSchema({ prepare: () => ({ all: async () => ({}) }) }), /HELP_SQL_SCHEMA_UNREADABLE/);
});
