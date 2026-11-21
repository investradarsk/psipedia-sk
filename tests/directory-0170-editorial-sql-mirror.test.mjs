import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  approvedDirectoryFactSqlSlot, directoryNotionFacetRequiresSqlMirror,
  planDirectory0170FactSqlMirror, planDirectory0170FilterSqlMirror,
} from "../lib/directory-0170-editorial-sql-mirror.ts";
import { directoryFilterRegistry } from "../lib/directory-filter-contract.ts";

const before = "2026-11-18T17:00:00.000Z";
const after = "2026-11-18T17:01:00.000Z";
function fixture() {
  const db=new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE directory_profiles("+
    "id INTEGER PRIMARY KEY,category TEXT NOT NULL,status TEXT NOT NULL,"+
    "updated_at TEXT NOT NULL,source_data_json TEXT NOT NULL);"+
    "CREATE TABLE directory_profile_public_facts("+
    "profile_id INTEGER NOT NULL,field_key TEXT NOT NULL,value_text TEXT NOT NULL,"+
    "updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,"+
    "PRIMARY KEY(profile_id,field_key));"+
    "CREATE TABLE directory_profile_filter_values("+
    "profile_id INTEGER NOT NULL,category TEXT NOT NULL,filter_id TEXT NOT NULL,"+
    "value_text TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,"+
    "PRIMARY KEY(profile_id,filter_id));"
  );
  db.prepare("INSERT INTO directory_profiles VALUES(?,?,?,?,?)").run(1,"veterinari","published",before,"{}");
  db.prepare("INSERT INTO directory_profiles VALUES(?,?,?,?,?)").run(2,"treneri","published",before,"{}");
  const run=(category,sqlMirror,stamp=before,profileId=1)=>{
    db.exec("BEGIN TRANSACTION");
    try {
      const canonical=db.prepare(
        "UPDATE directory_profiles SET updated_at=? WHERE id=? AND category=? AND updated_at=? RETURNING id",
      ).get(after,profileId,category,stamp);
      for(const statement of sqlMirror){
        const compiled=db.prepare(statement.sql);
        if(statement.sql.startsWith("SELECT"))compiled.get(...statement.bindings);
        else compiled.run(...statement.bindings);
      }
      db.exec("COMMIT");
      return canonical;
    } catch(e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const fact=(id,key)=>db.prepare(
    "SELECT value_text FROM directory_profile_public_facts WHERE profile_id=? AND field_key=?",
  ).get(id,key)?.value_text;
  const filter=(id,key)=>db.prepare(
    "SELECT value_text FROM directory_profile_filter_values WHERE profile_id=? AND filter_id=?",
  ).get(id,key)?.value_text;
  return {db,run,fact,filter};
}

test("approved fact values and explicit empty clears are kept distinct",()=>{
  const f=fixture();
  try {
    assert(approvedDirectoryFactSqlSlot("veterinari","Ordinačné hodiny"));
    assert(!approvedDirectoryFactSqlSlot("veterinari","Pohotovosť"));
    assert(!approvedDirectoryFactSqlSlot("chovatelske-stanice","Plemená"));
    assert.throws(()=>planDirectory0170FactSqlMirror({
      profileId:1,category:"veterinari",field:"Plemeno",value:"bad",
      updatedAt:after,actor:"admin",
    }),/NOT_APPROVED/);
    const plan=planDirectory0170FactSqlMirror({
      profileId:1,category:"veterinari",field:"Ordinačné hodiny",value:"",
      updatedAt:after,actor:"admin",
    });
    f.run("veterinari",plan);
    assert.equal(f.fact(1,"Ordinačné hodiny"),"");
    assert.equal(f.fact(2,"Ordinačné hodiny"),undefined);
  } finally {f.db.close();}
});

test("all 21 filter IDs are accepted only under their registered category",()=>{
  assert.equal(directoryFilterRegistry.length,21);
  const ids=new Set();
  for(const def of directoryFilterRegistry){
    assert(!ids.has(def.id));ids.add(def.id);
    assert.equal(planDirectory0170FilterSqlMirror({
      profileId:1,category:def.category,values:{[def.id]:def.allowedValues[0]},
      updatedAt:after,actor:"admin",
    }).length,2);
    const wrong=directoryFilterRegistry.find(v=>v.category!==def.category).category;
    assert.throws(()=>planDirectory0170FilterSqlMirror({
      profileId:1,category:wrong,values:{[def.id]:def.allowedValues[0]},
      updatedAt:after,actor:"admin",
    }),/INVALID_ID/);
  }
});

test("unknown remains an explicit value; absent ID untouched; clear only selected ID",()=>{
  const f=fixture();
  try {
    const first=planDirectory0170FilterSqlMirror({
      profileId:1,category:"veterinari",
      values:{"veterinari.emergency":"unknown","veterinari.home_visits":"yes"},
      updatedAt:after,actor:"admin",
    });
    f.run("veterinari",first);
    assert.equal(f.filter(1,"veterinari.emergency"),"unknown");
    assert.equal(f.filter(1,"veterinari.home_visits"),"yes");
    f.db.prepare("UPDATE directory_profiles SET updated_at=? WHERE id=1").run(before);
    const clear=planDirectory0170FilterSqlMirror({
      profileId:1,category:"veterinari",
      values:{"veterinari.emergency":null},
      updatedAt:after,actor:"admin",
    });
    f.run("veterinari",clear);
    assert.equal(f.filter(1,"veterinari.emergency"),undefined);
    assert.equal(f.filter(1,"veterinari.home_visits"),"yes");
  } finally {f.db.close();}
});

test("stale CAS and missing profile roll back relation writes",()=>{
  const f=fixture();
  try {
    const plan=planDirectory0170FilterSqlMirror({
      profileId:1,category:"veterinari",values:{"veterinari.emergency":"no"},
      updatedAt:after,actor:"admin",
    });
    assert.throws(()=>f.run("veterinari",plan,"stale"),/malformed JSON|CAS_CONFLICT/);
    assert.equal(f.filter(1,"veterinari.emergency"),undefined);
    assert.equal(f.db.prepare("SELECT updated_at FROM directory_profiles WHERE id=1").get().updated_at,before);
    assert.throws(()=>f.run("veterinari",plan,before,999),/malformed JSON|CAS_CONFLICT/);
    assert.equal(f.filter(2,"veterinari.emergency"),undefined);
  } finally {f.db.close();}
});

test("invalid values and prohibited fields fail before preparing writes",()=>{
  const base={profileId:1,category:"veterinari",updatedAt:after,actor:"admin"};
  for(const values of [
    {}, {"veterinari.emergency":""},{"veterinari.emergency":"invalid"},
    {"veterinari.home_visits":42},{"unknown.filter":"yes"},
  ]) {
    assert.throws(()=>planDirectory0170FilterSqlMirror({...base,values}));
  }
  assert.throws(()=>planDirectory0170FactSqlMirror({...base,field:"Hospitalizácia",value:null}),/INVALID_VALUE/);
});


test("signed Notion filter events update only SQL, including explicit clear", () => {
  const f=fixture();
  try {
    const id="veterinari.facility_type";
    const oldJson=JSON.stringify({ "Zdroj dát":"untouched", oldFilter:"do not copy" });
    f.db.prepare("UPDATE directory_profiles SET source_data_json=? WHERE id=1").run(oldJson);
    f.db.prepare("INSERT INTO directory_profile_filter_values VALUES (?,?,?,?,?,?)")
      .run(1,"veterinari",id,"hospital",before,"admin");
    assert.equal(directoryNotionFacetRequiresSqlMirror({
      sqlValue:"hospital",selected:"clinic",
    }),true);
    assert.equal(directoryNotionFacetRequiresSqlMirror({
      sqlValue:"clinic",selected:"clinic",
    }),false);
    assert.equal(directoryNotionFacetRequiresSqlMirror({
      sqlValue:null,selected:"clinic",
    }),true);
    const plan=planDirectory0170FilterSqlMirror({
      profileId:1,category:"veterinari",values:{[id]:"clinic"},updatedAt:after,actor:"admin",
    });
    f.run("veterinari",plan);
    assert.equal(f.filter(1,id),"clinic");

    // A signed clear deletes only the selected relational row. Historic
    // JSON remains completely untouched by either SQL operation.
    f.db.prepare("UPDATE directory_profiles SET updated_at=? WHERE id=1").run(before);
    assert.equal(directoryNotionFacetRequiresSqlMirror({
      sqlValue:"clinic",selected:null,
    }),true);
    assert.equal(directoryNotionFacetRequiresSqlMirror({
      sqlValue:null,selected:null,
    }),false);
    const clear=planDirectory0170FilterSqlMirror({
      profileId:1,category:"veterinari",values:{[id]:null},updatedAt:after,actor:"admin",
    });
    f.run("veterinari",clear);
    assert.equal(f.filter(1,id),undefined);
    assert.equal(f.filter(2,id),undefined,"other profiles unchanged");
    assert.equal(f.db.prepare(
      "SELECT source_data_json FROM directory_profiles WHERE id=1",
    ).get().source_data_json,oldJson);
  } finally {f.db.close();}
});

test("signed Notion events compare the SQL filter row before saving",()=>{
  const source=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
  assert.match(source,/AS sql_filter_value/);
  assert.match(source,/directoryNotionFacetRequiresSqlMirror\(\{/);
  assert.match(source,/sqlValue: row\.sql_filter_value/);
  const start=source.indexOf("// SQL is the only filter owner");
  const end=source.indexOf("// Trainer trust checkboxes",start);
  assert.ok(start>0 && end>start);
  assert.doesNotMatch(source.slice(start,end),/source_data_json|mergeDirectoryFilterValues/);
});

test("both Admin and Notion writers batch SQL mirror with canonical update",()=>{
  const admin=readFileSync(new URL("../app/api/admin/directory/[id]/route.ts",import.meta.url),"utf8");
  const notion=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
  assert.match(admin,/planDirectory0170FilterSqlMirror\(/);
  assert.match(admin,/const results = await db\.batch\(\[/);
  assert.match(notion,/planDirectory0170FilterSqlMirror\(/);
  assert.match(notion,/planDirectory0170FactSqlMirror\(/);
  assert.match(notion,/const response = await database\.batch\(\[/);
  assert.match(notion,/const response = await input\.database\.batch\(\[/);
});
