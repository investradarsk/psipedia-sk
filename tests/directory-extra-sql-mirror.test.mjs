import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync} from "node:fs";
import {planDirectoryExtraSqlTextMirror} from "../lib/directory-extra-sql-mirror.ts";
import {DIRECTORY_PRESENTATION_SQL,parseDirectoryPresentationSqlRead} from "../lib/directory-presentation-sql-read.ts";
function fixture(){
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec("CREATE TABLE directory_profiles (id INTEGER PRIMARY KEY,category TEXT,slug TEXT,updated_at TEXT,updated_by TEXT)");
 const sql=readFileSync(new URL("../db/isolated/directory_admin_sql_completion.sql",import.meta.url),"utf8");
 for(const block of sql.split("--> statement-breakpoint").map(x=>x.trim()).filter(Boolean)) db.exec(block);
 db.exec("INSERT INTO directory_profiles VALUES(4,'treneri','trainer','2026-11-21T00:00:00Z','notion')");
 return db;
}
test("trainer services prose has a single SQL scalar owner with explicit empty clear",()=>{
 const db=fixture();
 try{
  const identity={kind:"id",profileId:4,updatedAt:"2026-11-21T00:00:00Z",actor:"notion"};
  const edit=value=>{
   const plan=planDirectoryExtraSqlTextMirror({identity,fieldKey:"_psipedia_trainer_services_text",value});
   for(const stmt of plan)db.prepare(stmt.sql).run(...stmt.bindings);
  };
  edit("Skupinový výcvik");
  let projection=parseDirectoryPresentationSqlRead(db.prepare(DIRECTORY_PRESENTATION_SQL).get(4));
  assert.equal(projection.trainerServicesText,"Skupinový výcvik");
  edit("");
  projection=parseDirectoryPresentationSqlRead(db.prepare(DIRECTORY_PRESENTATION_SQL).get(4));
  assert.equal(projection.trainerServicesText,"");
  const before=db.prepare("SELECT COUNT(*) n FROM directory_profile_extra_fields").get().n;
  edit(undefined);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_extra_fields").get().n,before);
 }finally{db.close();}
});
test("stale profile revision cannot overwrite the current SQL trainer prose",()=>{
 const db=fixture();
 try{
  const plan=planDirectoryExtraSqlTextMirror({
    identity:{kind:"id",profileId:4,updatedAt:"obsolete",actor:"notion"},
    fieldKey:"_psipedia_trainer_services_text",value:"Wrong",
  });
  for(const stmt of plan)db.prepare(stmt.sql).run(...stmt.bindings);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM directory_profile_extra_fields").get().n,0);
 }finally{db.close();}
});
