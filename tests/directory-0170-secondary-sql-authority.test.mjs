import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  DIRECTORY_ADDITIONAL_CATEGORIES_KEY,
  DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY,
  directoryCategoryMembershipSql,
  directorySecondaryCategoriesSqlConfirmed,
} from "../lib/directory-multi-category.ts";
import {
  planDirectorySecondaryCategoryCreateSqlMirror,
  planDirectorySecondaryCategorySqlMirror,
} from "../lib/directory-secondary-category-sql.ts";

function setup() {
  const db=new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE directory_profiles ("+
      "id INTEGER PRIMARY KEY, category TEXT NOT NULL, slug TEXT NOT NULL,"+
      "status TEXT NOT NULL,source_data_json TEXT NOT NULL,"+
      "created_at TEXT NOT NULL,updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,"+
      "UNIQUE(category,slug));"+
    "CREATE TABLE directory_profile_additional_categories ("+
      "profile_id INTEGER NOT NULL,category TEXT NOT NULL,"+
      "updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,"+
      "PRIMARY KEY(profile_id,category));"
  );
  const legacy = (cats,confirmed=false)=>JSON.stringify({
    [DIRECTORY_ADDITIONAL_CATEGORIES_KEY]:JSON.stringify(cats),
    ...(confirmed?{[DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY]:"1"}:{}),
  });
  const add=(id,primary,cats,confirmed=false)=>{
    db.prepare("INSERT INTO directory_profiles VALUES (?,?,?,?,?,?,?,?)").run(
      id,primary,"slug-"+id,"published",legacy(cats,confirmed),
      "2026-11-18T20:00:00Z","2026-11-18T20:00:00Z","test",
    );
  };
  const select=category=>db.prepare(
    "SELECT id FROM directory_profiles WHERE status='published' AND "+
    directoryCategoryMembershipSql()+" ORDER BY id"
  ).all(category,category).map(row=>row.id);
  return {db,legacy,add,select};
}

test("SQL category membership reads current SQL regardless of a historical JSON marker",()=>{
  const f=setup();
  try {
    f.add(1,"treneri",["fyzioterapia"]); // historic JSON only
    f.add(2,"treneri",["fyzioterapia"],true); // confirmed explicit empty
    f.add(3,"veterinari",["hotely-a-opatrovanie"],true);
    f.add(4,"veterinari",["hotely-a-opatrovanie"]); // historic fallback
    f.db.prepare("INSERT INTO directory_profile_additional_categories VALUES(?,?,?,?)")
      .run(3,"vencenie","2026-11-18T20:00:00Z","test");
    // A stale SQL shadow without the marker NEVER overrides old JSON.
    f.db.prepare("INSERT INTO directory_profile_additional_categories VALUES(?,?,?,?)")
      .run(4,"vencenie","2026-11-18T20:00:00Z","test");
    assert.deepEqual(f.select("fyzioterapia"),[]);
    assert.deepEqual(f.select("vencenie"),[3,4]);
    assert.deepEqual(f.select("hotely-a-opatrovanie"),[]);
    assert.deepEqual(f.select("veterinari"),[3,4]);
    assert.deepEqual(f.select("treneri"),[1,2]);
  } finally {f.db.close();}
});

test("SQL categories remain authoritative even with invalid historical JSON",()=>{
  const f=setup();
  try {
    f.add(1,"treneri",["vencenie"]);
    f.db.prepare("UPDATE directory_profiles SET source_data_json='not json' WHERE id=1").run();
    f.db.prepare("INSERT INTO directory_profile_additional_categories VALUES(?,?,?,?)")
      .run(1,"vencenie","2026-11-18T20:00:00Z","test");
    assert.deepEqual(f.select("vencenie"),[1]);
    assert.deepEqual(f.select("treneri"),[1]);
    assert.equal(directorySecondaryCategoriesSqlConfirmed(null),false);
    assert.equal(directorySecondaryCategoriesSqlConfirmed({
      [DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY]:"1",
    }),true);
    assert.equal(directorySecondaryCategoriesSqlConfirmed({
      [DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY]:1,
    }),false);
    assert.throws(()=>directoryCategoryMembershipSql("x;DROP"),/Invalid SQL table alias/);
    assert.match(directoryCategoryMembershipSql("linked_profile"),/linked_profile\.id/);
  }finally{f.db.close();}
});

