import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const sql=readFileSync(new URL("../scripts/maintenance/help-legacy-140.sql",import.meta.url),"utf8");
const approved=[
 "ceskoslovensky-kastracny-program","pomoc-mesto-dolny-kubin","pomoc-mesto-handlova",
 "pomoc-mesto-malacky","pomoc-mesto-martin-mestsky-urad-martin",
 "pomoc-mesto-mestsky-urad-kolarovo","pomoc-mesto-revuca",
 "pomoc-mesto-skalica","pomoc-obec-priepasne","pomoc-td-s-r-o"
];
function makeDb() {
 const db=new DatabaseSync(":memory:");
 db.exec("PRAGMA foreign_keys=ON");
 db.exec(`
 CREATE TABLE help_cases(id INTEGER PRIMARY KEY, slug TEXT, title TEXT,category TEXT,status TEXT);
 CREATE TABLE adoption_dogs(id INTEGER PRIMARY KEY,slug TEXT);
 CREATE TABLE help_organizations(id INTEGER PRIMARY KEY,slug TEXT);
 CREATE TABLE lost_found_dog_reports(id INTEGER PRIMARY KEY,slug TEXT);
 CREATE TABLE notion_agenda_sync(agenda TEXT,entity_id INTEGER,notion_page_id TEXT,
   PRIMARY KEY(agenda,notion_page_id),UNIQUE(agenda,entity_id));
 CREATE TABLE notion_agenda_targets(agenda TEXT PRIMARY KEY,data_source_id TEXT);
 CREATE TABLE admin_record_tombstones(
   kind TEXT,record_id INTEGER,record_slug TEXT,record_external_key TEXT,
   record_name TEXT,record_category TEXT,notion_page_id TEXT UNIQUE,notion_data_source_id TEXT,
   notion_targets_json TEXT NOT NULL,state TEXT,error_code TEXT,created_by TEXT,
   created_at TEXT,updated_at TEXT,completed_at TEXT,
   PRIMARY KEY(kind,record_id));
 CREATE TABLE partner_help_claims(id TEXT PRIMARY KEY, help_case_id INTEGER
    REFERENCES help_cases(id) ON DELETE RESTRICT);
 CREATE TABLE notion_manual_transfer_items(notion_page_id TEXT,status TEXT,last_error_code TEXT,
   finished_at TEXT,updated_at TEXT);
 CREATE TABLE notion_webhook_inbox(page_id TEXT);
 CREATE TABLE notion_profile_field_baselines(agenda TEXT,entity_id INTEGER);
 CREATE TABLE admin_record_publication_guards(kind TEXT,record_id INTEGER);
 CREATE TRIGGER admin_guarded_help_delete BEFORE DELETE ON help_cases
   WHEN NOT EXISTS(SELECT 1 FROM admin_record_tombstones
    WHERE kind='help' AND record_id=OLD.id AND state='READY_LOCAL')
   BEGIN SELECT RAISE(ABORT,'USE_VERIFIED_LIFECYCLE_DELETE'); END;
 CREATE TRIGGER admin_deleted_help_insert BEFORE INSERT ON help_cases
   WHEN EXISTS(SELECT 1 FROM admin_record_tombstones
    WHERE kind='help' AND record_slug=NEW.slug)
   BEGIN SELECT RAISE(ABORT,'RECORD_TOMBSTONED'); END;
 INSERT INTO notion_agenda_targets(agenda,data_source_id)
  VALUES('help-cases','one-historic-notion-database');
 INSERT INTO help_cases(id,slug,title,category,status)
  VALUES(9000,'generic-help','Current help','zbierky','published');
 `);
 const insert=db.prepare("INSERT INTO help_cases(id,slug,title,category,status) VALUES(?,?,?,?,?)");
 const map=db.prepare("INSERT INTO notion_agenda_sync(agenda,entity_id,notion_page_id) VALUES('help-cases',?,?)");
 const adoption=db.prepare("INSERT INTO adoption_dogs(id,slug) VALUES(?,?)");
 const org=db.prepare("INSERT INTO help_organizations(id,slug) VALUES(?,?)");
 for(let i=1;i<=36;i++){
  const slug="adoption-"+i;
  insert.run(i,slug,"Historic adoption "+i,"adopcia","published");
  adoption.run(i,slug);map.run(i,"adopt-page-"+i);
 }
 for(let i=1;i<=104;i++){
  const id=1000+i,slug=i<=94?"shelter-"+i:approved[i-95];
  insert.run(id,slug,"Historic shelter "+i,"utulky","published");
  if(i<=94)org.run(i,slug);
  map.run(id,"shelter-page-"+i);
 }
 db.exec("INSERT INTO notion_webhook_inbox(page_id) VALUES('adopt-page-1')");
 db.exec("INSERT INTO notion_profile_field_baselines(agenda,entity_id) VALUES('help-cases',1)");
 db.exec("INSERT INTO admin_record_publication_guards(kind,record_id) VALUES('help',1)");
 db.exec("INSERT INTO notion_manual_transfer_items(notion_page_id,status) VALUES('adopt-page-1','PENDING')");
 return db;
}
function one(db,q){return Number(db.prepare(q).get()?.n)}
function apply(db) {
 db.exec("BEGIN");
 try { db.exec(sql); db.exec("COMMIT"); }
 catch(e) {db.exec("ROLLBACK");throw e}
}
test("removes exactly 140 historical SQL-only copies, not current Help or canonical profiles",()=>{
 const db=makeDb();
 assert.equal(one(db,"SELECT COUNT(*) n FROM help_cases"),141);
 apply(db);
 assert.equal(one(db,"SELECT COUNT(*) n FROM help_cases"),1);
 assert.equal(one(db,"SELECT COUNT(*) n FROM help_cases WHERE slug='generic-help'"),1);
 assert.equal(one(db,"SELECT COUNT(*) n FROM adoption_dogs"),36);
 assert.equal(one(db,"SELECT COUNT(*) n FROM help_organizations"),94);
 assert.equal(one(db,"SELECT COUNT(*) n FROM admin_record_tombstones WHERE state='COMPLETE'"),140);
 assert.equal(one(db,"SELECT COUNT(*) n FROM notion_agenda_sync"),0);
 assert.equal(one(db,"SELECT COUNT(*) n FROM notion_webhook_inbox"),0);
 assert.equal(one(db,"SELECT COUNT(*) n FROM notion_profile_field_baselines"),0);
 assert.equal(one(db,"SELECT COUNT(*) n FROM notion_manual_transfer_items WHERE status='SKIPPED'"),1);
 assert.equal(one(db,"SELECT COUNT(*) n FROM sqlite_master WHERE type='trigger' AND name='admin_guarded_help_delete'"),1);
 assert.throws(()=>db.exec("INSERT INTO help_cases VALUES(5001,'adoption-1','Resurrection','adopcia','published')"),/RECORD_TOMBSTONED|UNIQUE|constraint/i);
 const marker=db.prepare("SELECT record_external_key,notion_page_id FROM admin_record_tombstones WHERE record_id=1 AND kind='help'").get();
 assert.equal(marker.record_external_key,"HISTORICAL_SQL_ONLY_NOTION_RETAINED");
 assert.equal(marker.notion_page_id,"adopt-page-1");
 db.close();
});
test("a failed eligibility check leaves D1 entirely unchanged after rollback",()=>{
 for(const [name,mutate] of [
  ["missing-mapping",db=>db.exec("DELETE FROM notion_agenda_sync WHERE agenda='help-cases' AND entity_id=1")],
  ["partner-claim",db=>db.exec("INSERT INTO partner_help_claims(id,help_case_id) VALUES('p',1)")],
  ["missing-adoption",db=>db.exec("DELETE FROM adoption_dogs WHERE slug='adoption-1'")],
  ["draft-status",db=>db.exec("UPDATE help_cases SET status='draft' WHERE id=1")],
  ["legacy-lost",db=>db.exec("INSERT INTO lost_found_dog_reports(id,slug) VALUES(1,'historic-lost')")],
  ["running-transfer",db=>db.exec("INSERT INTO notion_manual_transfer_items(notion_page_id,status) VALUES('adopt-page-1','RUNNING')")],
  ["shared-notion-page",db=>db.exec("INSERT INTO notion_agenda_sync(agenda,entity_id,notion_page_id) VALUES('adoptions',300,'adopt-page-1')")],
  ["renamed-shelter",db=>db.exec("UPDATE help_cases SET slug='unexpected-removed-shelter' WHERE id=1104")]
 ]) {
  const db=makeDb();
  mutate(db);
  assert.throws(()=>apply(db),/constraint|CHECK|FOREIGN KEY/i,name);
  assert.equal(one(db,"SELECT COUNT(*) n FROM help_cases"),141);
  assert.equal(one(db,"SELECT COUNT(*) n FROM admin_record_tombstones"),0);
  assert.equal(one(db,"SELECT COUNT(*) n FROM notion_agenda_sync WHERE agenda='help-cases'"),
   name==="missing-mapping"?139:140);
  db.close();
 }
});
test("ordinary raw legacy DELETE is still prohibited by existing trigger",()=>{
 const db=makeDb();
 assert.throws(()=>db.exec("DELETE FROM help_cases WHERE id=1"),/USE_VERIFIED_LIFECYCLE_DELETE/);
 db.close();
});
test("no Notion mutation or technical JSON alteration commands in the one-off SQL",()=>{
 assert.doesNotMatch(sql,/ALTER\s+TABLE|source_data_json|gallery_json|seo_json|BEGIN\s+TRANSACTION|DROP\s+TRIGGER|https?:/i);
 assert.match(sql,/admin_guarded_help_delete/);
 assert.match(sql,/HISTORICAL_SQL_ONLY_NOTION_RETAINED/);
});
