import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { loadAdminQualityPendingSummary } from "../lib/admin-quality-pending-summary.ts";

function createDatabase(withStatusColumns = true) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE quality_missing_proposals (
      id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE quality_missing_scans (
      id INTEGER PRIMARY KEY
      ${withStatusColumns ? ", status TEXT, error_code TEXT" : ""}
    );
    INSERT INTO quality_missing_proposals(status,value)
      VALUES ('OPEN','new'),('REJECTED','old'),('OPEN','newer');
  `);
  const sqls = [];
  const db = {
    prepare(sql) {
      sqls.push(sql);
      const stmt = sqlite.prepare(sql);
      return {
        all: async () => ({ results: stmt.all() }),
        first: async () => stmt.get() ?? null,
      };
    },
  };
  return { db, sqlite, sqls };
}

test("Admin homepage quality metric reads count only, never scans the 1000 pending payloads", async () => {
  const {db,sqlite,sqls} = createDatabase();
  try {
    assert.deepEqual(await loadAdminQualityPendingSummary(db), {total:2,schemaReady:true});
    assert.deepEqual(sqls, [
      "SELECT status,error_code FROM quality_missing_scans LIMIT 1",
      "SELECT COUNT(*) AS n FROM quality_missing_proposals WHERE status='OPEN'",
    ]);
    assert.ok(sqls.every(sql => !/ORDER BY|JOIN|LIMIT 1000|source_url|field_key|scanned_at/.test(sql)));
  } finally {sqlite.close();}
});

test("migration readiness never displays an unready quality schema as zero open proposals", async () => {
  const {db,sqlite,sqls} = createDatabase(false);
  try {
    assert.deepEqual(await loadAdminQualityPendingSummary(db), {total:0,schemaReady:false});
    assert.equal(sqls.length,1);
  } finally {sqlite.close();}
});

test("other D1 errors propagate to the existing reliability guard instead of masking failures", async () => {
  const db = {prepare() {return {all:async() => {throw new Error("D1_TIMEOUT");}};}};
  await assert.rejects(loadAdminQualityPendingSummary(db), /D1_TIMEOUT/);
  await assert.rejects(loadAdminQualityPendingSummary(undefined), /Chýba databáza/);
});

test("Admin workspace uses the light reader while /admin/kvalita retains full history and proposals", () => {
  const read = path => readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const homepage = read("app/admin/page.tsx");
  const qualityPage = read("app/admin/kvalita/page.tsx");
  const detailed = read("lib/data-quality-missing-hourly.ts");
  assert.match(homepage, /loadAdminQualityPendingSummary/);
  assert.doesNotMatch(homepage, /loadMissingQualityDashboard|getQualityMissingDatabase|data-quality-missing-hourly/);
  assert.match(homepage, /if \(!result\.schemaReady\) throw/);
  assert.match(qualityPage, /loadMissingQualityDashboard/);
  assert.match(detailed, /ORDER BY id DESC LIMIT 1000/);
  assert.match(detailed, /GROUP BY area,status/);
});