test("Admin owner update writes marker + SQL and explicit clear together",()=>{
  const f=setup();
  try {
    f.add(1,"treneri",["vencenie"]);
    const update=(cats,now)=>{
      const stmt=planDirectorySecondaryCategorySqlMirror({
        profileId:1,primaryCategory:"treneri",submitted:cats,updatedAt:now,actor:"admin",
      });
      f.db.exec("BEGIN");
      try {
        const json=f.legacy(cats,true);
        f.db.prepare(
          "UPDATE directory_profiles SET source_data_json=?,updated_at=? WHERE id=1 RETURNING id",
        ).get(json,now);
        for(const part of stmt) {
          const q=f.db.prepare(part.sql);
          if(part.sql.startsWith("SELECT"))q.get(...part.bindings);
          else q.run(...part.bindings);
        }
        f.db.exec("COMMIT");
      } catch(error){f.db.exec("ROLLBACK");throw error;}
    };
    update(["fyzioterapia","vencenie"],"2026-11-18T20:01:00Z");
    assert.deepEqual(f.select("fyzioterapia"),[1]);
    update([],"2026-11-18T20:02:00Z");
    assert.deepEqual(f.select("fyzioterapia"),[]);
    assert.deepEqual(f.select("vencenie"),[]);
    assert.deepEqual(f.select("treneri"),[1]);
  }finally{f.db.close();}
});

test("new-profile SQL plan writes all secondary rows to the SAME newly created ID",()=>{
  const f=setup();
  try {
    const now="2026-11-18T20:03:00Z";
    const plan=planDirectorySecondaryCategoryCreateSqlMirror({
      slug:"nova-sluzba",category:"treneri",submitted:["vencenie","fyzioterapia"],
      createdAt:now,actor:"admin",
    });
    f.db.exec("BEGIN");
    try {
      f.db.prepare("INSERT INTO directory_profiles (category,slug,status,source_data_json,created_at,updated_at,updated_by) VALUES (?,?,?,?,?,?,?) RETURNING id")
        .get("treneri","nova-sluzba","published",f.legacy(["vencenie","fyzioterapia"],true),now,now,"admin");
      for(const part of plan){
        const q=f.db.prepare(part.sql);
        if(part.sql.startsWith("SELECT"))q.get(...part.bindings);
        else q.run(...part.bindings);
      }
      f.db.exec("COMMIT");
    }catch(error){f.db.exec("ROLLBACK");throw error;}
    const rows=f.db.prepare(
      "SELECT category,profile_id FROM directory_profile_additional_categories ORDER BY category",
    ).all();
    assert.equal(rows.length,2);
    assert.equal(rows[0].profile_id,rows[1].profile_id);
    assert.equal(rows[0].profile_id,1);
    assert.deepEqual(f.select("fyzioterapia"),[1]);
    assert.deepEqual(f.select("vencenie"),[1]);
  }finally{f.db.close();}
});

test("failed create cannot leave orphan SQL membership",()=>{
  const f=setup();
  try{
    const now="2026-11-18T20:03:00Z";
    const plan=planDirectorySecondaryCategoryCreateSqlMirror({
      slug:"missing",category:"treneri",submitted:["vencenie"],createdAt:now,actor:"admin",
    });
    f.db.exec("BEGIN");
    try{
      for(const part of plan) {
        const q=f.db.prepare(part.sql);
        if(part.sql.startsWith("SELECT"))q.get(...part.bindings);
        else q.run(...part.bindings);
      }
      assert.fail("Expected failed CAS");
    }catch(error){
      f.db.exec("ROLLBACK");
      assert.match(String(error),/malformed JSON|CAS_CONFLICT/);
    }
    assert.equal(f.db.prepare("SELECT COUNT(*) AS n FROM directory_profile_additional_categories").get().n,0);
  }finally{f.db.close();}
});

test("Admin, Notion and creation paths all have atomic SQL authority receipts",()=>{
  const store=readFileSync(new URL("../lib/directory-store.ts",import.meta.url),"utf8");
  const notion=readFileSync(new URL("../lib/notion-directory-sync.ts",import.meta.url),"utf8");
  assert.match(store,/payload\.additionalCategories !== undefined,/);
  assert.match(store,/sqlCategoriesConfirmed/);
  assert.match(store,/planDirectorySecondaryCategoryCreateSqlMirror/);
  assert.match(notion,/DIRECTORY_ADDITIONAL_CATEGORIES_SQL_CONFIRMED_KEY/);
  assert.match(notion,/planDirectorySecondaryCategorySqlMirror\(/);
  assert.match(notion,/const results = await input\.database\.batch\(\[/);
});
