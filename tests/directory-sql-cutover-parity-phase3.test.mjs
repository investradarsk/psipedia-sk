import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  compareDirectorySqlShadow, readDirectorySqlShadowParity,
} from "../lib/directory-sql-cutover-parity.ts";

const proposal = readFileSync(fileURLToPath(new URL(
  "../docs/proposals/DIRECTORY-HELP-EVENTS-SQL-UNIFICATION-PHASE-2-DRAFT.sql",
  import.meta.url)), "utf8");

const sqlDate="2026-11-17T21:00:00.000Z";
function makeSource() {
  return JSON.stringify({
    "Telefón":"+421 900 123 456",
    "E-mail":"office@example.invalid",
    "Facebook":"https://example.invalid/private-page",
    "Instagram":"instagram-slug",
    "_psipedia_additional_categories":JSON.stringify(["treneri"]),
    "_psipedia_filter_v1_veterinari_emergency":"yes",
    "Špecializácie":"Interná medicína",
    "Ordinačné hodiny":"Po-Pi 9–17",
    "Pokrytie":"Nitriansky kraj",
  });
}
function newDb(migrate=true) {
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY, category TEXT, website_url TEXT, source_data_json TEXT)");
  if (migrate) db.exec(proposal);
  db.prepare("INSERT INTO directory_profiles (id,category,website_url,source_data_json) VALUES (1,?,?,?)")
    .run("veterinari","https://clinic.example.invalid",makeSource());
  return db;
}
function d1(db) {
  return {
    prepare(sql) {
      const statement=db.prepare(sql);
      return {
        all: async()=>({results:statement.all()}),
        bind(...args) {
          return {
            first:async()=>statement.get(...args)??null,
            all:async()=>({results:statement.all(...args)}),
          };
        },
      };
    },
  };
}
function insertParity(db) {
  db.prepare("UPDATE directory_profiles SET public_phone=?,public_email=?,facebook_url=?,instagram_url=? WHERE id=1")
    .run("+421 900 123 456","office@example.invalid",
      "https://example.invalid/private-page","instagram-slug");
  db.prepare("INSERT INTO directory_profile_additional_categories VALUES (?,?,?,?)")
    .run(1,"treneri",sqlDate,"Admin");
  const facts=db.prepare("INSERT INTO directory_profile_public_facts VALUES (?,?,?,?,?)");
  for (const [key,value] of [
    ["Špecializácie","Interná medicína"],
    ["Ordinačné hodiny","Po-Pi 9–17"],
    ["Pokrytie","Nitriansky kraj"],
  ]) facts.run(1,key,value,sqlDate,"Admin");
  db.prepare("INSERT INTO directory_profile_filter_values VALUES (?,?,?,?,?,?)")
    .run(1,"veterinari","veterinari.emergency","yes",sqlDate,"Admin");
}

test("shadow endpoint reports not_deployed on current schema, never a fabricated parity pass",async()=>{
  const db=newDb(false);
  try {
    const report=await readDirectorySqlShadowParity(d1(db),1);
    assert.equal(report.schemaReady,false);
    assert.equal(report.status,"not_deployed");
    assert.equal(report.publicReadsCutOver,false);
  } finally { db.close(); }
});

test("a verified normalized SQL projection matches the existing public/Admin/Notion source",async()=>{
  const db=newDb();
  try {
    insertParity(db);
    const report=await readDirectorySqlShadowParity(d1(db),1);
    assert.equal(report.schemaReady,true);
    assert.equal(report.status,"no_detected_differences");
    assert.deepEqual(report.issues,[]);
    assert.equal(report.notionVerified,false,"D1 equality alone never proves remote Notion parity");
    assert.equal(report.publicReadsCutOver,false);
  } finally { db.close(); }
});

test("website parity checks every historical alias without treating SQL-only websites as conflicts",async()=>{
  const db=newDb();
  try {
    insertParity(db);
    const first=await readDirectorySqlShadowParity(d1(db),1);
    assert.equal(first.status,"no_detected_differences", "an existing SQL-only website is valid");
    const get=db.prepare("SELECT source_data_json FROM directory_profiles WHERE id=1");
    const source=JSON.parse(get.get().source_data_json);
    source.Web="https://clinic.example.invalid";
    source["Webstránka"]="https://stale.example.invalid";
    db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=1").run(JSON.stringify(source));
    const mismatch=await readDirectorySqlShadowParity(d1(db),1);
    assert.deepEqual(mismatch.issues.filter(x=>x.field==="websiteUrl").map(x=>x.kind),["value_differs"],
      "even a stale secondary alias needs review");
    assert.doesNotMatch(JSON.stringify(mismatch),/clinic\.example|stale\.example/);
    db.prepare("UPDATE directory_profiles SET website_url='' WHERE id=1").run();
    const cleared=await readDirectorySqlShadowParity(d1(db),1);
    assert.deepEqual(cleared.issues.filter(x=>x.field==="websiteUrl").map(x=>x.kind),["legacy_alias_after_clear"]);
    db.prepare("UPDATE directory_profiles SET website_url=NULL WHERE id=1").run();
    const unbackfilled=await readDirectorySqlShadowParity(d1(db),1);
    assert.deepEqual(unbackfilled.issues.filter(x=>x.field==="websiteUrl").map(x=>x.kind),["not_backfilled"]);
    db.prepare("UPDATE directory_profiles SET website_url='https://clinic.example.invalid' WHERE id=1").run();
    source["Webstránka"]="  ";
    db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=1").run(JSON.stringify(source));
    const parity=await readDirectorySqlShadowParity(d1(db),1);
    assert.deepEqual(parity.issues.filter(x=>x.field==="websiteUrl"),[]);
  } finally { db.close(); }
});

