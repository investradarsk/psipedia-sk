import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { planDirectorySecondaryCategorySqlMirror } from "../lib/directory-secondary-category-sql.ts";

const stamp0 = "2026-11-18T20:00:00.000Z";
const stamp1 = "2026-11-18T20:01:00.000Z";
function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE directory_profiles (
    id INTEGER PRIMARY KEY, category TEXT NOT NULL, status TEXT NOT NULL, updated_at TEXT NOT NULL
  );
  CREATE TABLE directory_profile_additional_categories (
    profile_id INTEGER NOT NULL, category TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
    PRIMARY KEY(profile_id,category)
  );`);
  db.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?)").run(1,"treneri","published",stamp0);
  db.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?)").run(2,"veterinari","published",stamp0);
  db.prepare("INSERT INTO directory_profile_additional_categories VALUES (?,?,?,?)")
    .run(1,"vencenie",stamp0,"owner");
  db.prepare("INSERT INTO directory_profile_additional_categories VALUES (?,?,?,?)")
    .run(2,"hotely-a-opatrovanie",stamp0,"owner");
  const list = (id) => db.prepare(
    "SELECT category FROM directory_profile_additional_categories WHERE profile_id=? ORDER BY category",
  ).all(id).map(x=>x.category);
  const edit = ({id=1,category="treneri",was=stamp0,now=stamp1,submitted}) => {
    const statements=planDirectorySecondaryCategorySqlMirror({
      profileId:id,primaryCategory:category,submitted,updatedAt:now,actor:"owner",
    });
    db.exec("BEGIN TRANSACTION");
    try {
      const result=db.prepare(
        "UPDATE directory_profiles SET updated_at=?,category=? WHERE id=? AND updated_at=? RETURNING id",
      ).get(now,category,id,was);
      for(const entry of statements) {
        const statement=db.prepare(entry.sql);
        if(entry.sql.startsWith("SELECT"))statement.get(...entry.bindings);
        else statement.run(...entry.bindings);
      }
      db.exec("COMMIT");
      return result;
    } catch(error) {
      db.exec("ROLLBACK");
      throw error;
    }
  };
  return {db,list,edit};
}

test("explicit categories update SQL atomically without touching other profiles",()=>{
  const f=fixture();
  try {
    const result=f.edit({submitted:["hotely-a-opatrovanie","treneri","hotely-a-opatrovanie","vencenie"]});
    assert.equal(result.id,1);
    assert.deepEqual(f.list(1),["hotely-a-opatrovanie","vencenie"]);
    assert.deepEqual(f.list(2),["hotely-a-opatrovanie"]);
    assert.equal(f.db.prepare("SELECT updated_at FROM directory_profiles WHERE id=1").get().updated_at,stamp1);
  } finally {f.db.close();}
});

test("explicit [] removes ONLY secondary categories of edited profile",()=>{
  const f=fixture();
  try {
    f.edit({submitted:[]});
    assert.deepEqual(f.list(1),[]);
    assert.deepEqual(f.list(2),["hotely-a-opatrovanie"]);
    assert.equal(f.db.prepare("SELECT category FROM directory_profiles WHERE id=1").get().category,"treneri");
  } finally {f.db.close();}
});

test("stale or non-existing canonical update fails and rolls back the entire batch",()=>{
  const f=fixture();
  try {
    assert.throws(()=>f.edit({was:"outdated",submitted:["fyzioterapia"]}),/malformed JSON|CAS_CONFLICT/);
    assert.deepEqual(f.list(1),["vencenie"]);
    assert.equal(f.db.prepare("SELECT updated_at FROM directory_profiles WHERE id=1").get().updated_at,stamp0);
    assert.throws(()=>f.edit({id:999,submitted:["vencenie"]}),/malformed JSON|CAS_CONFLICT/);
    assert.deepEqual(f.list(2),["hotely-a-opatrovanie"]);
  } finally {f.db.close();}
});

test("invalid or absent categories cannot be treated as a clear",()=>{
  const base={profileId:1,primaryCategory:"treneri",updatedAt:stamp1,actor:"owner"};
  assert.throws(()=>planDirectorySecondaryCategorySqlMirror({...base,submitted:undefined}),/INVALID_CATEGORY/);
  assert.throws(()=>planDirectorySecondaryCategorySqlMirror({...base,submitted:["not-a-category"]}),/INVALID_CATEGORY/);
  assert.throws(()=>planDirectorySecondaryCategorySqlMirror({...base,submitted:["vencenie"],profileId:0}),/INVALID_ID/);
  assert.throws(()=>planDirectorySecondaryCategorySqlMirror({...base,submitted:["vencenie"],primaryCategory:"other"}),/INVALID_PRIMARY/);
});

test("Admin writer invokes the planner only for an explicit submitted category change",()=>{
  const store=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
  // 0173 uses the same D1 batch for SEO/qualifications. Preserve the
  // 0170 invariant: secondary categories change ONLY when explicitly supplied.
  assert.match(store,/if \\(payload\\.additionalCategories !== undefined \\|\\| editorialMirror\\.length > 0\\)/);
  assert.match(store,/const mirror = payload\\.additionalCategories === undefined \\? \\[\\] :/);
  assert.match(store,/planDirectorySecondaryCategorySqlMirror\(/);
  assert.match(store,/database\.batch\(\[/);
  assert.match(store,/const canonicalStatement = buildManagedDirectoryProfileUpdateStatement\(/);
});
