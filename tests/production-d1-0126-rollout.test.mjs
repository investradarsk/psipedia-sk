import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_PRODUCTION_TARGETS, PREPARED_PRODUCTION_TARGETS,
  selectMigrationsThrough, validateProductionTargetHistory,
  targetSchemaObjects, assertPendingTargetSchemaClean, assertRolloutChainSchema,
  assertGeminiSchedulerWeeklyDaySchema, assertGeminiSchedulerSettingsPreserved,
} from "../scripts/production-d1-migrate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = "0126_gemini_scheduler_admin_v2.sql";
const stages = [
  "0123_event_organization_structured_address.sql",
  "0124_gemini_notion_review_locks.sql",
  "0125_gemini_category_prompts.sql", target,
];
const sql = name => readFileSync(path.join(root, "drizzle", name), "utf8");

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE managed_events (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE organization_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE gemini_automation_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stable_key TEXT NOT NULL UNIQUE,
      section TEXT NOT NULL,
      subcategory TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0, 1)),
      cadence_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (cadence_minutes BETWEEN 5 AND 43200),
      max_new_concepts INTEGER NOT NULL DEFAULT 5 CHECK (max_new_concepts BETWEEN 0 AND 100),
      last_run_at TEXT, next_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));
    INSERT INTO gemini_automation_settings
      (stable_key, section, subcategory, enabled, cadence_minutes, max_new_concepts, last_run_at, next_run_at)
    VALUES
      ('directory.salon', 'directory', 'salon', 1, 1440, 3, '2026-10-14T08:00:00Z', '2026-10-16T08:00:00Z'),
      ('help.adopcia', 'help', 'adopcia', 0, 10080, 5, NULL, '2026-10-20T08:00:00Z');
  `);
  return db;
}

function schema(db) {
  const cols = table => db.prepare("PRAGMA table_info('" + table + "')").all();
  return {
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    managedEventColumns: cols("managed_events"),
    organizationLocationColumns: cols("organization_locations"),
    geminiNotionReviewLockColumns: cols("gemini_notion_review_locks"),
    geminiCategoryPromptColumns: cols("gemini_category_prompts"),
    geminiAutomationSettingsColumns: cols("gemini_automation_settings"),
  };
}
function apply(db, name) { db.exec(sql(name).replaceAll("--> statement-breakpoint", "\n")); }

test("0126 is a single manual production target and cannot be run on unapproved workflow triggers", () => {
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-1), target);
  assert.equal(PREPARED_PRODUCTION_TARGETS.includes(target), false);
  const flow = readFileSync(path.join(root, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.match(flow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(flow, /environment: production/);
  assert.match(flow, /test "\$GITHUB_REF" = "refs\/heads\/main"/);
  assert.match(flow, /git rev-parse origin\/main/);
  assert.match(flow, /production-d1-migration/);
  assert.ok(flow.includes("- " + target));
  assert.ok(flow.includes("APPLY-0126-psipedia-sk-db"));
  assert.match(flow, /Time Travel recovery point/);
  assert.doesNotMatch(flow, /^\s*(push|schedule|pull_request):/m);
  assert.doesNotMatch(flow, /wrangler deploy|d1 time-travel restore/);
});

test("0126 is the exact additive weekly_day SQL and never touches existing rows", () => {
  const migration = sql(target);
  assert.match(migration, /ALTER TABLE gemini_automation_settings ADD COLUMN weekly_day INTEGER/);
  assert.match(migration, /weekly_day IS NULL OR weekly_day BETWEEN 1 AND 7/);
  assert.doesNotMatch(migration.replace(/--[^\n]*/g, ""), /\b(UPDATE|DELETE|INSERT|DROP|CREATE TABLE)\b/i);
  assert.equal((migration.match(/ALTER TABLE/g) ?? []).length, 1);
});

test("full 0123-0126 chain refuses gaps and execution before 0125", () => {
  const files = Array.from({ length: 123 }, (_, n) => String(n).padStart(4, "0") + "_fixture.sql")
    .concat(stages, ["0127_future.sql"]);
  const selected = selectMigrationsThrough(files, target);
  assert.equal(selected.selected.at(-1), target);
  assert.deepEqual(selected.excludedFuture, ["0127_future.sql"]);
  assert.throws(() => selectMigrationsThrough(files.filter(n => !n.startsWith("0125_")), target), /gap before target: 0125/);
  const expected = selected.selected;
  assert.deepEqual(validateProductionTargetHistory(expected.slice(0, -1), expected, target),
    { latestIndex: 125, targetApplied: false });
  assert.deepEqual(validateProductionTargetHistory(expected, expected, target),
    { latestIndex: 126, targetApplied: true });
  assert.throws(() => validateProductionTargetHistory(expected.slice(0, -2), expected, target), /expected exactly 0125/);
  assert.throws(() => validateProductionTargetHistory(expected.slice(0, -1).concat("0126_wrong.sql"), expected, target), /does not exactly match/);
});

test("0126 preserves every stored category, enabled flag, cadence, quota and due timestamp", () => {
  const db = fixture();
  const before = db.prepare("SELECT * FROM gemini_automation_settings ORDER BY id").all();
  for (const name of stages.slice(0, 3)) apply(db, name);
  assert.doesNotThrow(() => assertRolloutChainSchema(schema(db), target));
  assert.deepEqual(targetSchemaObjects(schema(db), target), { partial: false });
  apply(db, target);
  assert.deepEqual(targetSchemaObjects(schema(db), target), { partial: true });
  assert.doesNotThrow(() => assertGeminiSchedulerWeeklyDaySchema(schema(db)));
  assert.deepEqual(db.prepare("SELECT * FROM gemini_automation_settings ORDER BY id").all()
    .map(({ weekly_day, ...legacy }) => legacy), before);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gemini_automation_settings WHERE weekly_day IS NOT NULL").get().n, 0);
  assert.throws(() => db.exec("UPDATE gemini_automation_settings SET weekly_day=0"), /CHECK constraint failed/);
  assert.throws(() => db.exec("UPDATE gemini_automation_settings SET weekly_day=8"), /CHECK constraint failed/);
  db.exec("UPDATE gemini_automation_settings SET weekly_day=1 WHERE id=1");
  db.exec("UPDATE gemini_automation_settings SET weekly_day=7 WHERE id=2");
  assert.equal(db.prepare("SELECT weekly_day FROM gemini_automation_settings WHERE id=1").get().weekly_day, 1);
  assert.equal(db.prepare("SELECT weekly_day FROM gemini_automation_settings WHERE id=2").get().weekly_day, 7);
  db.exec("UPDATE gemini_automation_settings SET weekly_day=NULL");
  db.close();
});

test("0126 partial/manual schema and malformed constraints fail closed", () => {
  const db = fixture();
  for (const name of stages.slice(0, 3)) apply(db, name);
  db.exec("ALTER TABLE gemini_automation_settings ADD COLUMN weekly_day INTEGER");
  assert.throws(() => assertPendingTargetSchemaClean(target, targetSchemaObjects(schema(db), target)), /partial\/manual drift/);
  assert.throws(() => assertGeminiSchedulerWeeklyDaySchema(schema(db)), /CHECK/);
  db.close();
  const good = fixture();
  for (const name of stages) apply(good, name);
  const altered = schema(good);
  altered.geminiAutomationSettingsColumns.find(c => c.name === "weekly_day").dflt_value = "0";
  assert.throws(() => assertGeminiSchedulerWeeklyDaySchema(altered), /nullable/);
  const malformed = schema(good);
  malformed.objects.find(o => o.name === "gemini_automation_settings").sql =
    "CREATE TABLE gemini_automation_settings (id INTEGER PRIMARY KEY, weekly_day INTEGER)";
  assert.throws(() => assertGeminiSchedulerWeeklyDaySchema(malformed), /CHECK/);
  good.close();
});

test("postflight preservation fails on any changed legacy schedule or enabled category", () => {
  const before = { columns: ["id","enabled","cadence_minutes","next_run_at"], count: 2, digest: "original" };
  assert.doesNotThrow(() => assertGeminiSchedulerSettingsPreserved(before, structuredClone(before)));
  assert.throws(() => assertGeminiSchedulerSettingsPreserved(before, { ...before, digest: "modified" }), /changed/);
  assert.throws(() => assertGeminiSchedulerSettingsPreserved(before, { ...before, count: 1 }), /changed/);
  assert.throws(() => assertGeminiSchedulerSettingsPreserved(before, { ...before, columns: ["id"] }), /changed/);
});
