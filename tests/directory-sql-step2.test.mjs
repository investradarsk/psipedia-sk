
import assert from "node:assert/strict";
import test from "node:test";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {step2Plan,step2Sql} from "../lib/directory-sql-step2-plan.mjs";
const sid="84e0664c-ca47-405f-9d54-31b20287bc8c",pid="a1111111-2222-3333-4444-555555555555";
const rich=v=>({type:"rich_text",rich_text:[{plain_text:v}]});
const row=(extra={})=>({id:101,category:"veterinari",status:"published",
  updated_at:"2026-11-20T10:00:00Z",notion_page_id:pid,
  source_data_json:'{"_psipedia_trainer_breed_ids":[]}',services_json:'["Vyšetrenia"]',
  thumbnail_display_json:'{"mode":"crop","x":50,"y":30,"zoom":1.2}',
  detail_display_json:null,partner_active:0,sql_review_locked:0,legacy_review_locked:0,tombstone:0,...extra});
const page=()=>({id:pid,parent:{data_source_id:sid},last_edited_time:"2026-11-20T11:00:00Z",
  properties:{"Psipedia ID":rich("101"),"Zdroj dát":rich("Notion aktuálne"),"Služby":rich("Vyšetrenia")}});
test("matched Notion editorial and Admin technical remain distinct",()=>{
  const p=step2Plan(row(),page(),sid);
  assert.equal(p.ok,true);
  assert(p.fields.some(x=>x[0]==="Zdroj dát"));
  assert.deepEqual(p.lists[0].values,[]);
  assert.deepEqual(p.services,["Vyšetrenia"]);
  assert.equal(p.displays.length,1);
});
test("partner and reviewed locks block Notion without losing Admin technical",()=>{
  for(const key of ["partner_active","sql_review_locked","legacy_review_locked"]){
    const p=step2Plan(row({[key]:1}),page(),sid);
    assert.equal(p.notionRevision,null);
    assert(!p.fields.some(x=>x[0]==="Zdroj dát"));
    assert.equal(p.displays.length,1);
  }
});
test("corrupt historical metadata is refused, not interpreted as empty",()=>{
  assert.equal(step2Plan(row({source_data_json:"{"}),page(),sid).ok,false);
});
test("isolated 0176 schema accepts idempotent STAGED only",()=>{
  const db=new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys=ON");
  db.exec("CREATE TABLE directory_profiles(id INTEGER PRIMARY KEY,updated_at TEXT NOT NULL,status TEXT NOT NULL,description TEXT NOT NULL)");
  const sql=readFileSync(new URL("../db/isolated/directory_admin_sql_completion.sql",import.meta.url),"utf8");
  for(const block of sql.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean))db.exec(block);
  db.exec("INSERT INTO directory_profiles VALUES(101,'2026-11-20T10:00:00Z','published','keep')");
  const p=step2Plan(row(),page(),sid);
  for(const s of step2Sql(p,"2026-11-20T12:00:00Z","test"))db.prepare(s.sql).run(...s.params);
  for(const s of step2Sql(p,"2026-11-20T12:00:00Z","test"))db.prepare(s.sql).run(...s.params);
  assert.equal(db.prepare("SELECT state FROM directory_profile_sql_cutover_state").get().state,"STAGED");
  assert.equal(db.prepare("SELECT description FROM directory_profiles").get().description,"keep");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_extra_list_state").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_extra_list_items").get().n,0);
  db.close();
});
