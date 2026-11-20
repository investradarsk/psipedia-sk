import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import test from "node:test";
import {breedAuditRowsSql,breedAuditRowsSqlV2} from "../lib/breed-audit.ts";
import {canonicalBreedIdsSqlV2} from "../lib/breed-canonical.ts";
import {loadPublishedSeoQualityEntities} from "../lib/admin-seo-quality-entities.ts";

const schema = readFileSync(new URL("../drizzle/0174_breeds_sql_json_foundation.sql", import.meta.url), "utf8");

test("breed audit uses real SQL SEO/FCI even if legacy JSON is stale or malformed", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(`CREATE TABLE managed_breeds (
      id INTEGER PRIMARY KEY,slug TEXT,name TEXT,status TEXT,fci_number INTEGER,import_key TEXT,
      image_url TEXT,fci_group INTEGER,fci_section_number TEXT,fci_section TEXT,size TEXT,
      height TEXT,weight TEXT,lifespan TEXT,seo_json TEXT,editorial_json TEXT,
      fci_standard_json TEXT,related_breeds_json TEXT
    )`);
    db.exec(schema);
    db.prepare(`INSERT INTO managed_breeds (id,slug,name,status,fci_number,import_key,
      image_url,fci_group,fci_section_number,fci_section,size,height,weight,lifespan,
      seo_json,editorial_json,fci_standard_json,related_breeds_json)
      VALUES (1,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run("labrador-retriever","Labradorský retriever","published",122,"fci-122","/images/labrador.webp",8,"1","Retrievery",
        "Veľké","48–51 cm","20–23 kg","10–12 rokov",
        "{broken legacy JSON", "{broken legacy JSON", "{broken legacy JSON", "[]");
    db.prepare("UPDATE managed_breeds SET seo_title=?,seo_noindex=?,seo_canonical_url=? WHERE id=1")
      .run("Platné SQL SEO",0,"/plemena/retrievery-sliedice-vodne/labrador-retriever");
    db.prepare("INSERT INTO breed_fci_standard (breed_id,fci_vyska_pes_cm,fci_hmotnost_pes_kg) VALUES (1,?,?)")
      .run("48–51","20–23");
    const rows = db.prepare(breedAuditRowsSqlV2).all();
    assert.equal(rows.length,1);
    assert.equal(JSON.parse(rows[0].seo_json).title,"Platné SQL SEO");
    assert.equal(JSON.parse(rows[0].fci_measurements_json).vyska_pes_cm,"48–51");
    assert.equal(JSON.parse(rows[0].fci_measurements_json).hmotnost_pes_kg,"20–23");
    assert.deepEqual(db.prepare(canonicalBreedIdsSqlV2).all().map(row=>row.id),[1]);
    assert.doesNotMatch(breedAuditRowsSqlV2,/\bjson_valid\(fci_standard_json\)|\bjson_extract\(fci_standard_json/);
    assert.match(breedAuditRowsSql,/json_extract\(/, "rollback query remains available until verification");
  } finally { db.close(); }
});

test("SEO quality audit SQL mode reconstructs editorial and SEO without reading old documents", async () => {
  const sql = [];
  const database = {
    prepare(query) { sql.push(query); return {
      bind() { return this; },
      async all() { return {results:[]}; },
    }; },
  };
  await loadPublishedSeoQualityEntities(database, {BREED_SQL_V2_READ_MODE:"sql"});
  assert.equal(sql.length,8);
  const breeds = sql.find(query=>query.includes("FROM managed_breeds"));
  assert.ok(breeds);
  assert.match(breeds,/breed_editorial_text/);
  assert.match(breeds,/managed_breeds\.seo_title/);
  assert.doesNotMatch(breeds,/SELECT[\s\S]*?\beditorial_json\s*,\s*seo_json\s*FROM managed_breeds/);
  sql.length = 0;
  await loadPublishedSeoQualityEntities(database, {BREED_SQL_V2_READ_MODE:"off"});
  const legacy = sql.find(query=>query.includes("FROM managed_breeds"));
  assert.match(legacy,/editorial_json, seo_json/);
  assert.doesNotMatch(legacy,/breed_editorial_text/);
});

test("breed Admin full-save returns canonical SQL projection inside CAS batch", () => {
  const store = readFileSync(new URL("../lib/breed-store.ts", import.meta.url),"utf8");
  const part = store.slice(store.indexOf("export function buildManagedBreedUpdateStatements("),
    store.indexOf("/** Intro-only quick edit;",store.indexOf("export function buildManagedBreedUpdateStatements(")));
  assert.match(part,/database\.prepare\(`\$\{readSelect\} WHERE id=\?`\)\.bind\(id\)/);
  assert.doesNotMatch(part,/database\.prepare\(`\$\{select\} WHERE id=\?`\)\.bind\(id\)/);
  assert.match(part,/breedSqlV2FullSnapshotStatements/);
});

test("legacy FCI importer cannot silently overwrite SQL-primary data", () => {
  const route = readFileSync(new URL("../app/api/admin/import/route.ts", import.meta.url),"utf8");
  const preview = route.indexOf("if (payload.preview === true)");
  const gate = route.indexOf('BREED_SQL_V2_READ_MODE === "sql"');
  const importCall = route.indexOf("const result = await importFciBreeds");
  assert.ok(preview > 0 && preview < gate && gate < importCall);
  assert.match(route.slice(gate,importCall), /status: 409/);
  const local = route.slice(route.indexOf("const localFixtureImport"),gate);
  assert.match(local, /PSIPEDIA_E2E_LOCAL_BOOTSTRAP === "1"/);
  assert.match(local, /AUTH_MODE === "local-e2e-preview"/);
  assert.match(local, /url\.protocol === "http:" && url\.hostname === "localhost" && url\.port === "5173"/);
  assert.match(route.slice(gate,importCall), /!localFixtureImport/);
  const vite = readFileSync(new URL("../vite.config.ts", import.meta.url),"utf8");
  assert.match(vite,/isExplicitLocalE2eBootstrap[\s\S]*?PSIPEDIA_E2E_LOCAL_BOOTSTRAP: "1"/);
  const production = readFileSync(new URL("../wrangler.jsonc", import.meta.url),"utf8");
  assert.doesNotMatch(production,/PSIPEDIA_E2E_LOCAL_BOOTSTRAP/);
});