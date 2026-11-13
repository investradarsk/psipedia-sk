import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

const sql = readFileSync("drizzle/0166_facebook_weekly_template.sql", "utf8");
const runner = readFileSync("scripts/production-d1-facebook-0166.mjs", "utf8");
const workflow = readFileSync(".github/workflows/production-d1-facebook-weekly-0166.yml", "utf8");
const canonical = readFileSync("scripts/production-d1-migrate.mjs", "utf8");

test("0166 SQL bytes are pinned; only two independent additive tables are created", () => {
  assert.equal(createHash("sha256").update(sql).digest("hex"),
    "f9ff02bec55f814dbb738246ecacaa86c120d00428251c3fbc774f2670ce5dc6");
  assert.equal((sql.match(/CREATE TABLE IF NOT EXISTS/g) || []).length,2);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS facebook_weekly_template \(/);
  assert.match(sql,/CREATE TABLE IF NOT EXISTS facebook_weekly_template_marks \(/);
  assert.doesNotMatch(sql,/\b(?:DROP|ALTER|DELETE|UPDATE|REPLACE|INSERT)\b/i);
});

test("0166 SQL can run twice without touching legacy 0157 data or backfilling posts", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE facebook_weekly_plan_marks(slot_date TEXT, slot_key TEXT, marked_at TEXT, marked_by TEXT);");
    db.exec("INSERT INTO facebook_weekly_plan_marks VALUES('2026-11-13','video','prior','editor')");
    db.exec(sql);
    db.exec(sql);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM facebook_weekly_plan_marks").get().n,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM facebook_weekly_template").get().n,0);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM facebook_weekly_template_marks").get().n,0);
    db.prepare("INSERT INTO facebook_weekly_template(id,version,slots_json,updated_at,updated_by) VALUES(1,1,'[]','now','editor')").run();
    assert.throws(() => db.prepare("INSERT INTO facebook_weekly_template(id,version,slots_json,updated_at,updated_by) VALUES(2,1,'[]','now','editor')").run());
    db.prepare("INSERT INTO facebook_weekly_template_marks VALUES('2026-11-13','slot-a','now','editor')").run();
    assert.throws(() => db.prepare("INSERT INTO facebook_weekly_template_marks VALUES('2026-11-13','slot-a','now','editor')").run());
  } finally { db.close(); }
});

test("protected deployment is owner/manual only, requires exact main, no standard migrator", () => {
  assert.match(workflow,/workflow_dispatch:/);
  assert.match(workflow,/environment: production/);
  assert.match(workflow,/group: production-d1-migration/);
  assert.match(workflow,/refs\/heads\/main/);
  assert.match(workflow,/APPLY-0166-psipedia-sk-db/);
  assert.match(workflow,/CLOUDFLARE_D1_API_TOKEN/);
  assert.match(workflow,/Time Travel bookmark/);
  assert.match(workflow,/production-d1-facebook-0166\.mjs apply/);
  assert.doesNotMatch(workflow,/run:\s*(?:npx |node )?(?:wrangler d1 migrations apply|scripts\/production-d1-migrate\.mjs apply)/);
});

test("one-off runner pins target and preserves migration history and 0157", () => {
  assert.match(runner,/EXPECTED_SHA256 = "f9ff02bec55f814dbb738246ecacaa86c120d00428251c3fbc774f2670ce5dc6"/);
  assert.match(runner,/historyHash===state\.historyHash/);
  assert.match(runner,/legacySchemaHash===state\.legacySchemaHash/);
  assert.match(runner,/Partial 0166 schema detected/);
  assert.match(runner,/findBookmark/);
  assert.match(runner,/--file",FILE/);
  assert.doesNotMatch(runner,/\bd1_migrations\s+(?:SET|UPDATE|DELETE|INSERT)/);
  // 0166 is intentionally NOT a normal sequential production migration.
  assert.match(canonical,/"0166_facebook_weekly_template\.sql"/);
  const supported=canonical.slice(canonical.indexOf("export const SUPPORTED_PRODUCTION_TARGETS"),
    canonical.indexOf("export const DYNAMIC_ENTITY_IDENTITY_INDEXES"));
  assert.doesNotMatch(supported,/"0166_facebook_weekly_template\.sql"/);
});
