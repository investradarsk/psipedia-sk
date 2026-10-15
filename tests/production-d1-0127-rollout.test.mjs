import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  APPROVED_0127_SHA256, PREPARED_PRODUCTION_TARGETS, SUPPORTED_PRODUCTION_TARGETS,
  assert0127NotAlreadyApplied, assertApproved0127Target,
  assertGeminiNotionCreatedPagesSchema, assertPendingTargetSchemaClean,
  assertRolloutChainSchema, selectMigrationsThrough, targetSchemaObjects,
  validateProductionTargetHistory, prepareScopedMigration,
} from "../scripts/production-d1-migrate.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = "0127_gemini_notion_created_pages.sql";
const prev = "0126_gemini_scheduler_admin_v2.sql";
const sql = name => readFileSync(path.join(root, "drizzle", name), "utf8");
const stages = [
  "0123_event_organization_structured_address.sql",
  "0124_gemini_notion_review_locks.sql",
  "0125_gemini_category_prompts.sql", prev,
];

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE managed_events (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE organization_locations (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE gemini_automation_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, stable_key TEXT NOT NULL UNIQUE,
      section TEXT NOT NULL, subcategory TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
      cadence_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (cadence_minutes BETWEEN 5 AND 43200),
      max_new_concepts INTEGER NOT NULL DEFAULT 5 CHECK (max_new_concepts BETWEEN 0 AND 100),
      last_run_at TEXT, next_run_at TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
    CREATE TABLE gemini_manual_background_jobs (
      id INTEGER PRIMARY KEY,
      setting_id INTEGER, stable_key TEXT, status TEXT, run_id TEXT,
      error_code TEXT, claimed_at TEXT, completed_at TEXT
    );
    CREATE INDEX idx_gemini_manual_queue ON gemini_manual_background_jobs(status);
    CREATE INDEX idx_gemini_manual_active_category ON gemini_manual_background_jobs(stable_key);
    CREATE UNIQUE INDEX idx_gemini_manual_only_one_active ON gemini_manual_background_jobs(id);
    INSERT INTO gemini_manual_background_jobs(id,stable_key,status)
      VALUES (1,'directory.salony','SUCCESS');
  `);
  for (const name of stages) db.exec(sql(name).replaceAll("--> statement-breakpoint", "\n"));
  return db;
}
function schema(db) {
  const columns = name => db.prepare("PRAGMA table_info('" + name + "')").all();
  return {
    objects: db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_schema WHERE type IN ('table','index','trigger')").all(),
    managedEventColumns: columns("managed_events"),
    organizationLocationColumns: columns("organization_locations"),
    geminiNotionReviewLockColumns: columns("gemini_notion_review_locks"),
    geminiCategoryPromptColumns: columns("gemini_category_prompts"),
    geminiAutomationSettingsColumns: columns("gemini_automation_settings"),
  };
}

test("0127 remains approved and pinned even when 0128 is a later supported target", () => {
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(target));
  assert.equal(SUPPORTED_PRODUCTION_TARGETS.at(-1), "0129_gemini_external_manual_queue.sql");
  assert.deepEqual(PREPARED_PRODUCTION_TARGETS, []);
  const bytes = readFileSync(path.join(root, "drizzle", target));
  assert.equal(createHash("sha256").update(bytes).digest("hex"), APPROVED_0127_SHA256);
  assert.doesNotThrow(() => assertApproved0127Target("psipedia-sk-db", APPROVED_0127_SHA256));
  assert.throws(() => assertApproved0127Target("wrong-db", APPROVED_0127_SHA256), /canonical psipedia-sk-db/);
  assert.throws(() => assertApproved0127Target("psipedia-sk-db", "wrong-hash"), /SHA256 differs/);
  assert.equal(JSON.parse(readFileSync(path.join(root, "config/cloudflare-resources.json"), "utf8")).d1.database_name,
    "psipedia-sk-db");
});

test("0127 scoped rollout never includes later 0128 even after its authorization", () => {
  const later = "0128_facebook_image_posts.sql";
  assert.ok(SUPPORTED_PRODUCTION_TARGETS.includes(later));
  const earlier = Array.from({ length: 62 }, (_, i) => String(i).padStart(4, "0") + "_fixture.sql");
  const { selected, excludedFuture } = selectMigrationsThrough([...earlier, ...SUPPORTED_PRODUCTION_TARGETS], target);
  assert.deepEqual(selected, [...earlier, ...SUPPORTED_PRODUCTION_TARGETS.filter(name => Number(name.slice(0,4)) <= 127)]);
  assert.deepEqual(excludedFuture, [later, "0129_gemini_external_manual_queue.sql"]);
  const workflow = readFileSync(path.join(root, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.match(workflow, /0128_facebook_image_posts/);
});

test("actual workflow confirmation step rejects wrong token, wrong branch and wrong migration", () => {
  const workflow = readFileSync(path.join(root, ".github/workflows/production-d1-migrate.yml"), "utf8");
  assert.match(workflow, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.match(workflow, /environment: production/);
  assert.match(workflow, /group: production-d1-migration/);
  assert.match(workflow, /ref: \$\{\{ github.sha \}\}/);
  assert.match(workflow, /git rev-parse origin\/main/);
  assert.match(workflow, /test:migration-safety/);
  assert.doesNotMatch(workflow, /^\s*(push|schedule|pull_request):/m);
  assert.doesNotMatch(workflow, /wrangler deploy|d1 time-travel restore/);
  assert.ok(workflow.includes("- " + target));
  const match = workflow.match(/      - name: Require main and explicit production confirmation\n        shell: bash\n        run: \|\n([\s\S]*?)\n      - name: Checkout exact dispatched main revision/);
  assert.ok(match, "manual Bash approval step is missing");
  const bash = match[1].split("\n").map(line => line.replace(/^          /, "")).join("\n");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "psipedia-d1-0127-"));
  try {
    const event = path.join(tmp, "event.json");
    const run = (confirmation, migration = target, ref = "refs/heads/main") => {
      writeFileSync(event, JSON.stringify({ inputs: { confirmation } }));
      return spawnSync("bash", ["-e", "-c", bash], {
        encoding: "utf8",
        env: { ...process.env, TARGET_MIGRATION: migration, GITHUB_REF: ref, GITHUB_EVENT_PATH: event },
      });
    };
    assert.equal(run("APPLY-0127-psipedia-sk-db").status, 0);
    assert.notEqual(run("APPLY-0126-psipedia-sk-db").status, 0);
    assert.notEqual(run("APPLY-0127-wrong-db").status, 0);
    assert.notEqual(run("APPLY-0127-psipedia-sk-db", target, "refs/heads/feature").status, 0);
    assert.notEqual(run("APPLY-0127-psipedia-sk-db", "0127_unknown.sql").status, 0);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test("ledger requires exactly 0126 before 0127 and repeat 0127 APPLY is rejected", () => {
  const selected = selectMigrationsThrough(
    [...Array.from({ length: 123 }, (_, i) => String(i).padStart(4, "0") + "_fixture.sql"),
      ...stages, target, "0128_future.sql"], target);
  assert.equal(selected.selected.at(-1), target);
  assert.deepEqual(selected.excludedFuture, ["0128_future.sql"]);
  const before = selected.selected.slice(0, -1);
  assert.deepEqual(validateProductionTargetHistory(before, selected.selected, target),
    { latestIndex: 126, targetApplied: false });
  assert.throws(() => validateProductionTargetHistory(before.slice(0, -1), selected.selected, target),
    /expected exactly 0126/);
  const wrong = [...before]; wrong[126] = "0126_wrong.sql";
  assert.throws(() => validateProductionTargetHistory(wrong, selected.selected, target),
    /does not exactly match/);
  assert.deepEqual(validateProductionTargetHistory([...before, target], selected.selected, target),
    { latestIndex: 127, targetApplied: true });
  assert.throws(() => assert0127NotAlreadyApplied(target, true), /already applied/);
  assert.doesNotThrow(() => assert0127NotAlreadyApplied(target, false));
  assert.doesNotThrow(() => assert0127NotAlreadyApplied(prev, true));
});

test("0127 requires 0126 schema, refuses partial schema and verifies all receipt constraints", () => {
  const db = fixture();
  try {
    const before = schema(db);
    assert.deepEqual(targetSchemaObjects(before, target), { partial: false });
    assert.doesNotThrow(() => assertRolloutChainSchema(before, target));
    const missing = structuredClone(before);
    missing.geminiAutomationSettingsColumns = missing.geminiAutomationSettingsColumns.filter(c => c.name !== "weekly_day");
    assert.throws(() => assertRolloutChainSchema(missing, target), /weekly_day/);
    db.exec(sql(target));
    const after = schema(db);
    assert.deepEqual(targetSchemaObjects(after, target), { partial: true });
    assert.throws(() => assertPendingTargetSchemaClean(target, targetSchemaObjects(after, target)),
      /partial\/manual drift/);
    assert.doesNotThrow(() => assertGeminiNotionCreatedPagesSchema(after));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM gemini_notion_created_pages").get().n, 0);
    assert.throws(() => db.exec("INSERT INTO gemini_notion_created_pages (notion_page_id,job_id,stable_key,notion_data_source_id,import_agenda) VALUES ('bad',1,'a','source','directory')"),
      /CHECK constraint failed/);
    assert.throws(() => db.exec("INSERT INTO gemini_notion_created_pages (notion_page_id,job_id,stable_key,notion_data_source_id,import_agenda) VALUES ('11111111-1111-1111-1111-111111111111',99,'a','source','directory')"),
      /FOREIGN KEY constraint failed/);
    assert.throws(() => db.exec("INSERT INTO gemini_notion_created_pages (notion_page_id,job_id,stable_key,notion_data_source_id,import_agenda) VALUES ('11111111-1111-1111-1111-111111111111',1,'a','source','invalid')"),
      /CHECK constraint failed/);
    const bad = structuredClone(after);
    bad.objects.find(o => o.name === "idx_gemini_notion_created_pages_pending").sql = "CREATE INDEX x ON gemini_notion_created_pages(stable_key)";
    assert.throws(() => assertGeminiNotionCreatedPagesSchema(bad), /index missing or changed/);
    const wrongFk = structuredClone(after);
    wrongFk.objects.find(o => o.name === "gemini_notion_created_pages").sql =
      wrongFk.objects.find(o => o.name === "gemini_notion_created_pages").sql.replace("REFERENCES gemini_manual_background_jobs(id)", "REFERENCES missing_jobs(id)");
    assert.throws(() => assertGeminiNotionCreatedPagesSchema(wrongFk), /receipt schema drift/);
  } finally { db.close(); }
});

test("0127 read-only audit stays independent and expects APPLIED_AND_VERIFIED after APPLY", () => {
  const w = readFileSync(path.join(root, ".github/workflows/production-d1-0127-readonly.yml"), "utf8");
  const audit = readFileSync(path.join(root, "scripts/production-d1-0127-readonly.mjs"), "utf8");
  assert.match(w, /workflow_dispatch/);
  assert.match(w, /AUDIT-0127/);
  assert.doesNotMatch(w, /migrations apply|APPLY-0127/);
  assert.match(audit, /APPLIED_AND_VERIFIED/);
});
