import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import {
  audit0128, classify0128, assertReadonly0128Query, SQL_LEDGER_0128, SQL_OBJECTS_0128,
} from "../scripts/production-d1-0128-readonly.mjs";

const canonicalNames = readdirSync(new URL("../drizzle/", import.meta.url))
  .filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
const migration = readFileSync(new URL("../drizzle/0128_facebook_image_posts.sql", import.meta.url), "utf8");
const previous = readFileSync(new URL("../drizzle/0127_gemini_notion_created_pages.sql", import.meta.url), "utf8");
const resources = { account_id: "offline", d1: { database_name: "psipedia-sk-db", database_id: "offline-db-id" } };
const env = { CLOUDFLARE_ACCOUNT_ID: "offline", CLOUDFLARE_API_TOKEN: "offline-token" };

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON; CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE);");
  const insert = db.prepare("INSERT INTO d1_migrations(id,name) VALUES(?,?)");
  canonicalNames.slice(0,-1).forEach((name,i) => insert.run(i+1,name));
  db.exec("CREATE TABLE gemini_manual_background_jobs (id INTEGER PRIMARY KEY)");
  db.exec(previous);
  return { db, query: async (_database, sql) => db.prepare(assertReadonly0128Query(sql)).all() };
}

test("0128 audit workflow is exclusively manual, protected and read-only", () => {
  const flow = readFileSync(new URL("../.github/workflows/production-d1-0128-readonly.yml", import.meta.url), "utf8");
  assert.match(flow,/workflow_dispatch/);
  assert.match(flow,/environment: production/);
  assert.match(flow,/refs\/heads\/main/);
  assert.match(flow,/AUDIT-0128/);
  assert.match(flow,/git rev-parse origin\/main/);
  assert.doesNotMatch(flow,/\b(push|schedule|pull_request):|migrations apply|wrangler deploy|time-travel restore/);
  for (const sql of [SQL_LEDGER_0128, SQL_OBJECTS_0128]) assert.equal(assertReadonly0128Query(sql), sql);
  for (const sql of ["DELETE FROM facebook_image_posts", "SELECT * FROM d1_migrations; DROP TABLE x", "PRAGMA table_info('facebook_image_posts')"])
    assert.throws(() => assertReadonly0128Query(sql),/UNAUTHORIZED_SQL/);
});

test("0128 preflight is READY only with exact 0127 ledger and no partial Facebook objects",async () => {
  const { db,query } = fixture();
  try {
    assert.equal((await audit0128({mode:"preflight",resources,migration,canonicalNames,env,query})).result,
      "READY_FOR_SEPARATE_APPLY_APPROVAL");
    db.exec(migration);
    await assert.rejects(() => audit0128({mode:"preflight",resources,migration,canonicalNames,env,query}),
      /0128_AUDIT_NOT_CLEAN/);
    await assert.rejects(() => audit0128({mode:"postflight",resources,migration,canonicalNames,env,query}),
      /0128_AUDIT_NOT_APPLIED/);
    db.exec("INSERT INTO d1_migrations(id,name) VALUES(129,'0128_facebook_image_posts.sql')");
    assert.equal((await audit0128({mode:"postflight",resources,migration,canonicalNames,env,query})).result,
      "APPLIED_AND_VERIFIED");
  } finally { db.close(); }
});

test("0128 audit rejects stale/missing ledger, malformed indexes and wrong identity",async () => {
  const { db,query } = fixture();
  try {
    await assert.rejects(() => audit0128({mode:"preflight",resources,migration,canonicalNames,env:{},query}),
      /WRONG_PRODUCTION_ACCOUNT/);
    await assert.rejects(() => audit0128({mode:"preflight",resources,migration:migration+" --modified",canonicalNames,env,query}),
      /0128 SQL SHA256 differs/);
    await assert.rejects(() => audit0128({mode:"preflight",resources:{...resources,d1:{database_name:"wrong",database_id:"x"}},migration,canonicalNames,env,query}),
      /WRONG_PRODUCTION_ACCOUNT/);
    db.exec("DELETE FROM d1_migrations WHERE name='0127_gemini_notion_created_pages.sql'");
    await assert.rejects(() => audit0128({mode:"preflight",resources,migration,canonicalNames,env,query}),
      /expected exactly 0127|history/);
  } finally { db.close(); }
  const altered=fixture();
  try{
    altered.db.exec(migration);
    altered.db.exec("INSERT INTO d1_migrations(id,name) VALUES(129,'0128_facebook_image_posts.sql')");
    altered.db.exec("DROP INDEX facebook_image_posts_notion_idx");
    await assert.rejects(() => audit0128({mode:"postflight",resources,migration,canonicalNames,env,query:altered.query}),
      /Facebook image index schema drift/);
  } finally { altered.db.close(); }
});

test("0128 classify refuses duplicate ledger, unexpected mode, incomplete objects", () => {
  const {db} = fixture();
  try {
    const ledger=db.prepare(SQL_LEDGER_0128).all();
    const objects=db.prepare(SQL_OBJECTS_0128).all();
    assert.throws(()=>classify0128("wrong",ledger,objects,canonicalNames),/INVALID_INPUT/);
    assert.throws(()=>classify0128("preflight",ledger,objects.concat(objects[0]),canonicalNames),/INVALID_CANONICAL_STATE/);
    assert.throws(()=>classify0128("postflight",ledger,objects,canonicalNames),/0128_AUDIT_NOT_APPLIED/);
    const missing=objects.filter(row=>row.name!=="gemini_notion_created_pages");
    assert.throws(()=>classify0128("preflight",ledger,missing,canonicalNames),/Missing 0127/);
  }finally{db.close();}
});
