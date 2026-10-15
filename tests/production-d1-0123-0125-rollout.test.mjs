import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_PRODUCTION_TARGETS,
  PREPARED_PRODUCTION_TARGETS,
  assertStructuredAddressSchema,
  assertGeminiNotionReviewLocksSchema,
  assertGeminiCategoryPromptsSchema,
  assertRolloutChainSchema,
  assertPendingTargetSchemaClean,
  assertAdditiveRolloutPreserved,
  targetSchemaObjects,
  selectMigrationsThrough,
  validateProductionTargetHistory,
} from "../scripts/production-d1-migrate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  "0123_event_organization_structured_address.sql",
  "0124_gemini_notion_review_locks.sql",
  "0125_gemini_category_prompts.sql",
];
const readSql = (name) => readFileSync(path.join(root, "drizzle", name), "utf8");
function emptyDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE managed_events (id TEXT PRIMARY KEY, title TEXT NOT NULL);");
  db.exec("CREATE TABLE organization_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL);");
  db.exec("INSERT INTO managed_events (id,title) VALUES ('event-1','Existing event')");
  db.exec("INSERT INTO organization_locations (id,name) VALUES ('location-1','Existing location')");
  return db;
}
function applySql(db, name) {
  db.exec(readSql(name).replaceAll("--> statement-breakpoint", "\n"));
}
function schema(db) {
  const columns = (table) => db.prepare("PRAGMA table_info('" + table + "')").all();
  return {
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    managedEventColumns: columns("managed_events"),
    organizationLocationColumns: columns("organization_locations"),
    geminiNotionReviewLockColumns: columns("gemini_notion_review_locks"),
    geminiCategoryPromptColumns: columns("gemini_category_prompts"),
  };
}
test("three targets are fully supported and mobile GitHub dispatch remains explicit, manual and protected", () => {
  assert.deepEqual(SUPPORTED_PRODUCTION_TARGETS.slice(-5, -2), targets);
  for (const target of targets) assert.equal(PREPARED_PRODUCTION_TARGETS.includes(target), false);
  const workflow = readFileSync(path.join(root, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  for (const target of targets) {
    assert.ok(workflow.includes("- " + target));
    assert.ok(workflow.includes("APPLY-" + target.slice(0, 4) + "-psipedia-sk-db"));
  }
  assert.doesNotMatch(workflow, /\bpush:\s*\n|\bschedule:\s*\n|wrangler deploy|d1 time-travel restore/);
});
test("scoped chain does not stage a future migration and refuses gaps", () => {
  const files = Array.from({ length: 123 }, (_, n) => String(n).padStart(4, "0") + "_fixture.sql").concat(targets, ["0126_future.sql"]);
  const selected = selectMigrationsThrough(files, targets[0]);
  assert.equal(selected.selected.at(-1), targets[0]);
  assert.deepEqual(selected.excludedFuture, [...targets.slice(1), "0126_future.sql"]);
  assert.equal(selectMigrationsThrough(files, targets[1]).selected.at(-1), targets[1]);
  assert.equal(selectMigrationsThrough(files, targets[2]).selected.at(-1), targets[2]);
  assert.throws(() => selectMigrationsThrough(files.filter(name => !name.startsWith("0124_")), targets[2]), /gap before target: 0124/);
});
test("0123 preserves existing rows, validates all nine columns and rejects invalid address enum", () => {
  const db = emptyDatabase();
  const before = db.prepare("SELECT id,title FROM managed_events").all();
  assert.deepEqual(targetSchemaObjects(schema(db), targets[0]), { partial: false });
  assert.doesNotThrow(() => assertRolloutChainSchema(schema(db), targets[0]));
  applySql(db, targets[0]);
  assert.deepEqual(targetSchemaObjects(schema(db), targets[0]), { partial: true });
  assert.doesNotThrow(() => assertStructuredAddressSchema(schema(db)));
  assert.deepEqual(db.prepare("SELECT id,title FROM managed_events").all(), before);
  assert.equal(db.prepare("SELECT address_format FROM managed_events").get().address_format, "");
  assert.throws(() => db.exec("UPDATE managed_events SET address_format='INVALID'"), /CHECK constraint failed/);
  assert.throws(() => db.exec("UPDATE organization_locations SET address_format='INVALID'"), /CHECK constraint failed/);
  assert.doesNotThrow(() => db.exec("UPDATE managed_events SET address_format='STREET'"));
  assert.doesNotThrow(() => db.exec("UPDATE organization_locations SET address_format='MUNICIPALITY_NUMBER'"));
  db.close();
});
test("0123 partial ADD COLUMN, wrong TEXT default, and missing CHECK are rejected", () => {
  const db = emptyDatabase();
  db.exec("ALTER TABLE managed_events ADD COLUMN district TEXT NOT NULL DEFAULT ''");
  const partial = schema(db);
  assert.deepEqual(targetSchemaObjects(partial, targets[0]), { partial: true });
  assert.throws(() => assertPendingTargetSchemaClean(targets[0], targetSchemaObjects(partial, targets[0])), /partial\/manual drift/);
  assert.throws(() => assertStructuredAddressSchema(partial), /missing/);
  db.close();

  const applied = emptyDatabase();
  applySql(applied, targets[0]);
  const wrong = schema(applied);
  wrong.managedEventColumns.find(row => row.name === "district").dflt_value = "'x'";
  assert.throws(() => assertStructuredAddressSchema(wrong), /invalid default/);
  const noCheck = schema(applied);
  noCheck.objects.find(row => row.name === "managed_events").sql = "CREATE TABLE managed_events (id TEXT PRIMARY KEY)";
  assert.throws(() => assertStructuredAddressSchema(noCheck), /CHECK constraint mismatch/);
  applied.close();
});
test("0124 requires 0123 and validates lock PK, column contract and UTC default", () => {
  const db = emptyDatabase();
  assert.throws(() => assertRolloutChainSchema(schema(db), targets[1]), /missing/);
  applySql(db, targets[0]);
  assert.doesNotThrow(() => assertRolloutChainSchema(schema(db), targets[1]));
  applySql(db, targets[1]);
  assert.doesNotThrow(() => assertGeminiNotionReviewLocksSchema(schema(db)));
  assert.deepEqual(targetSchemaObjects(schema(db), targets[1]), { partial: true });
  const altered = schema(db);
  altered.geminiNotionReviewLockColumns.find(row => row.name === "notion_page_id").pk = 0;
  assert.throws(() => assertGeminiNotionReviewLocksSchema(altered), /primary key/);
  assert.throws(() => db.exec("INSERT INTO gemini_notion_review_locks (notion_page_id,owner) VALUES ('a','worker'),('a','worker')"), /UNIQUE constraint failed/);
  db.close();
});
test("0125 requires 0124 and validates full prompt schema, PK and CHECK boundaries", () => {
  const db = emptyDatabase();
  applySql(db, targets[0]);
  assert.throws(() => assertRolloutChainSchema(schema(db), targets[2]), /Missing gemini_notion_review_locks/);
  applySql(db, targets[1]);
  assert.doesNotThrow(() => assertRolloutChainSchema(schema(db), targets[2]));
  applySql(db, targets[2]);
  assert.doesNotThrow(() => assertGeminiCategoryPromptsSchema(schema(db)));
  assert.equal(db.prepare("SELECT count(*) AS n FROM gemini_category_prompts").get().n, 0);
  assert.throws(() => db.exec("INSERT INTO gemini_category_prompts (stable_key,user_prompt) VALUES ('x','short')"), /CHECK constraint failed/);
  const good = "x".repeat(40);
  db.prepare("INSERT INTO gemini_category_prompts (stable_key,user_prompt) VALUES (?,?)").run("first", good);
  assert.throws(() => db.prepare("INSERT INTO gemini_category_prompts (stable_key,user_prompt) VALUES (?,?)").run("first", good), /UNIQUE constraint failed/);
  assert.throws(() => db.prepare("INSERT INTO gemini_category_prompts (stable_key,user_prompt) VALUES (?,?)").run("long", "x".repeat(6001)), /CHECK constraint failed/);
  const noCheck = schema(db);
  noCheck.objects.find(row => row.name === "gemini_category_prompts").sql =
    "CREATE TABLE gemini_category_prompts (stable_key TEXT PRIMARY KEY NOT NULL, user_prompt TEXT NOT NULL, updated_at TEXT NOT NULL)";
  assert.throws(() => assertGeminiCategoryPromptsSchema(noCheck), /CHECK/);
  const noPrimaryKey = schema(db);
  noPrimaryKey.geminiCategoryPromptColumns.find(row => row.name === "stable_key").pk = 0;
  assert.throws(() => assertGeminiCategoryPromptsSchema(noPrimaryKey), /primary key/);
  db.close();
});
test("future schema drift blocks earlier stages even if their own schema is pristine", () => {
  const db = emptyDatabase();
  db.exec("CREATE TABLE gemini_category_prompts (stable_key TEXT)");
  assert.throws(() => assertRolloutChainSchema(schema(db), targets[0]), /0125.*partial\/manual drift/);
  db.close();
});
test("migration ledger requires exact ordered prefix and refuses skipping targets", () => {
  const expected = Array.from({ length: 123 }, (_, n) => String(n).padStart(4, "0") + "_fixture.sql").concat(targets);
  for (let n = 0; n < 3; n++) {
    const target = targets[n], through = expected.slice(0, 124 + n);
    assert.deepEqual(validateProductionTargetHistory(through.slice(0, -1), through, target),
      { latestIndex: 122 + n, targetApplied: false });
    assert.deepEqual(validateProductionTargetHistory(through, through, target),
      { latestIndex: 123 + n, targetApplied: true });
    assert.throws(() => validateProductionTargetHistory(through.slice(0, -2), through, target), /expected exactly/);
  }
  assert.throws(() => validateProductionTargetHistory([...expected.slice(0, 123), targets[1]], expected.slice(0, 125), targets[1]), /Target history guard.*does not exactly match/);
});
test("postflight preservation rejects a changed event row or organization location", () => {
  const before = { tables: { managed_events: { count: 1, digest: "one" }, organization_locations: { count: 2, digest: "two" } } };
  assert.doesNotThrow(() => assertAdditiveRolloutPreserved(before, structuredClone(before)));
  const differentEvent = structuredClone(before);
  differentEvent.tables.managed_events.digest = "modified";
  assert.throws(() => assertAdditiveRolloutPreserved(before, differentEvent), /managed_events data changed/);
  const missingLocation = structuredClone(before);
  missingLocation.tables.organization_locations.count = 1;
  assert.throws(() => assertAdditiveRolloutPreserved(before, missingLocation), /organization_locations data changed/);
});
