import assert from "node:assert/strict";
import { test } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyDirectorySqlCutoverPatch, DirectorySqlCutoverConflict,
  planDirectorySqlCutoverPatch,
} from "../lib/directory-sql-cutover-write.ts";

const proposal=readFileSync(fileURLToPath(new URL(
  "../docs/proposals/DIRECTORY-HELP-EVENTS-SQL-UNIFICATION-PHASE-2-DRAFT.sql",import.meta.url)),
  "utf8");
const before="2026-11-17T18:00:00.000Z";
const after="2026-11-17T18:01:00.000Z";
const actor="Admin";
function fixture() {
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles ("+
    "id INTEGER PRIMARY KEY,category TEXT NOT NULL,status TEXT NOT NULL,"+
    "updated_at TEXT NOT NULL,updated_by TEXT NOT NULL,source_data_json TEXT NOT NULL)");
  db.exec(proposal);
  db.prepare("INSERT INTO directory_profiles VALUES (1,'veterinari','published',?,?,'{\"old\":\"keep\"}')")
    .run(before,"editor");
  return db;
}
function d1(db) {
  return {
    prepare(sql) {return {bind(...args) {return {
      sql,args,first:async()=>db.prepare(sql).get(...args)??null,
    };}};},
    async batch(statements) {
      const responses=[];
      db.exec("BEGIN");
      try {
        for (const statement of statements) {
          const prepared=db.prepare(statement.sql);
          if (/\bRETURNING\b/i.test(statement.sql) || /^SELECT\s/i.test(statement.sql)) {
            const rows=prepared.all(...statement.args);
            responses.push({results:rows,meta:{changes:rows.length}});
          } else {
            const changes=prepared.run(...statement.args).changes;
            responses.push({results:[],meta:{changes}});
          }
        }
        db.exec("COMMIT");
      } catch(error) {db.exec("ROLLBACK");throw error;}
      return responses;
    },
  };
}
function patch(extra={}) {
  return {
    profileId:1,category:"veterinari",expectedUpdatedAt:before,
    nextUpdatedAt:after,actor,...extra,
  };
}
test("CAS transaction persists selected SQL fields and keeps every unrelated value",async()=>{
  const db=fixture();
  try {
    const result=await applyDirectorySqlCutoverPatch(d1(db),patch({
      contacts:{publicPhone:"abc",publicEmail:"",facebookUrl:"https://example.invalid/page"},
      additionalCategories:["treneri"],
      facts:{"Ordinačné hodiny":"Po-Pi 9-17","Pokrytie":"online"},
      filters:{"veterinari.emergency":"no"},
    }));
    assert.equal(result.profileId,1);
    assert.equal(result.fields,7);
    const row=db.prepare("SELECT * FROM directory_profiles WHERE id=1").get();
    assert.equal(row.public_phone,"abc");
    assert.equal(row.public_email,"");
    assert.equal(row.facebook_url,"https://example.invalid/page");
    assert.equal(row.instagram_url,null);
    assert.equal(row.source_data_json,'{"old":"keep"}');
    assert.equal(row.updated_at,after);
    assert.equal(db.prepare("SELECT category FROM directory_profile_additional_categories WHERE profile_id=1").get().category,"treneri");
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_public_facts WHERE field_key='Pokrytie'").get().value_text,"online");
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_filter_values WHERE filter_id='veterinari.emergency'").get().value_text,"no");
  } finally {db.close();}
});
test("stale versions never touch contacts, categories, facts or filters",async()=>{
  const db=fixture();
  try {
    db.exec("UPDATE directory_profiles SET updated_at='2026-11-17T18:00:30.000Z' WHERE id=1");
    await assert.rejects(()=>applyDirectorySqlCutoverPatch(d1(db),patch({
      contacts:{publicPhone:"unsafe"},additionalCategories:["treneri"],
      facts:{"Pokrytie":"unsafe"},filters:{"veterinari.emergency":"yes"},
    })),DirectorySqlCutoverConflict);
    assert.equal(db.prepare("SELECT public_phone FROM directory_profiles WHERE id=1").get().public_phone,null);
    for (const table of [
      "directory_profile_additional_categories","directory_profile_public_facts",
      "directory_profile_filter_values",
    ]) assert.equal(db.prepare("SELECT COUNT(*) AS n FROM "+table).get().n,0,table);
  } finally {db.close();}
});
test("a concurrent revision collision between preflight and CAS fails the entire batch",async()=>{
  const db=fixture();
  try {
    const adapter=d1(db);
    const batch=adapter.batch.bind(adapter);
    adapter.batch=async statements=>{
      // Simulate another writer committing the proposed timestamp after the
      // preflight. The optimistic UPDATE affects 0 rows, while the relation
      // guard alone would accidentally match the coincident revision.
      db.prepare("UPDATE directory_profiles SET updated_at=? WHERE id=1").run(after);
      return batch(statements);
    };
    await assert.rejects(()=>applyDirectorySqlCutoverPatch(adapter,patch({
      contacts:{publicPhone:"wrong"},additionalCategories:["treneri"],
    })),/malformed JSON/);
    assert.equal(db.prepare("SELECT public_phone FROM directory_profiles").get().public_phone,null);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_additional_categories").get().n,0);
  }finally{db.close();}
});
test("one-field update does not delete other rows or silently clear unrelated contacts",async()=>{
  const db=fixture();
  try {
    db.exec("UPDATE directory_profiles SET public_phone='old',public_email='keep' WHERE id=1");
    db.prepare("INSERT INTO directory_profile_public_facts VALUES (1,'Ordinačné hodiny','keep',?,?)").run(before,actor);
    await applyDirectorySqlCutoverPatch(d1(db),patch({
      contacts:{publicPhone:"new"},
    }));
    const row=db.prepare("SELECT public_phone,public_email FROM directory_profiles").get();
    assert.equal(row.public_phone,"new");
    assert.equal(row.public_email,"keep");
    assert.equal(db.prepare("SELECT value_text FROM directory_profile_public_facts").get().value_text,"keep");
  }finally{db.close();}
});
test("explicit [] category clear keeps primary category and all other records",async()=>{
  const db=fixture();
  try {
    db.prepare("INSERT INTO directory_profile_additional_categories VALUES (1,'treneri',?,?)").run(before,actor);
    await applyDirectorySqlCutoverPatch(d1(db),patch({additionalCategories:[]}));
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM directory_profile_additional_categories").get().n,0);
    assert.equal(db.prepare("SELECT category FROM directory_profiles WHERE id=1").get().category,"veterinari");
  } finally {db.close();}
});
test("unsafe category, unrelated Notion filter, relation-owned fact and stale tokens fail before a write",()=>{
  for (const candidate of [
    patch({additionalCategories:["wrong"],contacts:{publicPhone:"x"}}),
    patch({additionalCategories:["veterinari"],contacts:{publicPhone:"x"}}),
    patch({filters:{"treneri.individual_training":"yes"}}),
    patch({facts:{"Plemeno":"wrong relation"}}),
    patch({facts:{"Pohotovosť":"duplicate Notion select"}}),
    patch({filters:{"veterinari.emergency":"maybe"}}),
    patch({contacts:{unapproved:"x"}}),
    patch({expectedUpdatedAt:after,nextUpdatedAt:after,contacts:{publicPhone:"x"}}),
    patch({}),
  ]) assert.throws(()=>planDirectorySqlCutoverPatch(candidate));
});
test("prepared statements parameterize arbitrary text, never build it into SQL identifiers",()=>{
  const value="' ; DROP TABLE directory_profiles; --";
  const plan=planDirectorySqlCutoverPatch(patch({
    contacts:{publicPhone:value},facts:{"Pokrytie":value},
  }));
  assert.ok(plan.statements.some(x=>x.bindings.includes(value)));
  for (const s of plan.statements) {
    assert.ok(!s.sql.includes(value));
    assert.ok(!/\bDROP TABLE\b/i.test(s.sql));
  }
});
test("Notion and Admin use the same per-field contract, but production handlers cannot accidentally activate it",()=>{
  const admin=planDirectorySqlCutoverPatch(patch({contacts:{publicPhone:"same"}}));
  const notion=planDirectorySqlCutoverPatch(patch({actor:"Notion",contacts:{publicPhone:"same"}}));
  assert.equal(admin.statements[0].sql,notion.statements[0].sql);
  assert.equal(admin.statements.length,notion.statements.length);
  assert.equal(admin.statements[0].bindings.at(-4),"Admin");
  assert.equal(notion.statements[0].bindings.at(-4),"Notion");
  const adminRoute=readFileSync(fileURLToPath(new URL(
    "../app/api/admin/directory/[id]/route.ts",import.meta.url)),"utf8");
  assert.doesNotMatch(adminRoute,/applyDirectorySqlCutoverPatch/);
});
