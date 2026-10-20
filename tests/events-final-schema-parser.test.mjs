import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { splitLocalSchemaStatements } from "./helpers/events-final-schema-parser.mjs";

const migration = (name) => readFileSync(new URL("../drizzle/" + name, import.meta.url), "utf8");

test("semicolons in standalone comments must not hide subsequent CREATE TABLE statements", () => {
  const statements = splitLocalSchemaStatements(
    "-- E2E local schema; comments may contain semicolons; avoid splitting here\n" +
    "-- This migration is additive; do not apply to production\n" +
    "CREATE TABLE IF NOT EXISTS example (id INTEGER PRIMARY KEY, title TEXT);\n" +
    "-- Later comments; more semicolons\n" +
    "ALTER TABLE example ADD COLUMN summary TEXT;\n",
  );
  assert.deepEqual(statements, [
    "CREATE TABLE IF NOT EXISTS example (id INTEGER PRIMARY KEY, title TEXT)",
    "ALTER TABLE example ADD COLUMN summary TEXT",
  ]);
});

test("real Gemini migration 0119 CREATE TABLE is visible to isolated events fixture", () => {
  const statements = splitLocalSchemaStatements(migration("0119_gemini_manual_background_jobs.sql"));
  const tables = statements.filter(sql => /^CREATE TABLE\b/i.test(sql));
  assert.equal(tables.length, 1);
  assert.match(tables[0], /^CREATE TABLE IF NOT EXISTS gemini_manual_background_jobs\s*\(/);
  assert.doesNotMatch(tables[0], /cron may consume an existing job/);
});

test("Gemini global STOP 0136 ALTER applies after the local fixture can create its target table", () => {
  const statements = splitLocalSchemaStatements(migration("0136_gemini_global_stop.sql"));
  assert.ok(statements.some(sql => /^CREATE TABLE gemini_global_control\b/i.test(sql)));
  assert.ok(statements.some(sql => /^ALTER TABLE gemini_manual_background_jobs ADD COLUMN worker_started_at TEXT$/i.test(sql)));
});

test("fixture restricts local migration execution to schema declarations only", () => {
  const script = readFileSync(new URL("./helpers/events-final-local-fixtures.mjs", import.meta.url), "utf8");
  assert.match(script, /PSIPEDIA_E2E_LOCAL_BOOTSTRAP\s*!==\s*'1'/);
  assert.match(script, /splitLocalSchemaStatements\(readFileSync/);
  assert.match(script, /\^CREATE TABLE\\b/);
  assert.match(script, /\^ALTER TABLE\\b/);
  assert.doesNotMatch(script, /\b(?:process|execSync|spawnSync)\s*\.\s*env\.D1_REMOTE/);
});