test("explicit cleared SQL contact cannot silently revive a previous JSON alias",async()=>{
  const db=newDb();
  try {
    insertParity(db);
    db.prepare("UPDATE directory_profiles SET public_phone='' WHERE id=1").run();
    const report=await readDirectorySqlShadowParity(d1(db),1);
    assert.equal(report.status,"pending_review");
    assert.deepEqual(report.issues.filter(x=>x.field==="publicPhone").map(x=>x.kind),
      ["legacy_alias_after_clear"]);
    assert.doesNotMatch(JSON.stringify(report),/900 123 456/);
    assert.doesNotMatch(JSON.stringify(report),/example\.invalid/);
  } finally { db.close(); }
});

test("missing rows are not conflated with confirmed empty SQL values",async()=>{
  const db=newDb();
  try {
    const report=await readDirectorySqlShadowParity(d1(db),1);
    const fields=report.issues.map(x=>x.group+":"+x.field+":"+x.kind);
    assert.ok(fields.includes("contact:publicEmail:not_backfilled"));
    assert.ok(fields.includes("category:treneri:not_backfilled"));
    assert.ok(fields.includes("filter:veterinari.emergency:not_backfilled"));
    assert.ok(fields.includes("fact:Pokrytie:not_backfilled"));
    assert.ok(fields.includes("fact:Ordinačné hodiny:not_backfilled"));
  } finally { db.close(); }
});

test("invalid stored JSON is a conflict and unknown facts or filters cannot become public sources",()=>{
  const report=compareDirectorySqlShadow({
    id:17, category:"treneri", website_url:null, source_data_json:"{",
    public_phone:null,public_email:null,facebook_url:null,instagram_url:null,
  }, [{category:"chovatelske-stanice"}],
  [{field_key:"untrusted",value_text:"<script>hidden</script>"}],
  [{category:"veterinari",filter_id:"veterinari.home_visits",value_text:"yes"}]);
  assert.ok(report.issues.some(x=>x.kind==="invalid_legacy_json"));
  assert.ok(report.issues.some(x=>x.group==="fact" && x.kind==="unmapped_sql_field"));
  assert.ok(report.issues.some(x=>x.group==="filter" && x.kind==="unmapped_sql_field"));
  assert.doesNotMatch(JSON.stringify(report),/<script>/);
});

test("SQL filter value must satisfy the current Notion selection registry",async()=>{
  const db=newDb();
  try {
    insertParity(db);
    db.exec("UPDATE directory_profile_filter_values SET value_text='maybe' WHERE profile_id=1");
    const report=await readDirectorySqlShadowParity(d1(db),1);
    assert.ok(report.issues.some(x=>x.field==="veterinari.emergency" && x.kind==="invalid_sql_value"));
  } finally { db.close(); }
});

test("missing records are separate from not-deployed schema",async()=>{
  const db=newDb();
  try {
    const report=await readDirectorySqlShadowParity(d1(db),999);
    assert.equal(report.schemaReady,true);
    assert.equal(report.status,"not_found");
  } finally { db.close(); }
});

test("SQL parity is only exposed as an explicit authenticated Admin opt-in",()=>{
  const source=readFileSync(fileURLToPath(new URL(
    "../app/api/admin/directory/[id]/route.ts",import.meta.url)),"utf8");
  const start=source.indexOf("export async function GET(");
  const stop=source.indexOf("export async function PUT(",start);
  const get=source.slice(start,stop);
  assert.match(get,/await getAdminApiUser\(\)/);
  assert.ok(get.indexOf("await getAdminApiUser()") < get.indexOf("sqlParity"));
  assert.match(get,/searchParams\.get\("sqlParity"\) === "1"/);
  assert.match(get,/readDirectorySqlShadowParity\(db, id\)/);
  assert.match(get,/return profile \? Response\.json\(\{ profile \}\)/);
  assert.doesNotMatch(get,/\b(?:UPDATE|DELETE|INSERT)\b/i);
});
